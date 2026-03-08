from rest_framework import serializers
from django.contrib.auth import get_user_model
from posts.models import Post

User = get_user_model()


class UserDetailSerializer(serializers.ModelSerializer):
    posts_count = serializers.SerializerMethodField()

    class Meta:
        model = User
        exclude = ('password',)

    def get_posts_count(self, obj):
        # get the current number of posts
        actual_count = Post.objects.filter(owner__user_id=obj.user_id, moderation_status="approved", is_hide=False).count()
        if obj.post_count != actual_count:
            obj.post_count = actual_count
            obj.save(update_fields=['post_count'])
        
        return actual_count
