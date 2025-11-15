from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from django.contrib.auth import get_user_model
from django.db.models import Case, When, CharField, Value, F
from django.db.models.functions import Concat
from django.conf import settings

User = get_user_model()

class SearchUsersView(APIView):
    """
    Search by username
    This class for search users
    which usernames inludes some text
    Args:
        APIView (_type_): A parent class that allows 
        you to make an API method from a class
        
    """
    
    permission_classes=[IsAuthenticated] # Checking whether the user who sent the request is authorized
    
    def get(self, request, *args, **kwargs) -> Response:
        search_name = request.query_params.get("searchName", "")
        try:
            users = User.objects.filter(username__icontains=search_name).annotate(
                avatar_url=Concat(
                            Value(f"https://{settings.AWS_S3_CUSTOM_DOMAIN}/"),
                            F('avatar'),
                            output_field=CharField()
                    )
                ).values("user_id", "avatar_url", "username", "official", "readers_count")
            for user in users:
                user['avatar'] = user.pop('avatar_url')
            if len(users) == 0:
                return Response({"data": f"Users doesn't exist with username {search_name}"})
            return Response({"data": users}, status=200)
        except User.DoesNotExist:
            return Response({"data": f"Users doesn't exist with username {search_name}"}, status=404)