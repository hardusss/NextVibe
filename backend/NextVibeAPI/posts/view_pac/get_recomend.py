from .recomendations import RecomendationsFormater
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from rest_framework.throttling import ScopedRateThrottle
from user.src.blocking import blocked_user_ids

class RecomendationsView(APIView):
    permission_classes = [IsAuthenticated]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "feed"
    def get(self, request) -> Response:
        rec = RecomendationsFormater([128, 123, 131, 125, 126], 
                                    [162, 180, 172, 210, 192],
                                    [120, 122, 127, 133, 130],
                                    [122, 132, 140, 142, 129, 134, 138])
        hidden = blocked_user_ids(request.user)
        posts = [post for post in rec.format() if post["owner__user_id"] not in hidden]
        
        return Response({"data": posts, "liked_posts": request.user.liked_posts}, status=200)