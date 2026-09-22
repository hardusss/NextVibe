from django.apps import AppConfig
from django.db.models.signals import post_migrate


class PostsConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'posts'

    def ready(self):
        # Past taps get their Proof of Meet slugs after every migrate (posts/src/meets.py)
        from .src.meets import fill_meet_slugs_after_migrate

        post_migrate.connect(fill_meet_slugs_after_migrate, sender=self, dispatch_uid="posts.fill_meet_slugs")
