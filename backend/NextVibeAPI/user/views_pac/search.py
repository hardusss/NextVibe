from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from django.contrib.auth import get_user_model


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
            users = User.objects.filter(username__icontains=search_name).values()
            if len(users) == 0:
                return Response({"data": f"Users doesn't exist with username {search_name}"})
            return Response({"data": users}, status=200)
        except User.DoesNotExist:
            return Response({"data": f"Users doesn't exist with username {search_name}"}, status=404)