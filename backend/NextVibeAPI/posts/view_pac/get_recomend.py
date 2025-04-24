from .recomendations import Recomendations, RecomendationsFormater
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import permissions
class RecomendationsView(APIView):
    permission_classes = [permissions.AllowAny]
    def get(self, request) -> Response:
        rec = RecomendationsFormater([11, 15, 23, 9, 6], 
                                    [162, 180, 172, 210, 192],
                                    [10, 12, 14, 16, 18],
                                    [32, 41, 24, 66, 38])
        posts = rec.format()
        
        return Response({"data": posts})