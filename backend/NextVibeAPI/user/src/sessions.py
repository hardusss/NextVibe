"""Ending an account's sessions on other devices."""
from rest_framework_simplejwt.token_blacklist.models import BlacklistedToken, OutstandingToken


def revoke_refresh_tokens(user) -> int:
    """
    Revoke every refresh token issued to this account, so no device can get a
    new access token with one (access tokens run out within the hour). Used when
    the password changes and when the account is deleted. Returns how many.
    """
    revoked = 0
    for token in OutstandingToken.objects.filter(user=user).exclude(blacklistedtoken__isnull=False):
        _, created = BlacklistedToken.objects.get_or_create(token=token)
        revoked += int(created)
    return revoked
