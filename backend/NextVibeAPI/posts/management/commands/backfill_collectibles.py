"""Record everything people hold already as collectibles (posts/src/collectibles.py).

    python manage.py backfill_collectibles             # run it (after `migrate`)
    python manage.py backfill_collectibles --dry-run   # count only
    python manage.py backfill_collectibles --queue     # also queue off-chain items of people with a wallet

What becomes a row:

    minted    POAPs minted at check-in (UserCollection rows of events), with their asset ids
              collected posts (UserCollection rows of other posts), with their asset ids
              the OG avatar badge (OgAvatarMint)
              Proof of Meet leaves minted for a v2 selfie (MeetPhoto asset ids)
    offchain  check-ins whose POAP was never minted (the event's supply still applies)
              every meet without a leaf, one row per person

Off-chain rows show "Not on Solana yet" and Claim; connecting a wallet puts
them on Solana. Nothing is minted by this command unless --queue is given
(then people who already have a wallet get theirs queued, without a push).
Deleted and banned accounts get no rows. AI-generated posts stay out, as in
the old tab. Idempotent: one row per person per source, and an existing row
is only ever upgraded to minted when a leaf exists. Metadata is built later
by the sweep (every 2 minutes) or on first request.
"""
from collections import Counter

from django.core.management.base import BaseCommand
from django.db import transaction
from django.utils import timezone

from posts.models import Collectible, EventCheckin, MeetPhoto, UserCollection
from posts.src import collectibles
from posts.src import collectible_metadata as meta
from posts.src.meets import tap_rows
from user.models import OgAvatarMint, User

Kind = Collectible.Kind
Status = Collectible.Status
KINDS = ("poap", "meet", "post", "badge")


def _usable(user) -> bool:
    return user is not None and user.is_active and not user.is_baned and user.auth_provider != "deleted"


