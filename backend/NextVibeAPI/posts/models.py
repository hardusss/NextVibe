from django.db import models
from django.conf import settings
from .managers import PostsManager, CommentManager, CommentReplyManager
from decimal import Decimal


class Post(models.Model):
    class Meta:
        indexes = [
            models.Index(fields=['-create_at', '-count_likes']),
            models.Index(fields=['owner', '-create_at']),
        ]
    owner = models.ForeignKey("user.User", on_delete=models.CASCADE)
    about = models.TextField(max_length=255, default="", null=True, blank=True)
    count_likes = models.IntegerField(default=0, null=True)
    create_at = models.DateTimeField(auto_now_add=True)
    location = models.CharField(default=None, null=True, blank=True, max_length=255)
    h3_geo = models.CharField(default=None, null=True, blank=True, max_length=255)
    is_ai_generated = models.BooleanField(default=False)
    is_approved = models.BooleanField(default=False)  
    moderation_status = models.CharField(max_length=20, default="pending")
    categories = models.JSONField(default=list, blank=True)
    is_comments_enabled = models.BooleanField(default=True, blank=True, null=True)
    is_luma_event = models.BooleanField(default=False)
    luma_event_url = models.CharField(default=None, null=True, blank=True, max_length=255)
    luma_event_verified = models.BooleanField(default=False)
    luma_event_start_time = models.DateTimeField(default=None, null=True, blank=True)
    luma_event_end_time = models.DateTimeField(default=None, null=True, blank=True)
    is_hide = models.BooleanField(default=False)
    # NFT logic
    is_nft = models.BooleanField(default=False)
    
    # Limited Edition
    total_supply = models.IntegerField(default=50, null=True, blank=True)
    minted_count = models.IntegerField(default=0)
    objects = PostsManager()
    all_objects = models.Manager()


    def __str__(self):
        return f"Post by {self.owner.username} with id {self.id}"

class PostsMedia(models.Model):
    post = models.ForeignKey(Post, on_delete=models.CASCADE, related_name="media")
    file = models.FileField(upload_to='posts_media/')
    preview = models.ImageField(upload_to='posts_previews/', null=True, blank=True)
    uploaded_at = models.DateTimeField(auto_now_add=True)

    @property
    def file_url(self):
        """Return full file URL"""
        if self.file:
            return f"https://{settings.AWS_S3_CUSTOM_DOMAIN}/{self.file.name}"
        return None
    
    @property
    def preview_url(self):
        """Return full preview URL"""
        if self.preview:
            return f"https://{settings.AWS_S3_CUSTOM_DOMAIN}/{self.preview.name}"
        return None

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

    def __str__(self) -> str:
        return f"{self.reporter.username} report for post (ID {self.post.id}) with report type: {self.report_type}"

class Comment(models.Model):
    owner = models.ForeignKey("user.User", on_delete=models.CASCADE)
    post = models.ForeignKey(Post, on_delete=models.CASCADE)
    content = models.TextField(max_length=255)
    create_at = models.DateTimeField(auto_now_add=True)
    count_likes = models.IntegerField(default=0, null=True)
    objects = CommentManager()
    all_objects = models.Manager()
    
    def __str__(self) -> str:
        return f"Comment by {self.owner.user_id} in post {self.post.id}"

class CommentReply(models.Model):
    owner = models.ForeignKey("user.User", on_delete=models.CASCADE)
    comment = models.ForeignKey(Comment, on_delete=models.CASCADE, related_name="replies")
    content = models.TextField(max_length=255)
    create_at = models.DateTimeField(auto_now_add=True)
    count_likes = models.IntegerField(default=0, null=True)
    objects = CommentReplyManager()
    all_objects = models.Manager()

    def __str__(self) -> str:
        return f"Reply by {self.owner.user_id} in comment {self.comment.id}"

# --- NEW MODEL: USER COLLECTION (Who claimed what) ---
class UserCollection(models.Model):
    user = models.ForeignKey(
        "user.User",
        on_delete=models.CASCADE,
        related_name='nft_collection'
    )
    post = models.ForeignKey(
        Post,
        on_delete=models.CASCADE,
        related_name='mints'
    )
    asset_id = models.CharField(max_length=64, unique=True)   # cNFT assetId (PublicKey)
    signature = models.CharField(max_length=128, null=True, blank=True)  # base64 tx sig
    edition = models.PositiveIntegerField(default=1)           # edition number (1 of 50)
    price = models.DecimalField(max_digits=10, decimal_places=6, default=Decimal('0'))  # SOL price
    minted_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-minted_at']
        verbose_name = "NFT Item"
        unique_together = ('user', 'post')  # one user = one mint on post

    def __str__(self):
        return f"NFT #{self.edition} of post {self.post.id} owned by {self.user.username}"
    