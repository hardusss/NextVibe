from django.apps import AppConfig
from django.db.models.signals import post_delete, post_migrate


class PostsConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'posts'

    def ready(self):
        # Past taps get their Proof of Meet slugs after every migrate (posts/src/meets.py)
        from .src.meets import fill_meet_slugs_after_migrate

        post_migrate.connect(fill_meet_slugs_after_migrate, sender=self, dispatch_uid="posts.fill_meet_slugs")

        # POAPs not on Solana yet go with a removed check-in or a deleted event (posts/signals.py)
        from .models import EventCheckin, Post
        from .signals import checkin_deleted, post_deleted

        post_delete.connect(checkin_deleted, sender=EventCheckin, dispatch_uid="posts.collectibles.checkin_deleted")
        post_delete.connect(post_deleted, sender=Post, dispatch_uid="posts.collectibles.post_deleted")
