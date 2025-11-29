from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from rest_framework.throttling import ScopedRateThrottle
from posts.models import Post, Comment
from posts.serializers_pac.recommendation_feed_serializer import PostFeedSerializer
from user.models import HistorySearch
from django.db.models import Case, When, Value, IntegerField
from django.core.cache import cache 
import random


class RecommendationFeedView(APIView):
    permission_classes = [IsAuthenticated]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "feed"

    def get(self, request):
        user = request.user
        BATCH_SIZE = 3
        
        # Redis Key for this specific user's seen posts
        # Example key: "seen_posts:user_15"
        cache_key = f"seen_posts:user_{user.user_id}"
        if request.query_params.get('reset') == 'true':
            cache.delete(cache_key)
            seen_ids = set()
        else:
            seen_ids = cache.get(cache_key, set())
        
        # If the set becomes too huge (e.g. > 1000), performance drops.
        # Optional: Clear cache if it's too big to reset the feed
        if len(seen_ids) > 1000:
            seen_ids = set()
            cache.delete(cache_key)

        # Get relevant user IDs
        following_ids = user.follow_for or []
        
        last_5_search = list(
            HistorySearch.objects
            .filter(user__user_id=user.user_id)
            .values_list('searched_user__user_id', flat=True)[:5]
        )

        liked_users = list(
            Post.objects.filter(id__in=list(user.liked_posts)[:10])
            .values_list('owner__user_id', flat=True)
            .distinct()
        )

        commented_posts_user = list(
            Comment.objects
            .filter(owner__user_id=user.user_id)
            .select_related('post__owner')
            .values_list('post__owner__user_id', flat=True)
            .distinct()[:10] 
        )

        # Build query
        posts_queryset = (
            Post.objects
            .select_related('owner')
            .prefetch_related('media')
            .exclude(owner__user_id=user.user_id)
            .filter(moderation_status="approved")
        )

        if seen_ids:
            posts_queryset = posts_queryset.exclude(id__in=seen_ids)

        # Scoring Logic
        posts_queryset = posts_queryset.annotate(
            relevance_score=
            Case(When(owner__user_id__in=following_ids, then=Value(100)), default=Value(0), output_field=IntegerField()) +
            Case(When(owner__user_id__in=liked_users, then=Value(75)), default=Value(0), output_field=IntegerField()) +
            Case(When(owner__user_id__in=commented_posts_user, then=Value(60)), default=Value(0), output_field=IntegerField()) +
            Case(When(owner__user_id__in=last_5_search, then=Value(50)), default=Value(0), output_field=IntegerField())
        )

        posts_queryset = posts_queryset.order_by(
            '-relevance_score',
            '-count_likes',
            '-create_at'
        )

        posts_list = list(posts_queryset[:50])
        
        # Random Backfill Logic
        MIN_POSTS = 20
        if len(posts_list) < MIN_POSTS:
            random_count = MIN_POSTS - len(posts_list)
            
            candidate_ids = list(
                Post.objects
                .filter(moderation_status="approved")
                .exclude(owner__user_id=user.user_id)
                .exclude(id__in=seen_ids)
                .exclude(id__in=[p.id for p in posts_list])
                .values_list('id', flat=True)[:500] 
            )
            
            if candidate_ids:
                sample_size = min(random_count, len(candidate_ids))
                random_ids = random.sample(candidate_ids, sample_size)
                
                additional = (
                    Post.objects
                    .select_related('owner')
                    .prefetch_related('media')
                    .filter(id__in=random_ids, moderation_status="approved")
                )
                posts_list.extend(list(additional))

        random.shuffle(posts_list)

        final_batch = posts_list[:BATCH_SIZE]
        
        new_ids = {p.id for p in final_batch}
        if new_ids:
            # Union of old seen_ids and new ones
            updated_seen_ids = seen_ids.union(new_ids)
            # Save back to Redis with a timeout (e.g., 24 hours)
            # This ensures the cache doesn't live forever if user leaves
            cache.set(cache_key, updated_seen_ids, timeout=3600)

        serializer = PostFeedSerializer(final_batch, many=True, context={'request': request})

        return Response({
            "results": serializer.data,
            "count": len(final_batch),
            "liked_posts": user.liked_posts
        })