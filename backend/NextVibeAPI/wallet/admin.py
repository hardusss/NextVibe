from django.contrib import admin
from .models import Transaction

@admin.register(Transaction)
class TransactionAdmin(admin.ModelAdmin):
    list_display = ('signature', 'address', 'slot', 'block_time', 'fee', 'status', 'raw_data', 'created_at')
    list_filter = ('status', 'created_at')
    search_fields = ('signature', 'address')
    readonly_fields = ('signature', 'address', 'slot', 'block_time', 'fee', 'status', 'raw_data', 'created_at')
    ordering = ('-created_at',)
