from django.contrib import admin

from .models import Transaction


@admin.register(Transaction)
class TransactionAdmin(admin.ModelAdmin):
    list_display = (
        "signature_short",
        "address",
        "slot",
        "block_time",
        "fee",
        "status",
        "source",
        "created_at",
    )
    list_filter = ("status", "source", "created_at")
    search_fields = ("signature", "address")
    readonly_fields = (
        "signature",
        "address",
        "slot",
        "block_time",
        "fee",
        "status",
        "source",
        "raw_data",
        "created_at",
    )
    ordering = ("-created_at",)

    @admin.display(description="Signature")
    def signature_short(self, obj: Transaction) -> str:
        sig = obj.signature
        if len(sig) <= 20:
            return sig
        return f"{sig[:8]}…{sig[-8:]}"

    def has_add_permission(self, request) -> bool:
        return False

    def has_change_permission(self, request, obj=None) -> bool:
        return False

    def has_delete_permission(self, request, obj=None) -> bool:
        return False
