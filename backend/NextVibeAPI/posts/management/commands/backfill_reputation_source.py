"""Backfill Reputation.source for rows created before the field existed.

Rules (run once after migrating; idempotent, safe to re-run):
  - is_checkin=True                -> 'checkin'
  - post_type set (event_post, collect, cherry_invite_code,
    link_email_reward, invite_reward_lvl2, ...) -> 'post'
  - everything else keeps the model default 'event' (networking taps).

No row existing before this feature can be an 'irl' tap, so 'irl' is never
assigned here.
"""

from django.core.management.base import BaseCommand

from posts.models import Reputation


class Command(BaseCommand):
    help = "Backfill Reputation.source ('checkin' / 'post') on pre-existing rows."

    def add_arguments(self, parser):
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="Only report how many rows each rule would touch.",
        )

    def handle(self, *args, **options):
        dry_run = options["dry_run"]

        checkin_qs = Reputation.objects.filter(is_checkin=True).exclude(source='checkin')
        post_qs = Reputation.objects.filter(
            is_checkin=False, post_type__isnull=False
        ).exclude(source='post')

        checkin_count = checkin_qs.count()
        post_count = post_qs.count()

        if dry_run:
            self.stdout.write(
                f"[dry-run] would set source='checkin' on {checkin_count} rows, "
                f"source='post' on {post_count} rows"
            )
            return

        updated_checkin = checkin_qs.update(source='checkin')
        updated_post = post_qs.update(source='post')
        self.stdout.write(
            self.style.SUCCESS(
                f"checkin={updated_checkin} post={updated_post} (rest stay 'event')"
            )
        )
