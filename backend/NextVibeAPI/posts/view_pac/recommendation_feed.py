from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from rest_framework.throttling import ScopedRateThrottle
from posts.models import Post, Comment, UserCollection
from posts.serializers_pac.recommendation_feed_serializer import PostFeedSerializer
from user.models import HistorySearch, InviteUser
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

        cache_key = f"seen_posts:user_{user.user_id}"
        if request.query_params.get('reset') == 'true':
            cache.delete(cache_key)
            seen_ids = set()
        else:
            seen_ids = cache.get(cache_key, set())

        if len(seen_ids) > 1000:
            seen_ids = set()
            cache.delete(cache_key)

        following_ids = user.follow_for or []

        last_5_search = list(
            HistorySearch.objects
            .filter(user__user_id=user.user_id)
            .values_list('searched_user__user_id', flat=True)[:5]
        )

        liked_users = list(
            Post.objects.filter(id__in=list(user.liked_posts)[:10], is_hide=False)
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

        posts_queryset = (
            Post.objects
            .select_related('owner', 'owner__og_avatar')
            .prefetch_related('media')
            .exclude(owner__user_id=user.user_id)
            .filter(moderation_status="approved", is_hide=False)
        )

        if seen_ids:
            posts_queryset = posts_queryset.exclude(id__in=seen_ids)

        posts_queryset = posts_queryset.annotate(
            relevance_score=
            Case(When(owner__user_id__in=following_ids, then=Value(100)), default=Value(0), output_field=IntegerField()) +
            Case(When(owner__user_id__in=liked_users, then=Value(75)), default=Value(0), output_field=IntegerField()) +
            Case(When(owner__user_id__in=commented_posts_user, then=Value(60)), default=Value(0), output_field=IntegerField()) +
            Case(When(owner__user_id__in=last_5_search, then=Value(50)), default=Value(0), output_field=IntegerField())
        ).order_by('-relevance_score', '-count_likes', '-create_at')

        posts_list = list(posts_queryset[:50])

        MIN_POSTS = 20
        if len(posts_list) < MIN_POSTS:
            random_count = MIN_POSTS - len(posts_list)
            candidate_ids = list(
                Post.objects
                .filter(moderation_status="approved", is_hide=False)
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
                    .select_related('owner', 'owner__og_avatar')
                    .prefetch_related('media')
                    .filter(id__in=random_ids, moderation_status="approved")
                )
                posts_list.extend(list(additional))

        random.shuffle(posts_list)
        final_batch = posts_list[:BATCH_SIZE]

        post_ids = [p.id for p in final_batch]
        owner_ids = [p.owner.user_id for p in final_batch]

        edition_ones = UserCollection.objects.filter(
            post_id__in=post_ids,
            edition=1,
        ).values('post_id', 'price')
        nft_prices = {e['post_id']: str(e['price']) for e in edition_ones}

        claimed_post_ids = set(
            UserCollection.objects
            .filter(user=user, post_id__in=post_ids)
            .values_list('post_id', flat=True)
        )

        invite_counts = {
            inv.owner_id: inv.invited_count
            for inv in InviteUser.objects.filter(owner_id__in=owner_ids)
        }

        serializer = PostFeedSerializer(
            final_batch,
            many=True,
            context={
                'request': request,
                'nft_prices': nft_prices,
                'claimed_post_ids': claimed_post_ids,
                'invite_counts': invite_counts,
            }
        )

        new_ids = {p.id for p in final_batch}
        if new_ids:
            cache.set(cache_key, seen_ids.union(new_ids), timeout=3600)

        return Response({
            "results": serializer.data,
            "count": len(final_batch),
            "liked_posts": user.liked_posts,
        })