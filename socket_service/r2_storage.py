import boto3
import os
from dotenv import load_dotenv
from botocore.exceptions import ClientError

load_dotenv()

class R2Storage:
    def __init__(self):
        self.client = boto3.client(
            's3',
            endpoint_url=f"https://{os.getenv('ENDPOINT_URL')}",
            aws_access_key_id=os.getenv('R2_ACCESS_KEY_ID'),
            aws_secret_access_key=os.getenv('R2_SECRET_ACCESS_KEY'),
            region_name='auto',
            config=boto3.session.Config(signature_version='s3v4')
        )
        self.bucket_name = os.getenv('BUCKET_NAME')
        self.custom_domain = os.getenv('CUSTOM_DOMAIN')
    
    def upload_file(self, file_data: bytes, file_path: str, content_type: str = 'application/octet-stream') -> str:
        try:
            self.client.put_object(
                Bucket=self.bucket_name,
                Key=file_path,
                Body=file_data,
                ContentType=content_type,
                CacheControl='max-age=86400'
            )
            
            url = f"https://{self.custom_domain}/{file_path}"
            return url
        except ClientError as e:
            print(f"  R2: ClientError - {e}")
            print(f"  R2: Error details - {e.response}")
            raise
        except Exception as e:
            print(f"  R2: Unexpected error - {type(e).__name__}: {e}")
            raise

r2_storage = R2Storage()