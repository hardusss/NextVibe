from django.contrib import admin
from .models import BtcWallet, SolWallet, TrxWallet, UserWallet

admin.site.register(BtcWallet)
admin.site.register(SolWallet)
admin.site.register(TrxWallet)
admin.site.register(UserWallet)
