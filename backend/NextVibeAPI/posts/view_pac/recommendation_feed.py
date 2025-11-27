from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from rest_framework.throttling import ScopedRateThrottle
from posts.models import Post, Comment
from posts.serializers_pac.recommendation_feed_serializer import PostFeedSerializer
from user.models import HistorySearch
from django.db.models import Q, Count
from django.db import models
import random


class RecommendationFeedView(APIView):
    permission_classes = [IsAuthenticated]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "feed"

    def get(self, request):
        user = request.user
        BATCH_SIZE = 3  # Define how many posts to return per request
        
        # Track already seen posts to avoid duplicates
        seen_param = request.query_params.get('seen', '')
        seen_ids = []
        if seen_param:
            seen_ids = [int(x.strip()) for x in seen_param.split(',') if x.strip().isdigit()]

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
            .distinct()[:10]  # Limit to last 10 unique users
        )

        # Build single efficient query with relevance scoring
        posts_queryset = (
            Post.objects
            .select_related('owner')
            .prefetch_related('media')  # Prefetch media to avoid N+1
            .exclude(owner__user_id=user.user_id)
        )
        
        # Exclude seen IDs immediately to get fresh content
        if seen_ids:
            posts_queryset = posts_queryset.exclude(id__in=seen_ids)

        # Score: following=100, liked=75, commented=60, search=50
        posts_queryset = posts_queryset.annotate(
            relevance_score=Count(
                'id',
                filter=Q(owner__user_id__in=following_ids)
            ) * 100 + Count(
                'id', 
                filter=Q(owner__user_id__in=liked_users)
            ) * 75 + Count(
                'id', 
                filter=Q(owner__user_id__in=commented_posts_user)
            ) * 60 + Count(
                'id', 
                filter=Q(owner__user_id__in=last_5_search)
            ) * 50
        )

        # Sort by relevance, then popularity, then recency
        posts_queryset = posts_queryset.order_by(
            '-relevance_score',
            '-count_likes',
            '-create_at'
        )

        # Fetch more than needed to allow shuffling, but limit query
        posts_list = list(posts_queryset[:50])
        
        # Add random posts if needed
        MIN_POSTS = 20
        if len(posts_list) < MIN_POSTS:
            random_count = MIN_POSTS - len(posts_list)
            
            min_id = Post.objects.aggregate(min_id=models.Min('id'))['min_id'] or 0
            max_id = Post.objects.aggregate(max_id=models.Max('id'))['max_id'] or 0
            
            # Safe sample logic
            range_size = max_id - min_id + 1
            sample_size = min(random_count * 3, range_size)
            
            if range_size > 0:
                random_ids = random.sample(range(min_id, max_id + 1), sample_size)
                
                additional = (
                    Post.objects
                    .select_related('owner')
                    .prefetch_related('media')
                    .filter(id__in=random_ids)
                    .exclude(owner__user_id=user.user_id)
                    .exclude(id__in=[p.id for p in posts_list])
                    .exclude(id__in=seen_ids)
                )[:random_count]
                
                posts_list.extend(list(additional))

        # Light shuffle: keep top-10 (or less), shuffle rest
        if len(posts_list) > 10:
            top_posts = posts_list[:10]
            rest_posts = posts_list[10:]
            random.shuffle(rest_posts)
            posts_list = top_posts + rest_posts

        # Manual slicing instead of Pagination class
        final_batch = posts_list[:BATCH_SIZE]
        
        serializer = PostFeedSerializer(final_batch, many=True)
        
        # Construct response manually to maintain expected structure
        return Response({
            "results": serializer.data,
            "count": len(final_batch),
            "seen_ids": [p.id for p in final_batch],
            "liked_posts": user.liked_posts
        })