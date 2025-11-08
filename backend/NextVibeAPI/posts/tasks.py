from celery import shared_task
import requests
from .models import Post
from django.contrib.auth import get_user_model

GO_MODERATION_URL = "http://127.0.0.1:8080/moderation"
User = get_user_model()


@shared_task(bind=True, max_retries=3)
def send_post_for_moderation(self, post_id):
    """
    Send post to go moderation service
    
    Args:
        post_id: post ID
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