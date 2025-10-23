from django.contrib import admin
from .models import BtcWallet, SolWallet, TrxWallet, UserWallet, EthWallet

admin.site.register(BtcWallet)
admin.site.register(SolWallet)
admin.site.register(TrxWallet)
admin.site.register(UserWallet)
admin.site.register(EthWallet)