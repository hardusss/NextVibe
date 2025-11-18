from django.db import models


class ChatQuerySet(models.QuerySet):
    def with_only_active_users(self):
        return self.exclude(participants__is_baned=True).distinct()

class ChatManager(models.Manager):
    def get_queryset(self):
        return ChatQuerySet(self.model, using=self._db).with_only_active_users()


class MessageQuerySet(models.QuerySet):
    def with_active_senders(self):
        return self.filter(sender__is_baned=False)

class MessageManager(models.Manager):
    def get_queryset(self):
        return MessageQuerySet(self.model, using=self._db).with_active_senders()


class MediaAttachmentQuerySet(models.QuerySet):
    def with_active_senders(self):
        return self.filter(message__sender__is_baned=False)

class MediaAttachmentManager(models.Manager):
    def get_queryset(self):
        return MediaAttachmentQuerySet(self.model, using=self._db).with_active_senders()
