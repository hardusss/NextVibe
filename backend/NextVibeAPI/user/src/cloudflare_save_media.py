import boto3
import os
from django.conf import settings
from django.core.files.uploadedfile import UploadedFile


def get_s3_client():
    """Create S3 client for R2"""
    return boto3.client(
        's3',
        endpoint_url=settings.AWS_S3_ENDPOINT_URL,
        aws_access_key_id=settings.AWS_ACCESS_KEY_ID,
        aws_secret_access_key=settings.AWS_SECRET_ACCESS_KEY,
        region_name='auto',
        config=boto3.session.Config(signature_version='s3v4')
    )


def save_file_to_storage(file, filename, folder="uploads", is_qr: bool = False, email: str | None = None):
    """
    Save file to R2 storage
    """
    try:
        
        if is_qr:
            file_path = f"{folder}/{email}_qr_code.png"
        else:
            from uuid import uuid4
            unique_filename = f"{uuid4().hex}_{filename}"
            file_path = f"{folder}/{unique_filename}"
        
        content_type = 'application/octet-stream'
        if hasattr(file, 'content_type'):
            content_type = file.content_type
        else:
            ext = os.path.splitext(filename)[1].lower()
            content_types = {
                '.jpg': 'image/jpeg',
                '.jpeg': 'image/jpeg',
                '.png': 'image/png',
                '.gif': 'image/gif',
                '.mp4': 'video/mp4',
                '.webm': 'video/webm',
            }
            content_type = content_types.get(ext, 'application/octet-stream')
        
        if hasattr(file, 'read'):
            file_content = file.read()
            if hasattr(file, 'seek'):
                file.seek(0) 
        else:
            raise ValueError("File object must have 'read' method")

        s3_client = get_s3_client()
        s3_client.put_object(
            Bucket=settings.AWS_STORAGE_BUCKET_NAME,
            Key=file_path,
            Body=file_content,
            ContentType=content_type,
            CacheControl='max-age=86400'
        )

        return file_path
        
    except Exception as e:
        print(f"❌ Error saving file: {e}")
        raise e
