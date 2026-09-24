from django.contrib import admin
from .models import Post, PostsMedia, PostReport, Comment, CommentReply, UserCollection, EventCheckin, Reputation, MeetPhoto
from .models import Collectible, CollectibleReminder, ReminderPreference
from django.contrib import admin
from user.models import User
from .models import EventRequest
@admin.register(Post)
class PostAdmin(admin.ModelAdmin):
    def get_queryset(self, request):
        return Post.all_objects.all()
    
    def formfield_for_foreignkey(self, db_field, request, **kwargs):
        # For showing field owner even user is baned
        if db_field.name in ("owner", "co_author"):
            kwargs["queryset"] = User.all_objects.all()
        return super().formfield_for_foreignkey(db_field, request, **kwargs)


@admin.register(MeetPhoto)
class MeetPhotoAdmin(admin.ModelAdmin):
    """Proof of Meet photos. The images themselves are private: takedowns go through the app or the API."""
    list_display = ("id", "meet_slug", "photographer", "subject", "status", "retakes", "created_at", "decided_at")
    list_filter = ("status",)
    search_fields = ("meet_slug", "photographer__username", "subject__username")
    raw_id_fields = ("photographer", "subject", "post")
    readonly_fields = ("raw_key", "final_key", "raw_sha256", "asset_id_photographer", "asset_id_subject",
                       "wallet_photographer", "wallet_subject", "created_at", "sent_at", "decided_at",
                       "taken_down_at", "purged_at")

@admin.register(Collectible)
class CollectibleAdmin(admin.ModelAdmin):
    """What people hold, on Solana or not yet (posts/src/collectibles.py). Mints go through the queue, not here."""
    list_display = ("id", "user", "kind", "source_id", "status", "attempts", "asset_id", "recorded_at", "minted_at")
    list_filter = ("kind", "status")
    search_fields = ("user__username", "source_id", "asset_id", "wallet")
    raw_id_fields = ("user", "post", "counterpart")
    readonly_fields = ("metadata", "asset_id", "signature", "minted_at", "created_at", "last_attempt_at")


@admin.register(CollectibleReminder)
class CollectibleReminderAdmin(admin.ModelAdmin):
    list_display = ("id", "user", "step", "channel", "status", "created_at")
    list_filter = ("step", "channel", "status")
    search_fields = ("user__username",)
    raw_id_fields = ("user",)


@admin.register(ReminderPreference)
class ReminderPreferenceAdmin(admin.ModelAdmin):
    list_display = ("user", "wallet_reminders", "timezone", "updated_at")
    raw_id_fields = ("user",)


admin.site.register(PostsMedia)
admin.site.register(PostReport)
admin.site.register(UserCollection)
admin.site.register(EventRequest)
admin.site.register(EventCheckin)
admin.site.register(Reputation)

@admin.register(Comment)
class CommentAdmin(admin.ModelAdmin):
    def get_queryset(self, request):
        return Comment.all_objects.all()
    
    def formfield_for_foreignkey(self, db_field, request, **kwargs):
        # For showing field owner even user is baned
        if db_field.name == "owner":
            kwargs["queryset"] = User.all_objects.all()
        return super().formfield_for_foreignkey(db_field, request, **kwargs)
    
@admin.register(CommentReply)
class ReplyAdmin(admin.ModelAdmin):
    def get_queryset(self, request):
        return CommentReply.all_objects.all()
    
    def formfield_for_foreignkey(self, db_field, request, **kwargs):
        # For showing field owner even user is baned
        if db_field.name == "owner":
            kwargs["queryset"] = User.all_objects.all()
        return super().formfield_for_foreignkey(db_field, request, **kwargs)

