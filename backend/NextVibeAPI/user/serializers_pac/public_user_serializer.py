from rest_framework import serializers
from django.contrib.auth import get_user_model
from posts.models import Post

User = get_user_model()

class PublicUserDetailSerializer(serializers.ModelSerializer):
    """
    Serializer for public user profiles.
    Includes an auto-syncing post counter.
    """
    posts_count = serializers.SerializerMethodField()

    class Meta:
        model = User
        exclude = ('password',)

    def get_posts_count(self, obj):
        """
        Calculates total approved posts and synchronizes the 'post_count' field.
        """
        # Count approved posts from the Post model
        actual_count = Post.objects.filter(
            owner__user_id=obj.user_id, 
            moderation_status="approved"
        ).count()

        # Update the database field if it's out of sync
        if obj.post_count != actual_count:
            obj.post_count = actual_count
            obj.save(update_fields=['post_count'])
        
        return actual_count