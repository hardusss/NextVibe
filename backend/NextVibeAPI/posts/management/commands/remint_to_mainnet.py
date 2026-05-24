"""
Django Management Command: remint_to_mainnet
============================================

Re-mints all existing cNFTs (post collections and OG avatars) to the mainnet
Merkle tree and collection configured in the nft-service environment.

Use this command when:
  - Migrating from devnet to mainnet for the first time
  - Replacing a Merkle tree (e.g. upgrading canopyDepth)
  - Recovering from a misconfigured collection address

How it works:
  1. Iterates over all UserCollection records (post cNFTs)
  2. Iterates over all OgAvatarMint records (OG avatar cNFTs)
  3. For each record, calls the nft-service /mint or /mint/og endpoint
  4. On success, overwrites asset_id and signature in the database

Prerequisites:
  - rich must be installed: pip install rich
  - nft-service must be running on localhost:3000
  - nft-service .env must contain the correct mainnet addresses:
      MERKLE_TREE_ADDRESS=<new mainnet tree>
      COLLECTION_ADDRESS=<new mainnet collection>
      OG_COLLECTION_ADDRESS=<new mainnet OG collection>
      HELIUS_RPC_URL=https://mainnet.helius-rpc.com/?api-key=...
  - The fee-payer wallet must have enough SOL to cover all mint transactions
    (estimate: ~0.000005 SOL per mint)

Usage:
  # Preview what will be processed without minting anything
  python manage.py remint_to_mainnet --dry-run

  # Re-mint everything (post cNFTs + OG avatars)
  python manage.py remint_to_mainnet

  # Re-mint only post cNFTs (UserCollection)
  python manage.py remint_to_mainnet --only posts

  # Re-mint only OG avatar cNFTs (OgAvatarMint)
  python manage.py remint_to_mainnet --only og

Notes:
  - Records with no wallet_address are skipped automatically.
  - Failed mints are logged and counted but do not stop the process.
  - A configurable delay between mints avoids RPC rate limiting.
  - The original asset_id is overwritten only on successful re-mint.
  - Old cNFTs remain on-chain; this command only updates the DB reference.
"""

import time
import requests
from django.core.management.base import BaseCommand, CommandError
from posts.models import UserCollection
from user.models import OgAvatarMint

from rich.console import Console
from rich.table import Table
from rich.panel import Panel
from rich.progress import Progress, SpinnerColumn, BarColumn, TextColumn, TimeElapsedColumn
from rich import box
from rich.text import Text
from rich.rule import Rule


# URL of the nft-service (Elysia server defined in nft-service/src/index.ts)
NFT_SERVICE_URL = "http://localhost:3000"

# Seconds to wait between consecutive mints to avoid hitting RPC rate limits.
# Increase this value if you see "429 Too Many Requests" errors from Helius.
DELAY_BETWEEN_MINTS: float = 1.5

# HTTP timeout in seconds for each mint request to nft-service
MINT_REQUEST_TIMEOUT: int = 60

console = Console()


