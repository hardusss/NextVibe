from django.db.models import Q

from user.models import Block


def blocked_user_ids(user) -> set[int]:
    """
    Everyone hidden from `user`: the people they blocked plus the people who
    blocked them. Blocking hides both sides from each other, so every list
    filters on this set. Anonymous users get an empty set.
    """
    user_id = getattr(user, "user_id", None)
    if not user_id:
        return set()

    pairs = Block.objects.filter(
        Q(blocker_id=user_id) | Q(blocked_id=user_id)
    ).values_list("blocker_id", "blocked_id")
    return {blocked if blocker == user_id else blocker for blocker, blocked in pairs}


def is_blocked_between(user_id, other_id) -> bool:
    """True if either user blocked the other."""
    if not user_id or not other_id:
        return False
    return Block.objects.filter(
        Q(blocker_id=user_id, blocked_id=other_id) | Q(blocker_id=other_id, blocked_id=user_id)
    ).exists()
