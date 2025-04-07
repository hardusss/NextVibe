from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from django.contrib.auth import get_user_model
from django.core.exceptions import ObjectDoesNotExist
from ..src.two_fa import TwoFA

User = get_user_model()

class UpdatePassword(APIView):
    """Class for updating user password.

    Allows updating the password.
    Requires user authentication.

    Attributes:
        permission_classes: List of permission classes that define API access.
    """

    permission_classes = [IsAuthenticated]
    def put(self, request) -> Response:
        """Updates user password.

        Args:
            request: HTTP request object.

        Returns:
            Response: JSON response indicating success or failure.
        """
        user = request.user
        verify_code = request.query_params.get('verify_code')
        if verify_code is None:
            return Response({"error": "Verify code is required"}, status=400)
        
        try:
            if user.secret_2fa is None:
                return Response({"error": "2FA is not enabled. Please connect 2FA!"}, status=400)
            two_fa = TwoFA(user.secret_2fa)
            if not two_fa.auth(verify_code):
                return Response({"error": "Invalid verify code"}, status=400)
        except Exception as e:
            return Response({"error": str(e)}, status=400)
        
        new_password = request.data.get('new_password')
        if new_password is None:
            return Response({"error": "New password is required"}, status=400)
        user.set_password(new_password)
        user.save()
        return Response({"message": "Password updated successfully"}, status=200)
    