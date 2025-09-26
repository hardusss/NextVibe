from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from ..models import Post

class ModerationCallbackView(APIView):
    def post(self, request):
        data = request.data
        post_id = data.get("id")
        if not post_id:
            return Response({"error": "Missing post id"}, status=status.HTTP_400_BAD_REQUEST)

        try:
            post = Post.objects.get(id=post_id)
        except Post.DoesNotExist:
            return Response({"error": "Post not found"}, status=status.HTTP_404_NOT_FOUND)

        # Get moderation results
        text_passed = data.get("text", {}).get("passed", False)
        categories = data.get("text", {}).get("details", {}).get("categories", ["universal"])
        files_passed = all(f.get("passed", False) for f in data.get("files", []))
        post_passed = text_passed and files_passed
        post.categories = categories
        post.is_approved = post_passed
        post.moderation_status = "approved" if post_passed else "denied"
        post.save()

        return Response({"status": "ok"})
