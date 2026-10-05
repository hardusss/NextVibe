"""Attribute IRL taps that happened at an event to that event.

When indoor GPS keeps guests from checking in, they still tap phones (Tap to
Meet), and those taps are saved as IRL taps (source 'irl', no event). This
moves the ones that really happened at the event, so the organizer
dashboard counts them. A meet moves when both of its rows:

    are IRL tap rows (posts.src.meets.tap_rows) with the meet's slug,
    were written inside the event's window (luma_event_start_time..end_time),
    were tapped inside the event's geofence: the check-in rule
        (geofence_rings in posts/view_pac/event_checkin.py), measured from
        the centre of the row's h3_geo; a row without one doesn't qualify,

and the pair has no event tap at that event yet (one meet per pair per
event). With several events (one post per day), each tap goes to the event
whose window it falls in.

Only Reputation.source and Reputation.event change. created_at, points,
h3_geo and meet_slug stay, so Proof of Meet links, collectibles (source_id)
and selfies (MeetPhoto.meet_slug) keep pointing at the same meet. Check-ins,
requests, POAPs, collectibles and selfies are never touched.

Posts get the same treatment. A post made at the event by someone who wasn't
checked in has no on_event (post_create links only checked-in authors), so
the dashboard's event posts leave it out. A post that isn't linked to any
event, was created inside the event's window and has an h3_geo inside the
geofence (same rule) gets on_event set; nothing else on it changes. A post
without a location (the app sent none) is linked when its author was at the
event: checked in, or tapped someone there. No REP
is awarded for it (post_create's 10 REP and its Reputation row are not
created), so nobody's REP total changes.

    python manage.py retag_event_taps --event 812 --event 813      # dry run: what would move
    python manage.py retag_event_taps --event 812 --apply          # move; writes a backup first
    python manage.py retag_event_taps --revert retag_event_taps-812-20261005T120000Z.json
"""
import json
import os
from collections import Counter, defaultdict
from dataclasses import dataclass, field
from datetime import datetime, timezone as dt_timezone
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

import h3
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction
from django.db.models import Q

from posts.constants import GEOFENCE_RINGS
from posts.models import Collectible, EventCheckin, MeetPhoto, Post, Reputation
from posts.src.meets import ROW_FIELDS, TIER_LABELS, group_rows, meet_tier, tap_rows
from posts.view_pac.event_checkin import geofence_rings
from user.models import User

ROW_VALUES = ROW_FIELDS + ("h3_geo", "points")


@dataclass
class Meet:
    slug: str | None
    rows: list
    event: Post | None = None
    rings: int | None = None
    reason: str | None = None
    tier: str | None = None
    notes: list = field(default_factory=list)

    @property
    def met_at(self):
        return min(r["created_at"] for r in self.rows)

    @property
    def pair(self):
        r = self.rows[0]
        return frozenset((r["user_id"], r["given_by_id"]))


