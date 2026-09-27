from rest_framework import serializers
from ..models import Post

class PostSerializer(serializers.ModelSerializer):
    class Meta:
        model = Post
        fields = '__all__'
        # Proof of Meet posts are made by the server only (posts/src/meet_photos.py).
        # The rest are set by the server: the owner comes from the token,
        # approval from moderation, supply from event-update, counts from
        # likes and mints.
        read_only_fields = (
            'co_author', 'meet_slug', 'owner', 'is_approved', 'moderation_status',
            'categories', 'count_likes', 'is_nft', 'minted_count', 'total_supply',
            'on_event', 'reputation_earned',
        )