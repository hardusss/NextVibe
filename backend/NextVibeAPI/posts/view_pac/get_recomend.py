from .recomendations import RecomendationsFormater
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated

class RecomendationsView(APIView):
    permission_classes = [IsAuthenticated]
    def get(self, request) -> Response:
        rec = RecomendationsFormater([128, 123, 131, 125, 126], 
                                    [162, 180, 172, 210, 192],
                                    [120, 122, 127, 133, 130],
                                    [122, 132, 140, 142, 129, 134, 138])
        posts = rec.format()
        
        return Response({"data": posts, "liked_posts": request.user.liked_posts}, status=200)