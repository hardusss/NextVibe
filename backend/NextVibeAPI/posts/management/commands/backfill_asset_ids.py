"""
Django Management Command: backfill_asset_ids
=============================================

Finds UserCollection (and OgAvatarMint) rows where asset_id is NULL or starts with
'Minted', queries nft-service POST /asset-id-from-signature, and updates the database.

Usage:
  python manage.py backfill_asset_ids
  python manage.py backfill_asset_ids --dry-run
"""

import logging
import requests
from django.core.management.base import BaseCommand
from django.db.models import Q
from posts.models import UserCollection
from user.models import OgAvatarMint
from posts.constants import NFT_SERVICE_URL

logger = logging.getLogger("posts.collect")


class Command(BaseCommand):
    help = "Backfill cNFT asset IDs from on-chain transaction signatures for unparsed records."

    def add_arguments(self, parser):
        parser.add_argument(
            "--dry-run",
            action="store_true",
            default=False,
            help="Simulate the backfill without writing to the database.",
        )

    def handle(self, *args, **options):
        dry_run = options["dry_run"]
        self.stdout.write(self.style.NOTICE(
            f"Starting asset_id backfill (dry_run={dry_run}) via {NFT_SERVICE_URL}..."
        ))

        # 1. Backfill UserCollection
        user_collections = UserCollection.objects.filter(
            Q(asset_id__isnull=True) | Q(asset_id__startswith="Minted")
        ).exclude(signature__isnull=True).exclude(signature="")

        uc_count = user_collections.count()
        self.stdout.write(f"Found {uc_count} UserCollection record(s) needing asset_id backfill.")

        fixed_uc = 0
        failed_uc = 0
        for item in user_collections:
            sig = item.signature
            try:
                res = requests.post(
                    f"{NFT_SERVICE_URL}/asset-id-from-signature",
                    json={"signature": sig},
                    timeout=15,
                )
                if res.status_code == 200:
                    data = res.json()
                    new_asset_id = data.get("assetId")
                    if new_asset_id:
                        if not dry_run:
                            item.asset_id = new_asset_id
                            item.save(update_fields=["asset_id"])
                        self.stdout.write(self.style.SUCCESS(
                            f"  [UserCollection #{item.id}] updated asset_id -> {new_asset_id}"
                        ))
                        fixed_uc += 1
                        continue
                self.stdout.write(self.style.WARNING(
                    f"  [UserCollection #{item.id}] could not resolve asset_id (HTTP {res.status_code})"
                ))
                failed_uc += 1
            except Exception as e:
                self.stdout.write(self.style.ERROR(
                    f"  [UserCollection #{item.id}] error: {e}"
                ))
                failed_uc += 1

        # 2. Backfill OgAvatarMint
        og_mints = OgAvatarMint.objects.filter(
            Q(asset_id__isnull=True) | Q(asset_id__startswith="Minted")
        ).exclude(signature__isnull=True).exclude(signature="")

        og_count = og_mints.count()
        self.stdout.write(f"Found {og_count} OgAvatarMint record(s) needing asset_id backfill.")

        fixed_og = 0
        failed_og = 0
        for item in og_mints:
            sig = item.signature
            try:
                res = requests.post(
                    f"{NFT_SERVICE_URL}/asset-id-from-signature",
                    json={"signature": sig},
                    timeout=15,
                )
                if res.status_code == 200:
                    data = res.json()
                    new_asset_id = data.get("assetId")
                    if new_asset_id:
                        if not dry_run:
                            item.asset_id = new_asset_id
                            item.save(update_fields=["asset_id"])
                        self.stdout.write(self.style.SUCCESS(
                            f"  [OgAvatarMint #{item.id}] updated asset_id -> {new_asset_id}"
                        ))
                        fixed_og += 1
                        continue
                self.stdout.write(self.style.WARNING(
                    f"  [OgAvatarMint #{item.id}] could not resolve asset_id (HTTP {res.status_code})"
                ))
                failed_og += 1
            except Exception as e:
                self.stdout.write(self.style.ERROR(
                    f"  [OgAvatarMint #{item.id}] error: {e}"
                ))
                failed_og += 1

        self.stdout.write(self.style.SUCCESS(
            f"Backfill finished: UserCollection {fixed_uc}/{uc_count} fixed ({failed_uc} failed), "
            f"OgAvatarMint {fixed_og}/{og_count} fixed ({failed_og} failed)."
        ))