class Command(BaseCommand):
    help = ("Move IRL taps and unlinked posts made inside an event's window and geofence to that event "
            "(dry run unless --apply).")

    def add_arguments(self, parser):
        parser.add_argument("--event", type=int, action="append", default=[], metavar="ID",
                            help="Event post id; repeat for an event split over several posts.")
        parser.add_argument("--apply", action="store_true", help="Move the meets (writes a backup first).")
        parser.add_argument("--revert", metavar="BACKUP_JSON", help="Restore the rows a backup lists.")
        parser.add_argument("--backup-dir", default=".", help="Where --apply writes its backup (default: here).")
        parser.add_argument("--tz", help="Zone for printed times (default: the venue's zone, else UTC).")

    def handle(self, *args, **options):
        if options["revert"]:
            if options["apply"] or options["event"]:
                raise CommandError("--revert takes only the backup file.")
            return self._revert(options["revert"])
        if not options["event"]:
            raise CommandError("Give at least one --event <id>.")

        events = self._load_events(options["event"])
        self.tz = self._zone(options["tz"], events[0])
        for event in events:
            self.stdout.write(
                f"Event {event.id}: {_title(event)}\n"
                f"  window {self._fmt(event.luma_event_start_time)} → {self._fmt(event.luma_event_end_time)} "
                f"({self.tz.key})  cell {event.h3_geo} (res {h3.get_resolution(event.h3_geo)}), "
                f"geofence {GEOFENCE_RINGS} rings"
            )
        self.stdout.write("")

        moving, skipped = self._plan(events)
        self._print_plan(moving, skipped)
        self._print_impact(moving)
        posts, skipped_posts = self._plan_posts(events, moving)
        self._print_posts(posts, skipped_posts)

        if not options["apply"]:
            self.stdout.write(self.style.WARNING(
                "\nDry run: nothing changed. Re-run with --apply to move these meets and posts."))
            return
        if not moving and not posts:
            self.stdout.write("Nothing to move.")
            return
        path = self._apply(moving, posts, events, options["backup_dir"])
        self.stdout.write(self.style.SUCCESS(
            f"\nMoved {len(moving)} meets ({2 * len(moving)} rows) and {len(posts)} posts. Backup: {path}"))
        self._clear_caches(events)

    # ── Plan ─────────────────────────────────────────────────────────────

    def _load_events(self, ids):
        events = []
        for event_id in dict.fromkeys(ids):
            event = Post.objects.filter(id=event_id, is_luma_event=True).select_related("owner").first()
            if event is None:
                raise CommandError(f"No event post {event_id}.")
            if not (event.luma_event_start_time and event.luma_event_end_time):
                raise CommandError(f"Event {event_id} has no start/end time: no window to match taps against.")
            if not event.h3_geo or not h3.is_valid_cell(event.h3_geo):
                raise CommandError(f"Event {event_id} has no valid h3_geo: no geofence to match taps against.")
            events.append(event)
        return sorted(events, key=lambda e: e.luma_event_start_time)

    def _plan(self, events):
        """(meets to move, meets skipped), each in time order."""
        start = min(e.luma_event_start_time for e in events)
        end = max(e.luma_event_end_time for e in events)
        candidates = list(
            tap_rows().filter(source="irl", created_at__gte=start, created_at__lte=end).values(*ROW_VALUES)
        )
        meets = [Meet(None, [r], reason="row has no meet_slug (run backfill_meet_slugs)")
                 for r in candidates if not r["meet_slug"]]
        slugs = {r["meet_slug"] for r in candidates if r["meet_slug"]}
        # Every row of those meets, inside the window or not, tap row or not
        by_slug = defaultdict(list)
        for row in Reputation.objects.filter(meet_slug__in=slugs).values(*ROW_VALUES, "is_checkin", "post_id",
                                                                          "post_type"):
            by_slug[row["meet_slug"]].append(row)
        tap_ids = {r["id"] for r in candidates}
        meets += [self._check(Meet(slug, sorted(rows, key=lambda r: r["id"])), events, tap_ids)
                  for slug, rows in by_slug.items()]
        meets.sort(key=lambda m: (m.met_at, m.slug or ""))

        moving, claimed = [], {}
        for meet in meets:
            if meet.reason:
                continue
            key = (meet.pair, meet.event.id)
            if key in claimed:
                meet.reason = f"pair already gets an earlier meet ({claimed[key]}) at this event"
            elif _has_event_tap(meet.pair, meet.event.id):
                meet.reason = "pair already has an event tap at this event"
            else:
                claimed[key] = meet.slug
                meet.tier = meet_tier("event", meet.event.id, set(meet.pair))
                moving.append(meet)
        skipped = [m for m in meets if m.reason]
        return moving, skipped

    def _check(self, meet, events, tap_ids):
        """Fills meet.event and meet.rings, or meet.reason."""
        rows = meet.rows
        if len(rows) != 2:
            meet.reason = f"meet has {len(rows)} rows, not 2"
            return meet
        a, b = rows
        if not (a["user_id"] == b["given_by_id"] and a["given_by_id"] == b["user_id"]):
            meet.reason = "rows are not one pair's mirrored rows"
            return meet
        if any(r["source"] != "irl" or r["event_id"] for r in rows):
            meet.reason = "one row is not an IRL tap"
            return meet

        targets, rings = [], []
        for row in rows:
            in_window = [e for e in events
                         if e.luma_event_start_time <= row["created_at"] <= e.luma_event_end_time]
            if not in_window:
                meet.reason = "one row is outside every event window"
                return meet
            if row["id"] not in tap_ids:
                meet.reason = "one row is not a tap row (no points, a check-in or a post award)"
                return meet
            if not row["h3_geo"]:
                meet.reason = "no location (h3_geo) on a row"
                return meet
            try:
                lat, lng = h3.cell_to_latlng(row["h3_geo"])
                distances = {e.id: geofence_rings(e, lat, lng) for e in in_window}
            except Exception:
                meet.reason = f"invalid h3_geo {row['h3_geo']!r}"
                return meet
            inside = [e for e in in_window if distances[e.id] <= GEOFENCE_RINGS]
            if not inside:
                nearest = min(in_window, key=lambda e: distances[e.id])
                meet.rings = distances[nearest.id]
                meet.reason = f"outside the geofence ({meet.rings} rings > {GEOFENCE_RINGS})"
                if _event_inside_cell(nearest, row["h3_geo"]):
                    meet.notes.append("coarse")
                    meet.reason += f"; the venue is inside this tap's res-{h3.get_resolution(row['h3_geo'])} cell"
                return meet
            if len(inside) > 1:
                meet.reason = "ambiguous: inside the window and geofence of events " + ", ".join(
                    str(e.id) for e in inside)
                return meet
            targets.append(inside[0])
            rings.append(distances[inside[0].id])
        if targets[0].id != targets[1].id:
            meet.reason = f"rows fall in different events ({targets[0].id}, {targets[1].id})"
            return meet
        meet.event, meet.rings = targets[0], max(rings)
        return meet

    def _plan_posts(self, events, moving):
        """(posts to link, posts skipped) as dicts, oldest first. Only posts
        not linked to any event, created inside an event's window. A post
        with a location must be inside the geofence; one without (the app
        sent none) goes to the event whose author was there: checked in, or
        tapped someone (counting the meets this run moves)."""
        present = _people_present(events, moving)
        start = min(e.luma_event_start_time for e in events)
        end = max(e.luma_event_end_time for e in events)
        rows = (
            Post.all_objects
            .filter(is_luma_event=False, on_event__isnull=True, create_at__gte=start, create_at__lte=end)
            .exclude(id__in=[e.id for e in events])
            .order_by("create_at", "id")
            .values("id", "owner_id", "owner__username", "create_at", "h3_geo")
        )
        moving, skipped = [], []
        for post in rows:
            post.update(event=None, rings=None, reason=None, basis="geofence")
            in_window = [e for e in events
                         if e.luma_event_start_time <= post["create_at"] <= e.luma_event_end_time]
            if not in_window:
                post["reason"] = "outside every event window"  # between two event days
            elif not post["h3_geo"]:
                seen = [e for e in in_window if post["owner_id"] in present[e.id]]
                if len(seen) == 1:
                    post["event"], post["basis"] = seen[0], "author there"
                elif seen:
                    post["reason"] = "ambiguous: no location, author at events " + ", ".join(str(e.id) for e in seen)
                else:
                    post["reason"] = "no location, and the author neither checked in nor tapped at the event"
            else:
                try:
                    lat, lng = h3.cell_to_latlng(post["h3_geo"])
                    distances = {e.id: geofence_rings(e, lat, lng) for e in in_window}
                except Exception:
                    post["reason"] = f"invalid h3_geo {post['h3_geo']!r}"
                else:
                    inside = [e for e in in_window if distances[e.id] <= GEOFENCE_RINGS]
                    if len(inside) == 1:
                        post["event"], post["rings"] = inside[0], distances[inside[0].id]
                    elif inside:
                        post["reason"] = "ambiguous: inside the window and geofence of events " + ", ".join(
                            str(e.id) for e in inside)
                    else:
                        nearest = min(in_window, key=lambda e: distances[e.id])
                        post["rings"] = distances[nearest.id]
                        post["reason"] = f"outside the geofence ({post['rings']} rings > {GEOFENCE_RINGS})"
                        if _event_inside_cell(nearest, post["h3_geo"]):
                            post["reason"] += (f"; the venue is inside this post's "
                                               f"res-{h3.get_resolution(post['h3_geo'])} cell")
            (skipped if post["reason"] else moving).append(post)
        return moving, skipped

    def _print_posts(self, posts, skipped):
        self.stdout.write(f"\nWould link {len(posts)} posts to their event (Post.on_event):")
        if posts:
            self.stdout.write(f"  {'post':>8}  {'event':>6}  {'created (' + self.tz.key + ')':<26}  {'rings':>5}  "
                              f"{'res':>3}  {'why':<12}  author")
        for p in posts:
            rings = "—" if p["rings"] is None else str(p["rings"])
            res = h3.get_resolution(p["h3_geo"]) if p["h3_geo"] else "—"
            self.stdout.write(f"  {p['id']:>8}  {p['event'].id:>6}  {self._fmt(p['create_at']):<26}  {rings:>5}  "
                              f"{res:>3}  {p['basis']:<12}  @{p['owner__username']}")
        self.stdout.write(f"\nPosts skipped {len(skipped)}:")
        for p in skipped:
            rings = "" if p["rings"] is None else str(p["rings"])
            self.stdout.write(f"  {p['id']:>8}  {self._fmt(p['create_at']):<26}  {rings:>5}  "
                              f"@{p['owner__username']}  — {p['reason']}")
        for (event_id, basis), n in sorted(Counter((p["event"].id, p["basis"]) for p in posts).items()):
            self.stdout.write(f"  posts to event {event_id} ({basis}): {n}")
        for reason, n in Counter(_reason_kind(p["reason"]) for p in skipped).most_common():
            self.stdout.write(f"  posts skipped, {reason}: {n}")
        if posts:
            # user-event-connections lists every post with on_event as "Post at event", +10 when it has no REP
            self.stdout.write(f"  authors' History will list these as \"Post at event\" (+10 REP shown, none awarded): "
                              f"{len({p['owner_id'] for p in posts})} people")

    # ── Report ───────────────────────────────────────────────────────────

    def _print_plan(self, moving, skipped):
        names = _usernames({u for m in moving + skipped for r in m.rows for u in (r["user_id"], r["given_by_id"])})

        def people(m):
            r = m.rows[0]
            return f"@{names.get(r['user_id'], r['user_id'])} ↔ @{names.get(r['given_by_id'], r['given_by_id'])}"

        self.stdout.write(f"Would move {len(moving)} meets ({2 * len(moving)} rows):")
        if moving:
            self.stdout.write(f"  {'slug':<12}  {'event':>6}  {'time (' + self.tz.key + ')':<26}  {'rings':>5}  "
                              f"{'new tier':<18}  people")
        for m in moving:
            self.stdout.write(f"  {m.slug:<12}  {m.event.id:>6}  {self._fmt(m.met_at):<26}  {m.rings:>5}  "
                              f"{TIER_LABELS[m.tier]:<18}  {people(m)}")

        self.stdout.write(f"\nSkipped {len(skipped)}:")
        for m in skipped:
            rings = "" if m.rings is None else f"{m.rings:>5}"
            self.stdout.write(f"  {m.slug or '(no slug)':<12}  {self._fmt(m.met_at):<26}  {rings:>5}  "
                              f"{people(m)}  — {m.reason}")

        self.stdout.write("\nTotals")
        per_event = Counter(m.event.id for m in moving)
        for event_id, n in sorted(per_event.items()):
            self.stdout.write(f"  event {event_id}: {n} meets")
        reasons = Counter(_reason_kind(m.reason) for m in skipped)
        for reason, n in reasons.most_common():
            self.stdout.write(f"  skipped, {reason}: {n}")
        coarse = sum("coarse" in m.notes for m in skipped)
        if coarse:
            self.stdout.write(self.style.WARNING(
                f"  {coarse} of the geofence misses have the venue inside the tap's own cell: IRL taps store "
                f"a coarse cell, so its centre can sit outside the zone although the tap may have been inside."
            ))

    def _print_impact(self, moving):
        """What people see differently once these meets move."""
        if not moving:
            return
        slugs = [m.slug for m in moving]
        tiers = Counter(TIER_LABELS[m.tier] for m in moving)
        minted = set(Collectible.objects.filter(kind=Collectible.Kind.MEET, source_id__in=slugs,
                                                status=Collectible.Status.MINTED)
                     .values_list("source_id", flat=True))
        frozen = set(Collectible.objects.filter(kind=Collectible.Kind.MEET, source_id__in=slugs)
                     .exclude(metadata={}).values_list("source_id", flat=True))
        selfies = set(MeetPhoto.objects.filter(meet_slug__in=slugs,
                                               status__in=[MeetPhoto.Status.APPROVED, MeetPhoto.Status.MINTED])
                      .values_list("meet_slug", flat=True))
        counts_changed = _meet_counts_changed(moving)

        self.stdout.write("\nAfter the move")
        self.stdout.write("  tier on the meet page and card: IN PERSON → " +
                          ", ".join(f"{label} {n}" for label, n in tiers.most_common()))
        self.stdout.write(f"  already minted as a Proof of Meet: {len(minted)}")
        self.stdout.write(f"  with a selfie (approved or minted): {len(selfies)}")
        self.stdout.write(f"  collectibles with metadata already frozen (keep Tier \"In person\", Event \"—\"): "
                          f"{len(frozen)}")
        self.stdout.write(f"  people whose meet count or pair history changes: {counts_changed}")

    # ── Apply / revert ───────────────────────────────────────────────────

    def _apply(self, moving, posts, events, backup_dir):
        ids = [r["id"] for m in moving for r in m.rows]
        with transaction.atomic():
            locked_posts = {p.id: p for p in Post.all_objects.select_for_update().filter(id__in=[p["id"] for p in posts])}
            for post in posts:
                now = locked_posts.get(post["id"])
                if now is None or now.on_event_id is not None:
                    raise CommandError(f"Post {post['id']} changed since the plan; nothing was moved. Re-run.")
            locked = {r.id: r for r in Reputation.objects.select_for_update().filter(id__in=ids)}
            for meet in moving:
                for row in meet.rows:
                    now = locked.get(row["id"])
                    if now is None or now.source != "irl" or now.event_id is not None or now.meet_slug != meet.slug:
                        raise CommandError(f"Row {row['id']} changed since the plan; nothing was moved. Re-run.")
                if _has_event_tap(meet.pair, meet.event.id):
                    raise CommandError(f"Pair of {meet.slug} got an event tap meanwhile; nothing was moved. Re-run.")
            backup = {
                "command": "retag_event_taps",
                "created_at": datetime.now(dt_timezone.utc).isoformat(),
                "events": [e.id for e in events],
                "rows": [
                    {"id": row["id"], "source": locked[row["id"]].source, "event_id": locked[row["id"]].event_id,
                     "new_source": "event", "new_event_id": meet.event.id, "meet_slug": meet.slug}
                    for meet in moving for row in meet.rows
                ],
                "posts": [
                    {"id": post["id"], "on_event_id": locked_posts[post["id"]].on_event_id,
                     "new_on_event_id": post["event"].id}
                    for post in posts
                ],
            }
            path = _write_backup(backup, backup_dir, [e.id for e in events])
            self.stdout.write(f"Backup written: {path}")
            for event in events:
                event_ids = [r["id"] for m in moving if m.event.id == event.id for r in m.rows]
                if event_ids:
                    Reputation.objects.filter(id__in=event_ids).update(source="event", event=event)
                post_ids = [p["id"] for p in posts if p["event"].id == event.id]
                if post_ids:
                    Post.all_objects.filter(id__in=post_ids).update(on_event=event)
        return path

    def _revert(self, path):
        try:
            with open(path) as f:
                backup = json.load(f)
            rows = backup["rows"]
        except (OSError, ValueError, KeyError) as e:
            raise CommandError(f"Can't read backup {path}: {e}")
        if backup.get("command") != "retag_event_taps":
            raise CommandError(f"{path} is not a retag_event_taps backup.")
        by_id = {r["id"]: r for r in rows}
        posts = {p["id"]: p for p in backup.get("posts", [])}
        with transaction.atomic():
            locked_posts = {p.id: p for p in Post.all_objects.select_for_update().filter(id__in=list(posts))}
            for post_id, post in posts.items():
                now = locked_posts.get(post_id)
                if now is None:
                    raise CommandError(f"Post {post_id} no longer exists; nothing was reverted.")
                if now.on_event_id != post["new_on_event_id"]:
                    raise CommandError(f"Post {post_id} changed after the move (on_event={now.on_event_id}); "
                                       f"nothing was reverted.")
            for post_id, post in posts.items():
                Post.all_objects.filter(id=post_id).update(on_event_id=post["on_event_id"])
            locked = {r.id: r for r in Reputation.objects.select_for_update().filter(id__in=list(by_id))}
            for row_id, row in by_id.items():
                now = locked.get(row_id)
                if now is None:
                    raise CommandError(f"Row {row_id} no longer exists; nothing was reverted.")
                if now.source != row["new_source"] or now.event_id != row["new_event_id"]:
                    raise CommandError(f"Row {row_id} changed after the move (source={now.source}, "
                                       f"event={now.event_id}); nothing was reverted.")
            groups = defaultdict(list)
            for row_id, row in by_id.items():
                groups[(row["source"], row["event_id"])].append(row_id)
            for (source, event_id), ids in groups.items():
                Reputation.objects.filter(id__in=ids).update(source=source, event_id=event_id)
        self.stdout.write(self.style.SUCCESS(f"Reverted {len(by_id)} rows and {len(posts)} posts from {path}."))
        events = list(Post.objects.filter(id__in=backup.get("events", [])))
        self._clear_caches(events)

    def _clear_caches(self, events):
        # event-analytics, event-taps, event-social-graph and event-top-users
        # are computed on every request: there is no server cache to drop.
        # The dashboard picks the change up on its next load (or 30 s poll).
        ids = ", ".join(str(e.id) for e in events)
        self.stdout.write(f"Analytics for event {ids}: computed per request, nothing cached to clear.")

    # ── Formatting ───────────────────────────────────────────────────────

    def _zone(self, name, event):
        if not name:
            from posts.view_pac.event_taps import _event_timezone
            name = _event_timezone(event) or "UTC"
        try:
            return ZoneInfo(name)
        except (ZoneInfoNotFoundError, ValueError):
            raise CommandError(f"Unknown time zone {name!r}.")

    def _fmt(self, when):
        return when.astimezone(self.tz).strftime("%Y-%m-%d %H:%M:%S %Z")


