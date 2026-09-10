import time

from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand, CommandError

from user.src.seeker_verification import (
    SgtCheckError,
    check_sgt_onchain,
    grant_seeker_verified,
)


class Command(BaseCommand):
    help = (
        "Seeker Verified bootstrap. Pass 1 grants source='skr' to users whose "
        "Seed Vault username ends in .skr; pass 2 grants source='onchain' to "
        "wallets holding a Seeker Genesis Token (scanned through nft-service, "
        "which talks to Helius — the API key and service URL come from settings/"
        "env, nothing here). DB writes only, no push notifications. Users already "
        "seeker_verified are skipped, so the command is safe to re-run."
    )

    def add_arguments(self, parser):
        parser.add_argument(
            "--dry-run", action="store_true",
            help="Report what would be granted without writing to the DB.",
        )
        parser.add_argument(
            "--skr-only", action="store_true",
            help="Run only the .skr username pass (no on-chain scans).",
        )
        parser.add_argument(
            "--onchain-only", action="store_true",
            help="Run only the on-chain SGT scan pass.",
        )
        parser.add_argument(
            "--limit", type=int, metavar="N",
            help="Process at most N unverified users across both passes.",
        )
        parser.add_argument(
            "--sleep", type=float, default=0.2, metavar="SECONDS",
            help="Seconds to wait between Helius calls (default 0.2).",
        )

    def handle(self, *args, **options):
        if options["skr_only"] and options["onchain_only"]:
            raise CommandError("--skr-only and --onchain-only are mutually exclusive.")

        self.dry_run = options["dry_run"]
        if self.dry_run:
            self.stdout.write(self.style.NOTICE("dry-run: no DB writes"))

        self.counts = {
            "skr_granted": 0, "onchain_granted": 0,
            "already_used": 0, "not_found": 0, "skipped": 0,
        }
        self.errors = 0
        remaining = options["limit"] if options["limit"] is not None else float("inf")
        granted_ids = set()  # tracks dry-run grants the DB can't reflect
        User = get_user_model()

        if not options["onchain_only"]:
            candidates = User.objects.filter(username__iendswith=".skr").order_by("user_id")
            self.counts["skipped"] += candidates.filter(seeker_verified=True).count()
            for user in candidates.filter(seeker_verified=False):
                if remaining <= 0:
                    break
                remaining -= 1
                if self._grant(user, None, "skr"):
                    self.counts["skr_granted"] += 1
                    granted_ids.add(user.user_id)

        if not options["skr_only"]:
            candidates = (
                User.objects.filter(wallet_address__isnull=False)
                .exclude(wallet_address="")
                .exclude(user_id__in=granted_ids)
                .order_by("user_id")
            )
            self.counts["skipped"] += candidates.filter(seeker_verified=True).count()
            first = True
            for user in candidates.filter(seeker_verified=False):
                if remaining <= 0:
                    break
                remaining -= 1
                if not first:
                    time.sleep(options["sleep"])
                first = False
                try:
                    mint = check_sgt_onchain(user.wallet_address)
                except SgtCheckError as e:
                    self.errors += 1
                    self.stderr.write(
                        f"user={user.user_id} wallet={user.wallet_address} check failed: {e}"
                    )
                    continue
                if not mint:
                    self.counts["not_found"] += 1
                    continue
                if self._grant(user, mint, "onchain"):
                    self.counts["onchain_granted"] += 1

        self.stdout.write(self.style.SUCCESS(
            "skr_granted={skr_granted} onchain_granted={onchain_granted} "
            "already_used={already_used} not_found={not_found} "
            "skipped={skipped}".format(**self.counts)
        ))
        if self.errors:
            self.stdout.write(self.style.WARNING(
                f"check_errors={self.errors} (SGT results are cached 24h; re-run to retry just the failures)"
            ))

    def _grant(self, user, sgt_mint, source) -> bool:
        if self.dry_run:
            User = type(user)
            if sgt_mint and User.all_objects.filter(
                seeker_sgt_mint=sgt_mint
            ).exclude(user_id=user.user_id).exists():
                self.counts["already_used"] += 1
                return False
            self.stdout.write(
                f"[dry-run] would grant source={source} to user={user.user_id} ({user.username})"
                + (f" mint={sgt_mint}" if sgt_mint else "")
            )
            return True

        granted, error = grant_seeker_verified(user, sgt_mint, source)
        if not granted:
            if error == "SGT_ALREADY_USED":
                self.counts["already_used"] += 1
                self.stdout.write(
                    f"user={user.user_id}: SGT {sgt_mint} already linked to another account"
                )
            else:
                self.errors += 1
                self.stderr.write(f"user={user.user_id} grant failed: {error}")
            return False
        self.stdout.write(
            f"granted source={source} to user={user.user_id} ({user.username})"
            + (f" mint={sgt_mint}" if sgt_mint else "")
        )
        return True
