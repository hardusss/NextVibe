from django.contrib import admin
from .models import User, HistorySearch, Notification, UserOnlineSession
from django.contrib import admin

@admin.register(User)
class UserAdmin(admin.ModelAdmin):
    list_display = ["username", "email", "is_online", "is_baned"]

    list_filter = ('is_baned', 'is_staff', 'is_superuser', 'is_active')

    search_fields = ('username', 'email')

    def get_queryset(self, request):
        return User.all_objects.all()

admin.site.register(HistorySearch)
admin.site.register(Notification)
admin.site.register(UserOnlineSession)
