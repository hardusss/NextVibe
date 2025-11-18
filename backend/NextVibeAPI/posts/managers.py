from django.db import models


class PostsQuerySet(models.QuerySet):
    def with_active_owner(self):
        return self.filter(owner__is_baned=False)

class PostsManager(models.Manager):
    def get_queryset(self):
        return PostsQuerySet(self.model, using=self._db).with_active_owner()
    

class CommentQuerySet(models.QuerySet):
    def with_active_owner(self):
        return self.filter(owner__is_baned=False)

class CommentManager(models.Manager):
    def get_queryset(self):
        return CommentQuerySet(self.model, using=self._db).with_active_owner()

    
class CommentReplyQuerySet(models.QuerySet):
    def with_active_owner(self):
        return self.filter(owner__is_baned=False)

class CommentReplyManager(models.Manager):
    def get_queryset(self):
        return CommentReplyQuerySet(self.model, using=self._db).with_active_owner()
