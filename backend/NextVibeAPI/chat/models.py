from django.db import models
from django.contrib.auth import get_user_model

User = get_user_model()

class Chat(models.Model):
    participants = models.ManyToManyField(User, related_name='chats')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    def __str__(self):
        return f"Chat {self.id}"


class Message(models.Model):
    chat = models.ForeignKey(Chat, on_delete=models.CASCADE, related_name='messages')
    sender = models.ForeignKey(User, on_delete=models.CASCADE)
    text = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    is_read = models.BooleanField(default=False)

    def __str__(self):
        return f"Message {self.id} in Chat {self.chat.id}"

class MediaAttachment(models.Model):
    message = models.ForeignKey(Message, on_delete=models.CASCADE, related_name='media')
    file = models.FileField(upload_to='chat_media/')
    caption = models.CharField(max_length=255, blank=True)
    media_type = models.CharField(max_length=10, choices=[('image', 'Image'), ('video', 'Video')])

    def __str__(self):
        return f"Media for Message {self.message.id}"