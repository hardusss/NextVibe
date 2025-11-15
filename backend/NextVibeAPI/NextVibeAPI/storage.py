from storages.backends.s3boto3 import S3Boto3Storage
from django.conf import settings

class R2Storage(S3Boto3Storage):
    default_acl = None  
    file_overwrite = False
    custom_domain = settings.AWS_S3_CUSTOM_DOMAIN
    
    def url(self, name, parameters=None, expire=None, http_method=None):
        if self.custom_domain:
            name = name.lstrip('/')
            if name.startswith(f"{settings.AWS_STORAGE_BUCKET_NAME}/"):
                name = name[len(settings.AWS_STORAGE_BUCKET_NAME)+1:]
            return f"https://{self.custom_domain}/{name}"
        return super().url(name, parameters, expire, http_method)