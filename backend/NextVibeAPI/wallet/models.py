from django.db import models
from decimal import Decimal


class BtcWallet(models.Model):
    address = models.CharField(max_length=255)
    wallet_name = models.CharField(max_length=255)
    created_at = models.DateTimeField(auto_now_add=True)
    
    def __str__(self):
        return f"Btc wallet {self.address}"

class SolWallet(models.Model):
    address = models.CharField(max_length=255)
    private_key = models.CharField(max_length=255)
    created_at = models.DateTimeField(auto_now_add=True)
    def __str__(self):
        return f"Sol wallet {self.address}"

class TrxWallet(models.Model):
    address = models.CharField(max_length=255)
    public_key = models.CharField(max_length=255)
    private_key = models.CharField(max_length=255)
    created_at = models.DateTimeField(auto_now_add=True)
    
    def __str__(self):
        return f"Trx wallet {self.address}"

class UserWallet(models.Model):
    user = models.ForeignKey("user.User", on_delete=models.CASCADE, related_name="wallets")
    btc_wallet = models.ForeignKey(BtcWallet, on_delete=models.CASCADE, null=True, blank=True)
    sol_wallet = models.ForeignKey(SolWallet, on_delete=models.CASCADE, null=True, blank=True)
    trx_wallet = models.ForeignKey(TrxWallet, on_delete=models.CASCADE, null=True, blank=True)

    @property
    def btc_address(self):
        return self.btc_wallet.address if self.btc_wallet else None

    @property
    def sol_address(self):
        return self.sol_wallet.address if self.sol_wallet else None

    @property
    def trx_address(self):
        return self.trx_wallet.address if self.trx_wallet else None
    
    def __str__(self):
        return f"Wallet {self.user.username}"
    