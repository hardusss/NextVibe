from django.contrib import admin
from .models import Chat, Message, MediaAttachment
from django.contrib import admin

@admin.register(Chat)
class ChatAdmin(admin.ModelAdmin):
    def get_queryset(self, request):
        return Chat.all_objects.all()

@admin.register(Message)
class MessageAdmin(admin.ModelAdmin):
    def get_queryset(self, request):
        return Message.all_objects.all()

@admin.register(MediaAttachment)
class MediaAttachmentAdmin(admin.ModelAdmin):
    def get_queryset(self, request):
        return MediaAttachment.all_objects.all()
