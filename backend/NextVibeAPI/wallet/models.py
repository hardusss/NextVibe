from django.db import models

class Transaction(models.Model):
    signature  = models.CharField(max_length=128, unique=True)
    address    = models.CharField(max_length=64)
    slot       = models.BigIntegerField(null=True)
    block_time = models.DateTimeField(null=True)
    fee        = models.BigIntegerField(null=True)
    status     = models.CharField(max_length=10)
    raw_data   = models.JSONField()
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        managed = False       
        db_table = 'transactions'