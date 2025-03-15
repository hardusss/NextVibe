from django.contrib.auth.models import AbstractBaseUser, BaseUserManager
from django.db import models


class UserManager(BaseUserManager):
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

    def get_by_natural_key(self, email):
        return self.get(email=email)


class User(AbstractBaseUser):
    user_id = models.AutoField(primary_key=True, unique=True)
    avatar = models.ImageField(upload_to='images/', default='images/default.png')
    about = models.CharField(default="",max_length=120, null=True)
    username = models.CharField(max_length=150, unique=True)
    email = models.EmailField(unique=True)
    password = models.CharField(max_length=128, null=True)
    created_at = models.DateTimeField(auto_now_add=True)
    post_count = models.IntegerField(default=0)
    readers_count = models.IntegerField(default=0)
    follows_count = models.IntegerField(default=0)
    follow_for = models.JSONField(blank=True, null=True, default=list)
    liked_posts = models.JSONField(blank=True, null=True, default=list)
    secret_2fa = models.CharField(max_length=100, null=True, default=None)
    is2FA = models.BooleanField(default=False)
    official = models.BooleanField(default=False, null=True)
    is_staff = models.BooleanField(default=False)
    is_superuser = models.BooleanField(default=False)
    is_active = models.BooleanField(default=True)
    USERNAME_FIELD = 'email'
    REQUIRED_FIELDS = ['username']
    objects = UserManager()

    def __str__(self):
        return self.username

    def has_perm(self, perm, obj=None):
        return self.is_superuser

    def has_module_perms(self, app_label):
        return self.is_superuser

    
class HistorySearch(models.Model):
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="user_history")
    searched_user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="searched_user")