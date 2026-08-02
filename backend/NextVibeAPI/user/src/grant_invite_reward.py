import random
from posts.models import Reputation

def check_and_grant_invite_rewards(inviter_user, new_user=None):
    """
    Checks if the inviter has reached milestone 2 (invited_count >= 2).
    If so, grants a random reputation drop between 20 and 50 points if not already awarded.
    """
    if not inviter_user:
        return None

    from user.models import InviteUser
    try:
        invite_data = InviteUser.objects.get(owner=inviter_user)
    except InviteUser.DoesNotExist:
        return None

    if (invite_data.invited_count or 0) >= 2:
        already_granted = Reputation.objects.filter(
            user=inviter_user,
            post_type="invite_reward_lvl2"
        ).exists()

        if not already_granted:
            given_by = new_user if new_user else inviter_user
            points = random.randint(20, 50)
            Reputation.objects.create(
                user=inviter_user,
                given_by=given_by,
                points=points,
                post_type="invite_reward_lvl2"
            )
            return points

    return None
