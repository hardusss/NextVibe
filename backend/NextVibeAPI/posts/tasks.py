from celery import shared_task
from PIL import Image, ImageOps
import cv2
import os
from io import BytesIO
from .models import PostsMedia, Post
import requests
from django.contrib.auth import get_user_model
import boto3
import ffmpeg  
from django.core.files.temp import NamedTemporaryFile

from django.conf import settings
from django.utils import timezone
from datetime import timedelta

GO_MODERATION_URL = "http://127.0.0.1:8080/moderation"
User = get_user_model()


def get_s3_client():
    """Create S3 cliend for R2"""
    return boto3.client(
        's3',
        endpoint_url=settings.AWS_S3_ENDPOINT_URL,
        aws_access_key_id=settings.AWS_ACCESS_KEY_ID,
        aws_secret_access_key=settings.AWS_SECRET_ACCESS_KEY,
        region_name='auto',
        config=boto3.session.Config(signature_version='s3v4')
    )

@shared_task
def process_media_file(media_id):
    """
    Handle media file: compresses image/video or generate preview
    """
    try:
        media = PostsMedia.objects.get(id=media_id)
        file_path = media.file.name
        file_extension = os.path.splitext(file_path)[1].lower()
        
        video_extensions = ['.mp4', '.mov', '.avi', '.mkv', '.webm']
        image_extensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp']
        
        if file_extension in video_extensions:
            compress_video(media)
            generate_video_thumbnail(media)
        elif file_extension in image_extensions:
            compress_image(media)
            
        return f"Media {media_id} processed successfully"
    except PostsMedia.DoesNotExist:
        return f"Media {media_id} not found"
    except Exception as e:
        print(f"Error processing media {media_id}: {str(e)}")
        import traceback
        traceback.print_exc()
        return f"Error processing media {media_id}: {str(e)}"


def compress_video(media):
    """
    Compress video using FFmpeg:
    - Resize to max width 1280 (720p)
    - CRF 23 (Good balance for social media)
    - AAC audio
    - movflags=+faststart (Starts playing immediately on web)
    """
    temp_input = None
    temp_output = None
    
    try:
        print(f"🎥 Starting compression for video {media.id}...")
        
        # 1. Download original video to temp file
        video_content = media.file.read()
        media.file.seek(0)
        
        temp_input = NamedTemporaryFile(delete=False, suffix='.mp4')
        temp_input.write(video_content)
        temp_input.flush()
        temp_input.close()
        
        # Get original size in MB
        original_size = os.path.getsize(temp_input.name)
        original_size_mb = original_size / (1024 * 1024)
        
        # Prepare output temp file
        temp_output = NamedTemporaryFile(delete=False, suffix='.mp4')
        temp_output.close() # We just need the name
        
        # 2. Run FFmpeg compression
        try:
            stream = ffmpeg.input(temp_input.name)
            
            # Scale logic: width 1280, height automatic (divisible by 2)
            stream = ffmpeg.filter(stream, 'scale', 1280, -2)
            
            stream = ffmpeg.output(
                stream, 
                temp_output.name,
                vcodec='libx264',
                crf=23,             # Constant Rate Factor (18-28 is good, 28 is smaller size)
                preset='fast',      # Encoding speed
                acodec='aac',       # Audio codec
                audio_bitrate='128k',
                movflags='faststart', # Critical for web streaming!
                loglevel='error'
            )
            
            ffmpeg.run(stream, overwrite_output=True)
            
        except ffmpeg.Error as e:
            print(f"❌ FFmpeg error: {e.stderr.decode('utf8')}")
            raise e

        # 3. Check results and upload
        compressed_size = os.path.getsize(temp_output.name)
        compressed_size_mb = compressed_size / (1024 * 1024)
        
        # Calculate savings
        saved_mb = original_size_mb - compressed_size_mb
        saved_percent = (saved_mb / original_size_mb) * 100 if original_size_mb > 0 else 0
        
        print(f"📊 Video {media.id} Compression Results:")
        print(f"   Before: {original_size_mb:.2f} MB")
        print(f"   After:  {compressed_size_mb:.2f} MB")
        print(f"   Saved:  {saved_mb:.2f} MB ({saved_percent:.1f}%)")

        # Upload back to S3/R2 (replacing original)
        s3_client = get_s3_client()
        with open(temp_output.name, 'rb') as data:
            s3_client.put_object(
                Bucket=settings.AWS_STORAGE_BUCKET_NAME,
                Key=media.file.name,
                Body=data,
                ContentType='video/mp4',
                CacheControl='max-age=31536000'
            )
            
        print(f"✅ Compressed video uploaded successfully")

    except Exception as e:
        print(f"❌ Error compressing video {media.id}: {e}")
        import traceback
        traceback.print_exc()
        
    finally:
        # Cleanup
        if temp_input and os.path.exists(temp_input.name):
            os.unlink(temp_input.name)
        if temp_output and os.path.exists(temp_output.name):
            os.unlink(temp_output.name)


