from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from django.contrib.auth import get_user_model
from django.core.exceptions import ObjectDoesNotExist

User = get_user_model()

class UpdateUserText(APIView):
    """Class for updating user text information.
    
    Allows updating the username and description (about).
    Requires user authentication.
    
    Attributes:
        permission_classes: List of permission classes that define API access.
    """
    
    permission_classes = [IsAuthenticated]
    def put(self, request) -> Response:
        user_id = request.user.user_id
        username = request.query_params.get("username")
        about = request.query_params.get("about")
        
        try:
            user = User.objects.get(user_id=user_id)
            
            if username:
                if User.objects.filter(username=username).exclude(user_id=user_id).exists():
                    return Response({"error": "Username already exists"}, status=400)
                user.username = username.strip()
            
            if about:
                user.about = about.strip()

            if not username and not about:
                return Response({"error": "No data provided"}, status=400)
            
            user.save()
            return Response({"message": "User text updated successfully"}, status=200)
        
        except ObjectDoesNotExist:
            return Response({"error": "User not found"}, status=404)
