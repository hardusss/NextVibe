from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.request import Request
from rest_framework.permissions import IsAuthenticated
from rest_framework.throttling import ScopedRateThrottle
from posts.paginations import StandardResultsSetPagination
from posts.models import Post
from user.models import HistorySearch

from django.utils import timezone
from datetime import timedelta
from django.db.models import Q


class RecommendationFeedView(APIView):
    permission_classes = [IsAuthenticated]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "feed"
    pagination_class = StandardResultsSetPagination

    def get(self, request: Request) -> Response:
        user = request.user
        last_7_days = timezone.now() - timedelta(days=7)

        paginator = self.pagination_class()

        following_ids = list(user.follow_for or [])
        last_5_search = list(
            HistorySearch.objects
            .filter(user__user_id=user.user_id)
            .values_list("searched_user__user_id", flat=True)[:5]
        )

        # base queryset
        posts_queryset = Post.objects.filter(create_at__gte=last_7_days)

        # forming OR scripts
        filters = Q()
        
        if following_ids:
            filters |= Q(owner__user_id__in=following_ids)

        if last_5_search:
            filters |= Q(owner__user_id__in=last_5_search)

        # if any filters exsist add it
        if filters:
            posts_queryset = posts_queryset.filter(filters)

        # pagination
        page = paginator.paginate_queryset(posts_queryset.values(), request, view=self)
        return paginator.get_paginated_response(page)
