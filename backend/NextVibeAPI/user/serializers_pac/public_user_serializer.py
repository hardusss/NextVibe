from rest_framework import serializers
from django.contrib.auth import get_user_model
from posts.models import Post

User = get_user_model()

class PublicUserDetailSerializer(serializers.ModelSerializer):
    """
    Serializer for public user profiles (no auth).
    Includes an auto-syncing post counter.
    """
    posts_count = serializers.SerializerMethodField()

    class Meta:
        model = User
        # Allowlist: this is served to anyone. It used to be "everything but
        # the password", which exposed push tokens, wallets and follow lists.
        fields = (
            "user_id", "username", "avatar", "about", "official",
            "seeker_verified", "seeker_verified_source",
            "post_count", "posts_count", "readers_count", "follows_count",
        )

    def get_posts_count(self, obj):
        """
        Calculates total approved posts and synchronizes the 'post_count' field.
        """
        # Count approved posts from the Post model (Proof of Meet posts count for both people)
        from posts.src.meet_photos import on_profile_q
        actual_count = Post.objects.filter(
            on_profile_q(obj.user_id),
            moderation_status="approved"
        ).count()

        # Update the database field if it's out of sync
        if obj.post_count != actual_count:
            obj.post_count = actual_count
            obj.save(update_fields=['post_count'])
        
        return actual_count