class Command(BaseCommand):
    help = "Create Collectible rows for existing mints, check-ins and meets (idempotent); prints counts."

    def add_arguments(self, parser):
        parser.add_argument("--dry-run", action="store_true", help="Count what would be created, write nothing.")
        parser.add_argument("--kind", choices=KINDS, action="append", help="Only these kinds (repeatable).")
        parser.add_argument("--queue", action="store_true",
                            help="Queue off-chain items of people who already have a wallet (no push).")

    def handle(self, *args, **options):
        self.dry = options["dry_run"]
        kinds = set(options["kind"] or KINDS)
        self.counts = Counter()
        if "post" in kinds or "poap" in kinds:
            self._ledger(kinds)
        if "badge" in kinds:
            self._badges()
        if "meet" in kinds:
            self._meet_leaves()
            self._meets()
        if "poap" in kinds:
            self._checkins()
        queued = self._queue() if options["queue"] and not self.dry else 0

        prefix = "[dry-run] would create" if self.dry else "Created"
        for kind in KINDS:
            parts = [f"{status} {self.counts[(kind, status)]}" for status in ("minted", "offchain")
                     if self.counts[(kind, status)]]
            existing = self.counts[(kind, "existing")]
            extra = [f"already recorded {existing}"] if existing else []
            extra += [f"{label} {self.counts[(kind, label)]}" for label in ("upgraded", "sold_out", "skipped")
                      if self.counts[(kind, label)]]
            self.stdout.write(f"{kind:6} {prefix.lower() if parts else 'nothing new'}: "
                              f"{', '.join(parts + extra) or '-'}")
        totals = Collectible.objects.values_list("kind", "status")
        by = Counter(totals)
        self.stdout.write("Table now: " + ", ".join(
            f"{kind}/{status} {n}" for (kind, status), n in sorted(by.items())) if by else "Table now: empty")
        if queued:
            self.stdout.write(f"Queued {queued} for people with a wallet.")
        self.stdout.write(self.style.SUCCESS("Done."))

    # ── minted ───────────────────────────────────────────────────────────

    def _exists(self, user_id, kind, source_id):
        return Collectible.objects.filter(user_id=user_id, kind=kind, source_id=str(source_id)).first()

    def _ledger(self, kinds):
        rows = UserCollection.objects.select_related("user", "post", "post__owner").order_by("id")
        for col in rows.iterator():
            post = col.post
            kind = Kind.POAP if post.is_luma_event else Kind.POST
            if kind not in kinds:
                continue
            if post.is_ai_generated:
                self.counts[(kind, "skipped")] += 1
                continue
            if not _usable(col.user):
                self.counts[(kind, "skipped")] += 1
                continue
            existing = self._exists(col.user_id, kind, post.id)
            if existing is not None:
                self._upgrade(existing, col.asset_id, col.signature, col.minted_at, col.user.wallet_address, kind)
                continue
            self.counts[(kind, "minted")] += 1
            if self.dry:
                continue
            if kind == Kind.POAP:
                collectibles.poap_from_ledger(col)
            else:
                Collectible.objects.get_or_create(
                    user=col.user, kind=Kind.POST, source_id=str(post.id),
                    defaults=dict(
                        post=post, metadata_uri=meta.post_uri(post.id, col.edition),
                        name=f"Post by @{post.owner.username} #{col.edition}", image_url=meta.post_image(post),
                        edition=col.edition, recorded_at=col.minted_at or timezone.now(), status=Status.MINTED,
                        wallet=col.user.wallet_address or "", asset_id=col.asset_id or "",
                        signature=col.signature or "", minted_at=col.minted_at,
                    ),
                )

    def _upgrade(self, row, asset_id, signature, minted_at, wallet, kind):
        """A row recorded off-chain whose leaf exists after all: it's minted."""
        if row.status == Status.MINTED or not asset_id:
            self.counts[(kind, "existing")] += 1
            return
        self.counts[(kind, "upgraded")] += 1
        if not self.dry:
            Collectible.objects.filter(pk=row.pk).exclude(status=Status.MINTED).update(
                status=Status.MINTED, asset_id=asset_id, signature=signature or "", wallet=wallet or "",
                minted_at=minted_at or timezone.now(), last_error="", next_attempt_at=None,
            )

    def _badges(self):
        for og in OgAvatarMint.objects.select_related("user").order_by("id").iterator():
            if not _usable(og.user):
                self.counts[("badge", "skipped")] += 1
                continue
            existing = self._exists(og.user_id, Kind.BADGE, "og")
            if existing is not None:
                self._upgrade(existing, og.asset_id, og.signature, og.minted_at, og.user.wallet_address, "badge")
                continue
            self.counts[("badge", "minted")] += 1
            if not self.dry:
                collectibles.record_og_badge(og.user, og)

    def _meet_leaves(self):
        """Leaves Proof of Meet v2 minted for a selfie (both point at /meta/meet/<slug>.json)."""
        photos = (
            MeetPhoto.objects.exclude(asset_id_photographer="", asset_id_subject="")
            .select_related("photographer", "subject").order_by("created_at", "id")
        )
        for photo in photos.iterator():
            for role, other_role in (("photographer", "subject"), ("subject", "photographer")):
                asset_id = getattr(photo, f"asset_id_{role}")
                user, other = getattr(photo, role), getattr(photo, other_role)
                if not asset_id or not _usable(user):
                    continue
                existing = self._exists(user.user_id, Kind.MEET, photo.meet_slug)
                wallet = getattr(photo, f"wallet_{role}") or user.wallet_address or ""
                minted_at = photo.decided_at or photo.created_at
                if existing is not None:
                    self._upgrade(existing, asset_id, "", minted_at, wallet, "meet")
                    continue
                self.counts[("meet", "minted")] += 1
                if self.dry:
                    continue
                first = tap_rows().filter(meet_slug=photo.meet_slug).order_by("created_at", "id").first()
                a, b = (first.user, first.given_by) if first else (user, other)
                Collectible.objects.get_or_create(
                    user=user, kind=Kind.MEET, source_id=photo.meet_slug,
                    defaults=dict(
                        counterpart=other, metadata_uri=f"{meta.api_base()}/meta/meet/{photo.meet_slug}.json",
                        name=meta.meet_name(a.username, b.username), image_url=meta.meet_image(photo.meet_slug),
                        recorded_at=first.created_at if first else photo.created_at, status=Status.MINTED,
                        wallet=wallet, asset_id=asset_id, minted_at=minted_at,
                    ),
                )

    # ── off-chain ────────────────────────────────────────────────────────

    def _meets(self):
        """Every meet, one row per person who can still hold it (A confirmed the tap)."""
        seen = set()
        rows = tap_rows().filter(meet_slug__isnull=False).select_related("user", "given_by").order_by("created_at", "id")
        for rep in rows.iterator():
            if rep.meet_slug in seen:
                continue
            seen.add(rep.meet_slug)
            a, b = rep.user, rep.given_by
            wanted = []
            for person in (a, b):
                if not _usable(person):
                    self.counts[("meet", "skipped")] += 1
                elif self._exists(person.user_id, Kind.MEET, rep.meet_slug) is not None:
                    self.counts[("meet", "existing")] += 1
                else:
                    wanted.append(person.user_id)
            if not wanted:
                continue
            self.counts[("meet", "offchain")] += len(wanted)
            if not self.dry:
                with transaction.atomic():
                    collectibles.record_meet(rep.meet_slug, a, b, when=rep.created_at, offchain=True,
                                             only=set(wanted))

    def _checkins(self):
        """Check-ins whose POAP was never minted: off-chain, while the event has editions left."""
        checkins = EventCheckin.objects.filter(is_registered=True).select_related("user", "post").order_by("checked_in_at", "id")
        for checkin in checkins.iterator():
            if not _usable(checkin.user) or not checkin.post.is_luma_event:
                self.counts[("poap", "skipped")] += 1
                continue
            if self._exists(checkin.user_id, Kind.POAP, checkin.post_id) is not None:
                self.counts[("poap", "existing")] += 1
                continue
            if self.dry:
                self.counts[("poap", "offchain")] += 1
                continue
            with transaction.atomic():
                row = collectibles.record_poap(checkin.user, checkin.post, when=checkin.checked_in_at, offchain=True)
            if row is None:
                self.counts[("poap", "sold_out")] += 1
            elif row.status == Status.MINTED:
                self.counts[("poap", "minted")] += 1  # its UserCollection row was just found
            else:
                self.counts[("poap", "offchain")] += 1

    def _queue(self) -> int:
        """--queue: people with a wallet get their off-chain items minted (no push: origin "backfill")."""
        queued = 0
        user_ids = (
            Collectible.objects.filter(status=Status.OFFCHAIN).values_list("user_id", flat=True).distinct()
        )
        for user in User.all_objects.filter(user_id__in=list(user_ids)).exclude(wallet_address__isnull=True).exclude(wallet_address=""):
            with transaction.atomic():
                queued += collectibles.queue_for_user(user, origin="backfill")
        return queued
