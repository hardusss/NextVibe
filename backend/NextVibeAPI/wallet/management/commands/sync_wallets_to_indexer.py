import httpx
from django.conf import settings
from django.core.management.base import BaseCommand


class Command(BaseCommand):
    help = "Queue all user wallets for indexing and sync Helius webhook pool."

    def add_arguments(self, parser):
        parser.add_argument(
            "--force",
            action="store_true",
            help="Re-fetch initial transactions even if some already exist.",
        )

    def handle(self, *args, **options):
        if not settings.INDEXER_INTERNAL_SECRET:
            self.stderr.write("INDEXER_INTERNAL_SECRET is not configured.")
            return

        force = options["force"]
        url = f"{settings.INDEXER_URL.rstrip('/')}/index/sync-all"

        try:
            response = httpx.post(
                url,
                json={"force": force},
                headers={"x-internal-secret": settings.INDEXER_INTERNAL_SECRET},
                timeout=120,
            )
            response.raise_for_status()
        except Exception as error:
            self.stderr.write(f"Indexer sync failed: {error}")
            return

        data = response.json()
        self.stdout.write(
            self.style.SUCCESS(
                "Indexer sync complete: "
                f"wallets={data.get('wallets')}, "
                f"queued={data.get('queued')}, "
                f"skipped={data.get('skipped')}, "
                f"webhookSynced={data.get('webhookSynced')}, "
                f"webhookTruncated={data.get('webhookTruncated')}"
            )
        )
