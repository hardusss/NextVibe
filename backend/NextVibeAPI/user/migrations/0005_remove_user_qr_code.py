# Generated by Django 5.1.5 on 2025-01-18 12:22

from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ('user', '0004_remove_user_jwt'),
    ]

    operations = [
        migrations.RemoveField(
            model_name='user',
            name='qr_code',
        ),
    ]
