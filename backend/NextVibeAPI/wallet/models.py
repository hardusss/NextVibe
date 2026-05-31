from django.db import models


class Transaction(models.Model):
    id = models.BigAutoField(primary_key=True)
    signature = models.CharField(max_length=128, unique=True)
    address = models.CharField(max_length=64)
    slot = models.BigIntegerField(null=True, blank=True)
    block_time = models.DateTimeField(null=True, blank=True)
    fee = models.BigIntegerField(null=True, blank=True)
    status = models.CharField(max_length=10)
    raw_data = models.JSONField(null=True, blank=True)
    source = models.CharField(max_length=10, default="fetch")
    created_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        managed = False
        db_table = "transactions"
        ordering = ["-created_at"]

    def __str__(self) -> str:
        return f"{self.signature[:12]}… ({self.address[:8]}…)"
