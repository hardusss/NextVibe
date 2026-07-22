from django.db import models
from django.contrib.auth import get_user_model
from .managers import ChatManager, MessageManager, MediaAttachmentManager

# NOTE: these models map to physical tables shared with socket_service/src/models/message_model.py — keep schemas in sync!

User = get_user_model()

class Chat(models.Model):
    participants = models.ManyToManyField(User, related_name='chats')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    objects = ChatManager()
    all_objects = models.Manager()

    def __str__(self):
        return f"Chat {self.id}"


class Message(models.Model):
    chat = models.ForeignKey(Chat, on_delete=models.CASCADE, related_name='messages')
    sender = models.ForeignKey(User, on_delete=models.CASCADE)
    client_msg_id = models.CharField(max_length=36, blank=True, null=True, db_index=True)
    reply_to = models.ForeignKey('self', on_delete=models.SET_NULL, blank=True, null=True, related_name='replies')
    text = models.TextField(blank=True, null=True, default="")
    created_at = models.DateTimeField(auto_now_add=True)
    edited_at = models.DateTimeField(blank=True, null=True)
    deleted_at = models.DateTimeField(blank=True, null=True)
    is_read = models.BooleanField(default=False)
    objects = MessageManager()
    all_objects = models.Manager()

    def __str__(self):
        return f"Message {self.id} in Chat {self.chat.id}"


class MediaAttachment(models.Model):
    message = models.ForeignKey(Message, on_delete=models.CASCADE, related_name='media')
    file = models.FileField(upload_to='chat_media/')
    preview_file = models.CharField(max_length=255, blank=True, null=True)
    objects = MediaAttachmentManager()
    all_objects = models.Manager()

    def __str__(self):
        return f"Media for Message {self.message.id}"


class MessageReceipt(models.Model):
    message = models.ForeignKey(Message, on_delete=models.CASCADE, related_name='receipts')
    user = models.ForeignKey(User, on_delete=models.CASCADE)
    delivered_at = models.DateTimeField(blank=True, null=True)
    read_at = models.DateTimeField(blank=True, null=True)

    class Meta:
        unique_together = ('message', 'user')

    def __str__(self):
        return f"Receipt for Msg {self.message.id} User {self.user.id}"


class MessageReaction(models.Model):
    message = models.ForeignKey(Message, on_delete=models.CASCADE, related_name='reactions')
    user = models.ForeignKey(User, on_delete=models.CASCADE)
    emoji = models.CharField(max_length=32)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ('message', 'user', 'emoji')

    def __str__(self):
        return f"Reaction {self.emoji} on Msg {self.message.id} by User {self.user.id}"


class UserDevice(models.Model):
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='devices')
    device_id = models.CharField(max_length=64)
    identity_key = models.TextField()
    registration_id = models.IntegerField(default=1)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ('user', 'device_id')

    def __str__(self):
        return f"Device {self.device_id} for User {self.user.id}"


class SignedPreKey(models.Model):
    device = models.ForeignKey(UserDevice, on_delete=models.CASCADE, related_name='signed_prekeys')
    key_id = models.IntegerField()
    public_key = models.TextField()
    signature = models.TextField()
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ('device', 'key_id')


class OneTimePreKey(models.Model):
    device = models.ForeignKey(UserDevice, on_delete=models.CASCADE, related_name='one_time_prekeys')
    key_id = models.IntegerField()
    public_key = models.TextField()
    is_used = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ('device', 'key_id')