def compress_image(media):
    """
    Compress image to max width 1920px with 85% quality
    """
    try:
        # Read file from R2
        file_content = media.file.read()
        media.file.seek(0)
        
        img = Image.open(BytesIO(file_content))
        
        # Calculate original size roughly
        original_size_mb = len(file_content) / (1024 * 1024)

        # Fix orientation
        img = ImageOps.exif_transpose(img)
        
        # Convert RGBA to RGB 
        if img.mode in ('RGBA', 'LA', 'P'):
            background = Image.new('RGB', img.size, (255, 255, 255))
            if img.mode == 'P':
                img = img.convert('RGBA')
            background.paste(img, mask=img.split()[-1] if img.mode == 'RGBA' else None)
            img = background
        
        # Resize if more 1920px
        max_width = 1920
        if img.width > max_width:
            ratio = max_width / img.width
            new_height = int(img.height * ratio)
            img = img.resize((max_width, new_height), Image.Resampling.LANCZOS)
        
        # Save compressed image
        output = BytesIO()
        img.save(output, format='JPEG', quality=85, optimize=True)
        output.seek(0)
        
        compressed_size_mb = output.getbuffer().nbytes / (1024 * 1024)
        
        print(f"📊 Image {media.id}: {original_size_mb:.2f}MB -> {compressed_size_mb:.2f}MB")
        
        s3_client = get_s3_client()
        file_name = media.file.name
        
        s3_client.put_object(
            Bucket=settings.AWS_STORAGE_BUCKET_NAME,
            Key=file_name,
            Body=output.getvalue(),
            ContentType='image/jpeg',
            CacheControl='max-age=86400'
        )
        
        print(f"✅ Image {media.id} compressed successfully")
        
    except Exception as e:
        print(f"❌ Error compressing image {media.id}: {e}")
        import traceback
        traceback.print_exc()


def generate_video_thumbnail(media):
    """
    Generate thumbnail from first video frame 
    """
    try:
        # NOTE: We can optimize this by passing the file path if it was just compressed locally,
        # but for simplicity and robustness we download (it might be fast on server network)
        
        print(f"📥 Downloading video {media.id} for thumbnail...")
        
        video_content = media.file.read()
        media.file.seek(0)
        
        temp_video = NamedTemporaryFile(delete=False, suffix='.mp4')
        temp_video.write(video_content)
        temp_video.flush()
        temp_video.close()
        video_path = temp_video.name
        
        try:
            cap = cv2.VideoCapture(video_path)
            
            if not cap.isOpened():
                print(f"❌ Could not open video {video_path}")
                os.unlink(video_path)
                return
            
            ret, frame = cap.read()
            
            if ret:
                frame_rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
                img = Image.fromarray(frame_rgb)
                
                max_width = 640
                if img.width > max_width:
                    ratio = max_width / img.width
                    new_height = int(img.height * ratio)
                    img = img.resize((max_width, new_height), Image.Resampling.LANCZOS)
                
                output = BytesIO()
                img.save(output, format='JPEG', quality=70, optimize=True)
                output.seek(0)
                
                s3_client = get_s3_client()
                
                preview_path = f"previews/{media.id}_preview.jpg"
                s3_client.put_object(
                    Bucket=settings.AWS_STORAGE_BUCKET_NAME,
                    Key=preview_path,
                    Body=output.getvalue(),
                    ContentType='image/jpeg',
                    CacheControl='max-age=86400'
                )
                
                media.preview = preview_path
                media.save(update_fields=['preview'])

                print(f"✅ Video thumbnail generated")
            else:
                print(f"❌ Could not read frame from video {media.id}")
            
            cap.release()
            
        finally:
            if os.path.exists(video_path):
                os.unlink(video_path)
                
    except Exception as e:
        print(f"❌ Error in generate_video_thumbnail {media.id}: {e}")
        import traceback
        traceback.print_exc()

