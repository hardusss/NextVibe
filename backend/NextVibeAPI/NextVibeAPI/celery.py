import os
from celery import Celery
from celery.signals import worker_ready

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "NextVibeAPI.settings")

app = Celery("NextVibeAPI")
app.config_from_object("django.conf:settings", namespace="CELERY")
app.autodiscover_tasks()

@worker_ready.connect
def at_start(sender, **kwargs):
    from posts.tasks import auto_moderation_check
    auto_moderation_check.delay()