class Command(BaseCommand):
    help = (
        "Re-mints all cNFTs (UserCollection + OgAvatarMint) to the mainnet "
        "Merkle tree and collection configured in the nft-service."
    )

    def add_arguments(self, parser):
        parser.add_argument(
            "--dry-run",
            action="store_true",
            default=False,
            help=(
                "Simulate the migration without calling nft-service or "
                "writing anything to the database. Useful for estimating "
                "the number of records that will be processed."
            ),
        )
        parser.add_argument(
            "--only",
            choices=["og", "posts"],
            default=None,
            help=(
                "Restrict migration to a single collection type. "
                "'posts' processes UserCollection only; "
                "'og' processes OgAvatarMint only. "
                "Omit to process both."
            ),
        )

    def handle(self, *args, **options):
        dry_run: bool = options["dry_run"]
        only: str | None = options["only"]

        # ── Header panel ────────────────────────────────────────────────────
        title = Text("NextVibe  ·  cNFT Re-mint to Mainnet", style="bold white")
        subtitle = "[yellow]DRY RUN — no changes will be made[/yellow]" if dry_run else "[green]LIVE — database will be updated[/green]"
        console.print(Panel.fit(
            f"{title}\n{subtitle}\n[dim]NFT service: {NFT_SERVICE_URL}[/dim]",
            border_style="bright_blue",
            padding=(1, 4),
        ))
        console.print()

        # Verify nft-service is reachable before starting
        if not dry_run:
            self._check_nft_service()

        results = {"success": 0, "skipped": 0, "failed": 0}
        failed_items: list[dict] = []

        if only != "og":
            self._remint_posts(dry_run, results, failed_items)

        if only != "posts":
            self._remint_og(dry_run, results, failed_items)

        self._print_summary(results, failed_items, dry_run)

    # -------------------------------------------------------------------------
    # Service health check
    # -------------------------------------------------------------------------

    def _check_nft_service(self) -> None:
        """
        Verify that nft-service is reachable before starting the migration.
        Raises CommandError if the service cannot be reached, preventing a
        partial migration where some records fail immediately.
        """
        with console.status("[bold cyan]Checking nft-service connection…[/bold cyan]"):
            try:
                requests.get(NFT_SERVICE_URL, timeout=5)
                console.print("[green]✓[/green] nft-service reachable\n")
            except requests.exceptions.ConnectionError:
                raise CommandError(
                    f"Cannot connect to nft-service at {NFT_SERVICE_URL}. "
                    "Make sure it is running:  bun run src/index.ts"
                )

    # -------------------------------------------------------------------------
    # Post cNFTs — UserCollection
    # -------------------------------------------------------------------------

    def _remint_posts(self, dry_run: bool, results: dict, failed_items: list) -> None:
        """
        Re-mints all UserCollection records by calling POST /mint on nft-service.

        Each UserCollection row represents a user who minted a post as a cNFT.
        The mint endpoint fetches metadata from the NextVibe API using postId
        and edition, so both fields must be present and valid.
        """
        console.print(Rule("[bold cyan]Post cNFTs — UserCollection[/bold cyan]"))

        qs = UserCollection.objects.select_related("user", "post").order_by("id")
        total = qs.count()
        console.print(f"  [dim]Found [bold]{total}[/bold] record(s)[/dim]\n")

        if total == 0:
            console.print("  [dim]Nothing to process.[/dim]\n")
            return

        with Progress(
            SpinnerColumn(),
            TextColumn("[progress.description]{task.description}"),
            BarColumn(bar_width=32),
            TextColumn("[progress.percentage]{task.percentage:>3.0f}%"),
            TextColumn("[dim]{task.completed}/{task.total}[/dim]"),
            TimeElapsedColumn(),
            console=console,
            transient=False,
        ) as progress:
            task = progress.add_task("[cyan]Minting posts…", total=total)

            for item in qs:
                wallet: str | None = getattr(item.user, "wallet_address", None)

                if not wallet:
                    progress.console.print(
                        f"  [yellow]⊘[/yellow]  UserCollection [dim]#{item.id}[/dim] — skipped (no wallet_address)"
                    )
                    results["skipped"] += 1
                    progress.advance(task)
                    continue

                progress.update(task, description=f"[cyan]post={item.post_id} edition={item.edition} {wallet[:8]}…[/cyan]")

                if dry_run:
                    progress.console.print(
                        f"  [dim]~[/dim]  UserCollection [dim]#{item.id}[/dim] | "
                        f"post=[bold]{item.post_id}[/bold] | edition=[bold]{item.edition}[/bold] | "
                        f"wallet=[dim]{wallet[:8]}…[/dim]  [yellow][dry-run][/yellow]"
                    )
                    results["success"] += 1
                    progress.advance(task)
                    continue

                try:
                    new_asset_id, signature = self._call_mint(
                        endpoint="/mint",
                        payload={
                            "recipient": wallet,
                            "postId": item.post_id,
                            "edition": item.edition,
                        },
                    )
                    item.asset_id = new_asset_id
                    item.signature = signature
                    item.save(update_fields=["asset_id", "signature"])

                    progress.console.print(
                        f"  [green]✓[/green]  UserCollection [dim]#{item.id}[/dim] → "
                        f"[bright_green]{new_asset_id}[/bright_green]"
                    )
                    results["success"] += 1
                    time.sleep(DELAY_BETWEEN_MINTS)

                except Exception as exc:
                    progress.console.print(
                        f"  [red]✗[/red]  UserCollection [dim]#{item.id}[/dim] — [red]{exc}[/red]"
                    )
                    failed_items.append({"type": "post", "id": item.id, "error": str(exc)})
                    results["failed"] += 1

                progress.advance(task)

        console.print()

    # -------------------------------------------------------------------------
    # OG avatar cNFTs — OgAvatarMint
    # -------------------------------------------------------------------------

    def _remint_og(self, dry_run: bool, results: dict, failed_items: list) -> None:
        """
        Re-mints all OgAvatarMint records by calling POST /mint/og on nft-service.

        Each OgAvatarMint row represents an early/founding user who claimed an
        OG edition badge. The mint endpoint generates personalised metadata
        using userId and edition.
        """
        console.print(Rule("[bold magenta]OG Avatar cNFTs — OgAvatarMint[/bold magenta]"))

        qs = OgAvatarMint.objects.select_related("user").order_by("id")
        total = qs.count()
        console.print(f"  [dim]Found [bold]{total}[/bold] record(s)[/dim]\n")

        if total == 0:
            console.print("  [dim]Nothing to process.[/dim]\n")
            return

        with Progress(
            SpinnerColumn(),
            TextColumn("[progress.description]{task.description}"),
            BarColumn(bar_width=32),
            TextColumn("[progress.percentage]{task.percentage:>3.0f}%"),
            TextColumn("[dim]{task.completed}/{task.total}[/dim]"),
            TimeElapsedColumn(),
            console=console,
            transient=False,
        ) as progress:
            task = progress.add_task("[magenta]Minting OG avatars…", total=total)

            for item in qs:
                wallet: str | None = getattr(item.user, "wallet_address", None)

                if not wallet:
                    progress.console.print(
                        f"  [yellow]⊘[/yellow]  OgAvatarMint [dim]#{item.id}[/dim] — skipped (no wallet_address)"
                    )
                    results["skipped"] += 1
                    progress.advance(task)
                    continue

                progress.update(task, description=f"[magenta]user={item.user_id} edition={item.edition} {wallet[:8]}…[/magenta]")

                if dry_run:
                    progress.console.print(
                        f"  [dim]~[/dim]  OgAvatarMint [dim]#{item.id}[/dim] | "
                        f"user=[bold]{item.user_id}[/bold] | edition=[bold]{item.edition}[/bold] | "
                        f"wallet=[dim]{wallet[:8]}…[/dim]  [yellow][dry-run][/yellow]"
                    )
                    results["success"] += 1
                    progress.advance(task)
                    continue

                try:
                    new_asset_id, signature = self._call_mint(
                        endpoint="/mint/og",
                        payload={
                            "recipient": wallet,
                            "userId": item.user_id,
                            "edition": item.edition,
                        },
                    )
                    item.asset_id = new_asset_id
                    item.signature = signature
                    item.save(update_fields=["asset_id", "signature"])

                    progress.console.print(
                        f"  [green]✓[/green]  OgAvatarMint [dim]#{item.id}[/dim] → "
                        f"[bright_green]{new_asset_id}[/bright_green]"
                    )
                    results["success"] += 1
                    time.sleep(DELAY_BETWEEN_MINTS)

                except Exception as exc:
                    progress.console.print(
                        f"  [red]✗[/red]  OgAvatarMint [dim]#{item.id}[/dim] — [red]{exc}[/red]"
                    )
                    failed_items.append({"type": "og", "id": item.id, "error": str(exc)})
                    results["failed"] += 1

                progress.advance(task)

        console.print()

    # -------------------------------------------------------------------------
    # Shared mint helper
    # -------------------------------------------------------------------------

    def _call_mint(self, endpoint: str, payload: dict) -> tuple[str, str]:
        """
        Calls the nft-service mint endpoint and returns (asset_id, signature).

        Args:
            endpoint: Either '/mint' (posts) or '/mint/og' (OG avatars).
            payload:  JSON body forwarded to nft-service.

        Returns:
            A tuple of (assetId, signature) strings from the nft-service response.

        Raises:
            Exception: If the HTTP request fails, the service returns an error,
                       or the expected fields are missing from the response.
        """
        try:
            response = requests.post(
                f"{NFT_SERVICE_URL}{endpoint}",
                json=payload,
                timeout=MINT_REQUEST_TIMEOUT,
            )
            response.raise_for_status()
            data = response.json()
        except requests.exceptions.Timeout:
            raise Exception(f"nft-service timed out after {MINT_REQUEST_TIMEOUT}s")
        except requests.exceptions.RequestException as exc:
            raise Exception(f"nft-service request error: {exc}")

        if not data.get("success"):
            raise Exception(data.get("error", "nft-service returned success=false"))

        asset_id: str | None = data.get("assetId")
        signature: str | None = data.get("signature")

        if not asset_id:
            raise Exception("nft-service response missing 'assetId'")

        return asset_id, signature or ""

    # -------------------------------------------------------------------------
    # Summary
    # -------------------------------------------------------------------------

    def _print_summary(self, results: dict, failed_items: list, dry_run: bool) -> None:
        """Prints a rich summary table and, if any, a failed-items breakdown."""

        # Stats table
        table = Table(box=box.ROUNDED, show_header=False, border_style="bright_blue", padding=(0, 2))
        table.add_column(style="dim")
        table.add_column(justify="right")

        table.add_row("✓  Completed", f"[bold green]{results['success']}[/bold green]")
        table.add_row("⊘  Skipped",   f"[bold yellow]{results['skipped']}[/bold yellow]")
        table.add_row(
            "✗  Failed",
            f"[bold red]{results['failed']}[/bold red]" if results["failed"] else f"[dim]{results['failed']}[/dim]",
        )

        label = "DRY RUN COMPLETE" if dry_run else "MIGRATION COMPLETE"
        console.print(Panel(table, title=f"[bold white]{label}[/bold white]", border_style="bright_blue", padding=(1, 4)))

        # Failed items breakdown
        if failed_items:
            console.print()
            console.print(Rule("[bold red]Failed items[/bold red]"))
            fail_table = Table(box=box.SIMPLE, border_style="red")
            fail_table.add_column("Type",  style="dim",      min_width=8)
            fail_table.add_column("ID",    style="bold",     min_width=6)
            fail_table.add_column("Error", style="red")
            for f in failed_items:
                fail_table.add_row(f["type"], str(f["id"]), f["error"])
            console.print(fail_table)
            console.print("[dim]Re-run with --only posts or --only og to retry failed records.[/dim]\n")