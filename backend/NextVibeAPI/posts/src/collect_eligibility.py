"""Eligibility helpers for the free collect flow (IRL reservation rules)."""

from datetime import timedelta

from django.db.models import Q
from django.utils import timezone

from ..constants import (
    COLLECT_IRL_RESERVE_HOURS,
    COLLECT_IRL_RESERVED_EDITIONS,
    COLLECT_MAX_EDITIONS,
)


def _tap_qs():
    from ..models import Reputation
    # Networking taps are non-checkin Reputation rows; collect bonuses are
    # tagged post_type="collect" and must not feed back into eligibility.
    return Reputation.objects.filter(is_checkin=False).exclude(post_type="collect")


def is_irl_connected(user, post) -> bool:
    """
    True if the user met the post author IRL:
      a) a networking tap (non-checkin Reputation row) exists between the
         user and the post owner, in either direction, or
      b) the post was created during an event the user checked into.
    """
    from ..models import EventCheckin

    owner = post.owner
    if _tap_qs().filter(
        Q(user=user, given_by=owner) | Q(user=owner, given_by=user)
    ).exists():
        return True

    if post.on_event_id:
        return EventCheckin.objects.filter(user=user, post_id=post.on_event_id).exists()

    return False


def irl_connected_map(user, posts) -> dict:
    """
    Batch variant of is_irl_connected for feed serialization.
    Returns {post_id: bool} using three queries total.
    """
    from ..models import EventCheckin

    posts = list(posts)
    owner_ids = {p.owner_id for p in posts}
    event_ids = {p.on_event_id for p in posts if p.on_event_id}

    tapped_owner_ids = set(
        _tap_qs().filter(user=user, given_by_id__in=owner_ids).values_list("given_by_id", flat=True)
    ) | set(
        _tap_qs().filter(given_by=user, user_id__in=owner_ids).values_list("user_id", flat=True)
    )

    checked_in_event_ids = set(
        EventCheckin.objects.filter(user=user, post_id__in=event_ids).values_list("post_id", flat=True)
    ) if event_ids else set()

    return {
        p.id: (p.owner_id in tapped_owner_ids)
        or (p.on_event_id in checked_in_event_ids if p.on_event_id else False)
        for p in posts
    }


def reserved_editions_active(post, now=None) -> bool:
    """
    True while the post's early editions (2..1+COLLECT_IRL_RESERVED_EDITIONS)
    are still reserved for IRL-connected users: the post is younger than the
    reservation window and the next edition falls inside the reserved range.
    """
    now = now or timezone.now()
    if (now - post.create_at) >= timedelta(hours=COLLECT_IRL_RESERVE_HOURS):
        return False
    total = post.total_supply or COLLECT_MAX_EDITIONS
    next_edition = post.minted_count + 1
    return next_edition <= min(1 + COLLECT_IRL_RESERVED_EDITIONS, total)