@shared_task(bind=True, max_retries=3)
def send_post_for_moderation(self, post_id):
    """
    Send post to go moderation service
    """
    print(f"[MODERATION] Starting moderation for post {post_id}")
    
    try:
        post = Post.objects.select_related('owner').prefetch_related('media').get(id=post_id)
    except Post.DoesNotExist:
        print(f"[MODERATION] Post {post_id} not found")
        return
    
    media_urls = []
    for m in post.media.all():
        if hasattr(m.file, 'url'):
            url = m.file.url
        else:
            url = str(m.file)

        if not url.startswith('http'):
            from django.conf import settings
            url = f"https://{settings.AWS_S3_CUSTOM_DOMAIN}/{url}"
        
        media_urls.append(url)
        print(f"[MODERATION] Media URL: {url}")
    
    print(f"[MODERATION] Post {post_id} has {len(media_urls)} media files")
    
    data = {
        "id": str(post.id),
        "content": post.about or "",
        "media_urls": media_urls
    }
    
    print(f"[MODERATION] Sending data: {data}")
    
    try:
        resp = requests.post(
            GO_MODERATION_URL, 
            json=data, 
            headers={"Content-Type": "application/json"},
            timeout=30
        )
        resp.raise_for_status()
        result = resp.json()
        
        print(f"[MODERATION] Response for post {post_id}: {result}")
        
        passed = result.get("passed", False)
        post.is_approved = passed
        post.moderation_status = "approved" if passed else "denied"
        
        text_details = result.get("text", {}).get("details", {})
        categories = text_details.get("categories", ["universal"])
        post.categories = categories
        
        post.save(update_fields=['is_approved', 'moderation_status', 'categories'])
        
        print(f"[MODERATION] Post {post_id} status: {post.moderation_status} (passed={passed})")
        
        if not passed:
            reasons = []
            text_result = result.get("text", {})
            if not text_result.get("passed", True):
                reasons.append("inappropriate text content")
            
            for file_result in result.get("files", []):
                if not file_result.get("passed", True):
                    filename = file_result.get("filename", "media")
                    reasons.append(f"inappropriate media: {filename}")
            
            reason = ", ".join(reasons) if reasons else "violated community guidelines"
            print(f"[MODERATION] User notified about rejection: {reason}")
            
    except requests.exceptions.Timeout:
        print(f"[MODERATION] Timeout for post {post_id}, retrying...")
        post.moderation_status = "pending"
        post.save(update_fields=['moderation_status'])
        raise self.retry(countdown=60)
        
    except requests.exceptions.RequestException as e:
        print(f"[MODERATION] Request error for post {post_id}: {e}")
        post.moderation_status = "error"
        post.save(update_fields=['moderation_status'])
        raise self.retry(countdown=120, exc=e)
        
    except Exception as e:
        print(f"[MODERATION] Unexpected error for post {post_id}: {e}")
        post.moderation_status = "error"
        post.save(update_fields=['moderation_status'])
        import traceback
        traceback.print_exc()


@shared_task
def auto_moderation_check():
    limit_time = timezone.now() - timedelta(minutes=10)
    outdated_posts = Post.objects.filter(
        moderation_status="pending",
        create_at__lt=limit_time
    )
    
    count = outdated_posts.count()
    outdated_posts.delete()
    print(f"Auto moderation removed {count} old pending posts")