from django.db import models
from cloudinary.models import CloudinaryField

class Post(models.Model):
    owner = models.ForeignKey("user.User", on_delete=models.CASCADE)
    about = models.TextField(max_length=255, default="", null=True, blank=True)
    count_likes = models.IntegerField(default=0, null=True)
    create_at = models.DateTimeField(auto_now_add=True)
    location = models.CharField(default=None, null=True, blank=True, max_length=255)
    is_ai_generated = models.BooleanField(default=False)
    is_approved = models.BooleanField(default=False)  
    moderation_status = models.CharField(max_length=20, default="pending")
    categories = models.JSONField(default=list, blank=True)

    def __str__(self):
        return f"Post by {self.owner.username} with id {self.id}"

class PostsMedia(models.Model):
    post = models.ForeignKey(Post, on_delete=models.CASCADE, related_name="media")
    file = CloudinaryField(resource_type="auto")
    uploaded_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"Media for Post {self.post.id}"
    
class PostReport(models.Model):
    class ReportType(models.TextChoices):
        SPAM = 'spam', 'Spam'
        NUDITY = 'nudity', 'Nudity / Sexual Content'
        VIOLENCE = 'violence', 'Violence / Threats'
        HATE_SPEECH = 'hate_speech', 'Hate Speech'
        SCAM = 'scam', 'Scam / Fraud'
        ILLEGAL = 'illegal_activity', 'Illegal Activity'
        OTHER = 'other', 'Other'

    class Meta:
        unique_together = ('post', 'reporter')

    post = models.ForeignKey(Post, on_delete=models.CASCADE)
    reporter = models.ForeignKey("user.User", on_delete=models.CASCADE)
    report_type = models.CharField(
        max_length=20,
        choices=ReportType.choices,
        default=ReportType.SPAM
    )
    description = models.TextField(null=True, blank=True, default="")
    created_at = models.DateTimeField(auto_now_add=True)

class Comment(models.Model):
    owner = models.ForeignKey("user.User", on_delete=models.CASCADE)
    post = models.ForeignKey(Post, on_delete=models.CASCADE)
    content = models.TextField(max_length=255)
    create_at = models.DateTimeField(auto_now_add=True)
    count_likes = models.IntegerField(default=0, null=True)
    
    def __str__(self) -> str:
        return f"Comment by {self.owner.user_id} in post {self.post.id}"

class CommentReply(models.Model):
    owner = models.ForeignKey("user.User", on_delete=models.CASCADE)
    comment = models.ForeignKey(Comment, on_delete=models.CASCADE)
    content = models.TextField(max_length=255)
    create_at = models.DateTimeField(auto_now_add=True)
    count_likes = models.IntegerField(default=0, null=True)
    
    def __str__(self) -> str:
        return f"Reply by {self.owner.user_id} in comment {self.comment.id}"