def _title(event):
    return " ".join((event.about or "").split())[:80] or "(untitled)"


def _has_event_tap(pair, event_id):
    """Same test as a second tap at the event (process_nfc_connect's already_networked)."""
    a, b = tuple(pair)
    return Reputation.objects.filter(event_id=event_id, is_checkin=False, post__isnull=True).filter(
        Q(user_id=a, given_by_id=b) | Q(user_id=b, given_by_id=a)).exists()


def _people_present(events, moving):
    """{event id: user ids seen there}: checked in, or in a tap at the event
    (existing event taps, and the meets this run moves)."""
    ids = [e.id for e in events]
    present = {e.id: set() for e in events}
    for event_id, user_id in EventCheckin.objects.filter(post_id__in=ids, is_registered=True).values_list(
            "post_id", "user_id"):
        present[event_id].add(user_id)
    taps = Reputation.objects.filter(event_id__in=ids, is_checkin=False, post__isnull=True, source="event")
    for event_id, user_id, given_by_id in taps.values_list("event_id", "user_id", "given_by_id"):
        present[event_id] |= {user_id, given_by_id}
    for meet in moving:
        present[meet.event.id] |= set(meet.pair)
    return present


def _event_inside_cell(event, cell):
    """True when the tap's cell is coarser than the event's and contains it."""
    try:
        res = h3.get_resolution(cell)
        return res < h3.get_resolution(event.h3_geo) and h3.cell_to_parent(event.h3_geo, res) == cell
    except Exception:
        return False


