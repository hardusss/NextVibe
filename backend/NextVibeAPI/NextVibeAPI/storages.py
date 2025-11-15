from storages.backends.s3boto3 import S3Boto3Storage
from django.conf import settings

class R2Storage(S3Boto3Storage):
    default_acl = "public-read"
    file_overwrite = False
    custom_domain = settings.AWS_S3_CUSTOM_DOMAIN

    def url(self, name):
        url = super().url(name)
        if not url.startswith("http"):
            return f"{self.custom_domain}/{name}"
        return url
