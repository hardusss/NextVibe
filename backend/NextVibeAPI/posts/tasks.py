from celery import shared_task
import requests
from .models import Post

GO_MODERATION_URL = "http://127.0.0.1:8080/moderation"

@shared_task
def send_post_for_moderation(post_id):
    print("Task started for post id:", post_id)
    post = Post.objects.get(id=post_id)

    files = []
    for m in post.media.all():
        files.append(('files', (m.file.name, m.file.open(), 'application/octet-stream')))

    data = {
        "id": str(post.id),
        "content": post.about or ""
    }

    try:
        resp = requests.post(GO_MODERATION_URL, data=data, files=files)
        print("Response status:", resp.status_code)
        result = resp.json()
        post.is_approved = result.get("passed", False)
        post.moderation_status = "approved" if result.get("passed") else "denied"
        post.categories = list(result.get("text", {}).get("details", {}).get("categories", ["universal"]))
        post.save()
    except Exception as e:
        print("Error:", e)
        post.moderation_status = "error"
        post.save()