def _usernames(user_ids):
    return dict(User.all_objects.filter(user_id__in=user_ids).values_list("user_id", "username"))


def _reason_kind(reason):
    return reason.split(" (")[0].split(";")[0]


def _meet_counts_changed(moving):
    """How many of the people in these meets get a different meet count (the
    "#14 for @a" number) or pair history after the move, by grouping their
    rows the way meets.py does, before and after."""
    new = {r["id"]: m.event.id for m in moving for r in m.rows}
    people = {u for m in moving for u in m.pair}
    changed = 0
    for user_id in people:
        rows = list(tap_rows().filter(Q(user_id=user_id) | Q(given_by_id=user_id)).values(*ROW_FIELDS))
        moved = [dict(r, source="event", event_id=new[r["id"]]) if r["id"] in new else r for r in rows]
        if _shape(rows, user_id) != _shape(moved, user_id):
            changed += 1
    return changed


def _shape(rows, user_id):
    """(their meet count, meetings per pair) as meet_count and pair_history count them."""
    own = [r for r in rows if r["user_id"] == user_id]
    per_pair = Counter()
    for key in group_rows(rows):
        low, high = key.split(":")[:2]
        per_pair[(low, high)] += 1
    return len(group_rows(own)), sorted(per_pair.items())


def _write_backup(backup, backup_dir, event_ids):
    stamp = datetime.now(dt_timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    name = f"retag_event_taps-{'-'.join(map(str, event_ids))}-{stamp}.json"
    path = os.path.abspath(os.path.join(backup_dir, name))
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "x") as f:
        json.dump(backup, f, indent=2)
    return path
