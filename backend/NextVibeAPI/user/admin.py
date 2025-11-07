from django.contrib import admin
from .models import User, HistorySearch, Notification

admin.site.register(User)
admin.site.register(HistorySearch)
admin.site.register(Notification)
