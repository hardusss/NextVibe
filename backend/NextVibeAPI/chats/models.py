from django.db import models


class Chat(models.Model):
    member_1 = models.ForeignKey("user.User", on_delete=models.CASCADE, related_name="memeber_1")
    member_2 = models.ForeignKey("user.User", on_delete=models.CASCADE, related_name="memeber_2")
    created_at = models.DateTimeField(auto_now_add=True)
    
    def __str__(self):
        return f"Room {self.member_1.username} with {self.member_2.username}"
    

class Message(models.Model):
    chat = models.ForeignKey(Chat, on_delete=models.CASCADE, related_name="chat")
    user = models.ForeignKey("user.User", on_delete=models.CASCADE, related_name="user")
    content = models.TextField()
    is_liked = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    def __str__(self):
        return f"Message in chat {self.chat.room_name}"