from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.request import Request
from rest_framework.permissions import IsAuthenticated
from rest_framework.throttling import ScopedRateThrottle
from posts.paginations import StandardResultsSetPagination
from posts.models import Post

# For work with time
from django.utils import timezone
from datetime import timedelta


class RecommendationFeedView(APIView):
    permission_classes = [IsAuthenticated]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "feed"
    pagination_class = StandardResultsSetPagination

    def get(self, request: Request) -> Response:
        user = request.user
        last_7_days = timezone.now() - timedelta(days=7)

        # Init pagination
        paginator = self.pagination_class()
        following_ids = user.follow_for or [] # Get user following ids

        # Check user following
        if following_ids:
            posts_queryset = Post.objects.filter(
                create_at__gte=last_7_days,
                owner__user_id__in=list(user.follow_for)
            ).values()

            page = paginator.paginate_queryset(posts_queryset, request, view=self)
            return paginator.get_paginated_response(page)
        
        return Response({"data": None}, status=200)
            