from celery import shared_task
import requests
from .models import Post
from io import BytesIO


GO_MODERATION_URL = "http://127.0.0.1:8080/moderation"

@shared_task
def send_post_for_moderation(post_id):
    print("Task started for post id:", post_id)
    post = Post.objects.get(id=post_id)

    files = []

    for m in post.media.all():
        url_str = m.file.url if hasattr(m.file, "url") else str(m.file)
        response = requests.get(url_str)
        if response.status_code == 200:
            file_bytes = BytesIO(response.content)
            filename = str(url_str).split("/")[-1]
            files.append(('media', (filename, file_bytes, 'image/jpeg')))
        else:
            print("Cannot download file:", url_str)

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
