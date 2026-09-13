from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("user", "0002_user_seeker_sgt_mint_user_seeker_verified_and_more"),
    ]

    operations = [
        migrations.AddField(
            model_name="user",
            name="apple_user_id",
            field=models.CharField(blank=True, max_length=100, null=True, unique=True),
        ),
    ]
