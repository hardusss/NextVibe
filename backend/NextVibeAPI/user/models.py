from django.contrib.auth.models import AbstractBaseUser, BaseUserManager
from django.db import models
from django.utils import timezone
from datetime import timedelta
from django.utils.crypto import get_random_string
from django.db.models.signals import post_save
from django.dispatch import receiver

class UserQuerySet(models.QuerySet):
    def visible(self):
        return self.filter(is_baned=False)
    
class UserManager(BaseUserManager):
    def get_queryset(self):
        return super().get_queryset().filter(is_baned=False)
    
    def create_user(self, email, username, password=None, **extra_fields):
        if not email:
            raise ValueError("The Email field must be set")
        email = self.normalize_email(email)
        user = self.model(email=email, username=username, **extra_fields)
        user.set_password(password)
        user.save(using=self._db)
        return user

    def create_superuser(self, email, username, password=None, **extra_fields):
        extra_fields.setdefault('is_staff', True)
        extra_fields.setdefault('is_superuser', True)

        return self.create_user(email, username, password, **extra_fields)


class User(AbstractBaseUser):
    user_id = models.AutoField(primary_key=True, unique=True)
    avatar = models.ImageField(upload_to='images/', default='images/default.png')
    about = models.CharField(default="",max_length=120, null=True, blank=True)
    username = models.CharField(max_length=150, unique=True)
    email = models.EmailField(unique=True)
    password = models.CharField(max_length=128, null=True)
    created_at = models.DateTimeField(auto_now_add=True)
    post_count = models.IntegerField(default=0)
    readers_count = models.IntegerField(default=0)
    follows_count = models.IntegerField(default=0)
    follow_for = models.JSONField(blank=True, null=True, default=list)
    readers = models.JSONField(blank=True, null=True, default=list)
    liked_posts = models.JSONField(blank=True, null=True, default=list)
    liked_comments = models.JSONField(blank=True, null=True, default=list)
    liked_comment_replies = models.JSONField(blank=True, null=True, default=list)
    secret_2fa = models.CharField(max_length=100, null=True, blank=True, default=None)
    is2FA = models.BooleanField(default=False)
    official = models.BooleanField(default=False, null=True)
    count_generations_ai = models.IntegerField(default=1, null=True, blank=True)
    is_online = models.BooleanField(default=False)
    is_staff = models.BooleanField(default=False)
    is_superuser = models.BooleanField(default=False)
    is_active = models.BooleanField(default=True)
    is_baned = models.BooleanField(default=False)
    last_activity = models.DateTimeField(default=timezone.now)
    wallet_address = models.CharField(max_length=50, blank=True, null=True)
    expo_push_token = models.CharField(max_length=100, blank=True, null=True)
    from_invite_code = models.ForeignKey("InviteUser", on_delete=models.SET_NULL, null=True, blank=True, related_name="invited_users")
    
    USERNAME_FIELD = 'email'
    REQUIRED_FIELDS = ['username']
    objects = UserManager()
    all_objects = models.Manager()

    def __str__(self):
        return self.username

    def has_perm(self, perm, obj=None):
        return self.is_superuser

    def has_module_perms(self, app_label):
        return self.is_superuser

class InviteUser(models.Model):
    owner = models.OneToOneField(User, on_delete=models.CASCADE)
    invite_code = models.CharField(max_length=6, unique=True)
    invited_count = models.IntegerField(default=0, null=True, blank=True)
    
    def save(self, *args, **kwargs):
        # If code not created
        if not self.invite_code:
            # Generate str with 6 length
            new_code = get_random_string(length=6)

            while InviteUser.objects.filter(invite_code=new_code).exists():
                new_code = get_random_string(length=6)
                
            self.invite_code = new_code
            
        super().save(*args, **kwargs)

    def __str__(self):
        return f"Invite profile of {self.owner} ({self.invite_code}) have {self.invited_count} refs"
    
class HistorySearch(models.Model):
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="user_history")
    searched_user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="searched_user")

class Notification(models.Model):
    NOTIFICATION_TYPES = (
        ('like', 'Like'),
        ('comment', 'Comment'),
        ('comment_reply', "Comment Reply"),
        ('comment_like', "Comment Like"),
        ('follow', 'Follow'),
        ('revived_transaction', "Recived Transaction"),
        ('deleted_post', 'Post Deleted'),
        ("moderation_success", "Moderation Success"),
        ("moderation_fail", "Moderation Fail"),
    )

    sender = models.ForeignKey(
        User, on_delete=models.CASCADE, related_name="sent_notifications", null=True, blank=True
    )
    recipient = models.ForeignKey(
        User, on_delete=models.CASCADE, related_name="received_notifications"
    )
    notification_type = models.CharField(max_length=20, choices=NOTIFICATION_TYPES)
    post = models.ForeignKey(
        "posts.Post", on_delete=models.CASCADE, null=True, blank=True, related_name="notifications"
    )
    comment = models.ForeignKey(
        "posts.Comment", on_delete=models.CASCADE, null=True, blank=True, related_name="notifications"
    )
    comment_reply = models.ForeignKey(
        "posts.CommentReply", on_delete=models.CASCADE, null=True, blank=True, related_name="notifications"
    )

    text_preview = models.CharField(max_length=255, blank=True)
    is_read = models.BooleanField(default=False)
    created_at = models.DateTimeField(default=timezone.now)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f"{self.sender if self.sender is not None else 'System'} -> {self.recipient} ({self.notification_type})"
    

class UserOnlineSession(models.Model):
    user = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="online_sessions"
    )

    connected_at = models.DateTimeField(auto_now_add=True)
    disconnected_at = models.DateTimeField(null=True, blank=True)

    def session_duration(self) -> timedelta:
        """
        Return session duration
        """
        end_time = self.disconnected_at or timezone.now()
        return end_time - self.connected_at

class OgAvatarMint(models.Model):
    user = models.OneToOneField(
        User, 
        on_delete=models.CASCADE, 
        related_name="og_avatar"
    )
    edition = models.PositiveIntegerField(unique=True) 
    asset_id = models.CharField(max_length=64, unique=True, null=True, blank=True)
    signature = models.CharField(max_length=128, null=True, blank=True)
    minted_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = "OG Avatar Mint"

@receiver(post_save, sender=User)
def create_user_invite_profile(sender, instance, created, **kwargs):
    """
    Thats signal works every time, when save User model
    """
    if created:
        InviteUser.objects.get_or_create(owner=instance)
