from django.db import models


class Post(models.Model):
    owner = models.ForeignKey("user.User", on_delete=models.CASCADE)
    about = models.TextField(max_length=255, default="", null=True)
    count_likes = models.IntegerField(default=0, null=True)
    create_at = models.DateTimeField(auto_now_add=True)
    location = models.CharField(default=None, null=True, max_length=255)
    def __str__(self):
        return f"Post by {self.owner.username} with id {self.id}"

class PostsMedia(models.Model):
    post = models.ForeignKey(Post, on_delete=models.CASCADE, related_name="media")
    file = models.FileField(upload_to="post_media/")
    uploaded_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"Media for Post"
    

class Comment(models.Model):
    owner = models.ForeignKey("user.User", on_delete=models.CASCADE)
    post = models.ForeignKey(Post, on_delete=models.CASCADE)
    content = models.TextField(max_length=255)
    create_at = models.DateTimeField(auto_now_add=True)
    count_likes = models.IntegerField(default=0, null=True)
    
    def __str__(self) -> str:
        return f"Comment by {self.owner.user_id} in post {self.post.id}"

class CommentReply(models.Model):
    owner = models.ForeignKey("user.User", on_delete=models.CASCADE)
    comment = models.ForeignKey(Comment, on_delete=models.CASCADE)
    content = models.TextField(max_length=255)
    create_at = models.DateTimeField(auto_now_add=True)
    count_likes = models.IntegerField(default=0, null=True)
    
    def __str__(self) -> str:
        return f"Reply by {self.owner.user_id} in comment {self.comment.id}"