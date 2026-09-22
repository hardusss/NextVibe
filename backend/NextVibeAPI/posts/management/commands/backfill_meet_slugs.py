"""Give every past tap its Proof of Meet slug (nextvibe.io/u/meet/<slug>).

Taps store the slug when they're written; rows from before that get it here.
Rows are grouped into meetings the same way the app counts them (event taps:
pair + event, IRL taps: pair + UTC day), and each meeting's slug is derived
from that key, so it's the same on every run. Only empty slugs are filled:
a stored one never changes. Safe to re-run; prints how many rows it set.

    python manage.py backfill_meet_slugs
    python manage.py backfill_meet_slugs --dry-run
    python manage.py backfill_meet_slugs --pair javrpelayo cakeandroll.skr   # print their meet links
"""
from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction
from django.db.models import Q

from posts.models import Reputation
from posts.src.meets import ROW_FIELDS, group_rows, meet_url, slug_for_key, tap_rows


class Command(BaseCommand):
    help = "Set Reputation.meet_slug on past taps (idempotent) and print the count."

    def add_arguments(self, parser):
        parser.add_argument("--dry-run", action="store_true", help="Count what would change, write nothing.")
        parser.add_argument(
            "--pair", nargs=2, metavar=("USERNAME", "USERNAME"),
            help="After the backfill, list the meet links between these two accounts.",
        )

    def handle(self, *args, **options):
        dry_run = options["dry_run"]
        groups = group_rows(tap_rows().values(*ROW_FIELDS))

        rows_set = meets_touched = 0
        with transaction.atomic():
            for key, rows in groups.items():
                empty = [r["id"] for r in rows if not r["meet_slug"]]
                if not empty:
                    continue
                # A meeting that already has a slug keeps it (e.g. a row written
                # after the deploy that raced an old one); otherwise derive it
                stored = sorted({r["meet_slug"] for r in rows if r["meet_slug"]})
                slug = stored[0] if stored else slug_for_key(key)
                if not dry_run:
                    Reputation.objects.filter(id__in=empty, meet_slug__isnull=True).update(meet_slug=slug)
                rows_set += len(empty)
                meets_touched += 1

        total = sum(len(rows) for rows in groups.values())
        prefix = "[dry-run] would set" if dry_run else "Set"
        self.stdout.write(self.style.SUCCESS(
            f"{prefix} meet_slug on {rows_set} rows ({meets_touched} meets). "
            f"{len(groups)} meets / {total} tap rows in total."
        ))

        if options["pair"]:
            self._print_pair(*options["pair"])

    def _print_pair(self, first, second):
        User = get_user_model()
        users = []
        for name in (first, second):
            user = User.all_objects.filter(username=name.lstrip("@")).first()
            if user is None:
                raise CommandError(f"No account named {name!r}")
            users.append(user)
        a, b = users
        rows = (
            tap_rows()
            .filter(Q(user=a, given_by=b) | Q(user=b, given_by=a), meet_slug__isnull=False)
            .order_by("created_at")
            .values_list("meet_slug", "source", "created_at")
        )
        seen = set()
        for slug, source, created_at in rows:
            if slug in seen:
                continue
            seen.add(slug)
            self.stdout.write(f"{created_at:%Y-%m-%d %H:%M} UTC  {source:<5}  {meet_url(slug)}")
        if not seen:
            self.stdout.write(f"No meets between @{a.username} and @{b.username}.")
