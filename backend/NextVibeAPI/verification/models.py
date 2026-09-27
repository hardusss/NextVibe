"""
Things an account has proven: a wallet it controls (it signed a NextVibe
message with it) and an email address it can read (it entered the code sent
there). Kept in their own app so the user table doesn't change.
"""
from django.conf import settings
from django.db import models


class WalletProof(models.Model):
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="wallet_proofs")
    wallet_address = models.CharField(max_length=64)
    proven_at = models.DateTimeField(auto_now=True)

    class Meta:
        constraints = [models.UniqueConstraint(fields=["user", "wallet_address"], name="unique_wallet_proof")]

    def __str__(self):
        return f"{self.user_id} proved {self.wallet_address[:8]}…"


class EmailVerification(models.Model):
    user = models.OneToOneField(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="email_verification")
    # The address the code went to; changing the account's email makes it unverified again
    email = models.EmailField(max_length=254)
    verified_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"{self.user_id} verified {self.email}"
