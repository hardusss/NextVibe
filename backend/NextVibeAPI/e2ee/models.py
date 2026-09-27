"""
Public keys for end-to-end encrypted chats. Each app install ("device") makes
an X25519 key pair and publishes the public half here through the realtime
service (socket_service/src/e2ee.py, which reads and writes this table); the
secret half never leaves the phone. Messages are sealed for every device of
both people, so the server can't read them.
"""
from django.conf import settings
from django.db import models


class Device(models.Model):
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="e2ee_devices")
    device_id = models.CharField(max_length=64)
    # base64 of the 32-byte X25519 public key
    public_key = models.CharField(max_length=64)
    created_at = models.DateTimeField(auto_now_add=True)
    last_seen_at = models.DateTimeField(auto_now=True)

    class Meta:
        constraints = [models.UniqueConstraint(fields=["user", "device_id"], name="unique_e2ee_device")]

    def __str__(self):
        return f"{self.device_id} of user {self.user_id}"
