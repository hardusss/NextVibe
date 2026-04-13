from rest_framework import serializers
from posts.models import Post, PostsMedia
from django.conf import settings


class MediaItemSerializer(serializers.ModelSerializer):
    media_url     = serializers.SerializerMethodField()
    media_preview = serializers.SerializerMethodField()
    type          = serializers.SerializerMethodField()

    class Meta:
        model  = PostsMedia
        fields = ['id', 'media_url', 'media_preview', 'type']

    def get_media_url(self, obj):
        if str(obj.file).startswith("https://res.cloudinary.com/"):
            return str(obj.file)
        return obj.file.url if obj.file else None

    def get_media_preview(self, obj):
        return obj.preview.url if obj.preview else None

    def get_type(self, obj):
        file_str = str(obj.file).lower()
        if any(ext in file_str for ext in ['.mp4', '.mov', '.avi', '.webm']):
            return "video"
        return "image"


class PostFeedSerializer(serializers.ModelSerializer):
    owner__user_id  = serializers.IntegerField(source='owner.user_id')
    owner__username = serializers.CharField(source='owner.username')
    owner__avatar   = serializers.SerializerMethodField()
    owner__official = serializers.BooleanField(source='owner.official')
    media           = serializers.SerializerMethodField()
    nft_price       = serializers.SerializerMethodField()
    already_claimed = serializers.SerializerMethodField()
    sold_out        = serializers.SerializerMethodField()
    is_owner        = serializers.SerializerMethodField()
    owner_wallet    = serializers.SerializerMethodField()
    owner__is_og    = serializers.SerializerMethodField()
    owner__edition  = serializers.SerializerMethodField()
    owner__invited_count = serializers.SerializerMethodField()

    class Meta:
        model  = Post
        fields = [
            'id', 'about', 'create_at', 'location', 'count_likes',
            'is_comments_enabled', 'owner__user_id', 'owner__username',
            'owner__avatar', 'owner__official', 'media',
            'is_ai_generated', 'moderation_status',
            # NFT
            'is_nft', 'minted_count', 'total_supply',
            'nft_price', 'already_claimed', 'sold_out',
            'is_owner', 'owner_wallet',
            # OG / invite
            'owner__is_og', 'owner__edition', 'owner__invited_count',
        ]

    def get_owner__avatar(self, obj):
        if obj.owner.avatar:
            if str(obj.owner.avatar).startswith("https://res.cloudinary.com/"):
                return str(obj.owner.avatar)
            return f"https://{settings.AWS_S3_CUSTOM_DOMAIN}/{obj.owner.avatar}"
        return None

    def get_media(self, obj):
        media_items = obj.media.all() if hasattr(obj, 'media') else PostsMedia.objects.filter(post=obj)
        return MediaItemSerializer(media_items, many=True).data

    def get_nft_price(self, obj):
        if not obj.is_nft:
            return None
        return self.context.get('nft_prices', {}).get(obj.id)

    def get_already_claimed(self, obj):
        return obj.id in self.context.get('claimed_post_ids', set())

    def get_sold_out(self, obj):
        return obj.minted_count >= (obj.total_supply or 50)

    def get_is_owner(self, obj):
        request = self.context.get('request')
        return obj.owner == request.user if request else False

    def get_owner_wallet(self, obj):
        return getattr(obj.owner, 'wallet_address', None)

    def get_owner__is_og(self, obj):
        og = getattr(obj.owner, 'og_avatar', None)
        return og is not None

    def get_owner__edition(self, obj):
        og = getattr(obj.owner, 'og_avatar', None)
        return og.edition if og is not None else None

    def get_owner__invited_count(self, obj):
        invite_counts = self.context.get('invite_counts', {})
        return invite_counts.get(obj.owner.user_id, 0)