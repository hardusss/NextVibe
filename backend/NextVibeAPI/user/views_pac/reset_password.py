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
        verify_code = request.query_params.get('verifyCode')
        if verify_code is None:
            return Response({"message": "Verify code is required"}, status=201)
        if len(verify_code) != 6:
            return Response({"message": "Verify code must be 6 digits"}, status=201)
        
        try:
            if user.secret_2fa is None:
                return Response({"message": "2FA is not enabled. Please connect 2FA!"}, status=400)
            two_fa = TwoFA(user.secret_2fa)
            if not two_fa.auth(verify_code):
                return Response({"message": "Invalid verify code"}, status=201)
        except Exception as e:
            return Response({"message": str(e)}, status=201)
        
        new_password = request.data.get('newPassword')
        if new_password is None:
            return Response({"message": "New password is required"}, status=201)
        user.set_password(new_password)
        user.save()
        return Response({"message": "Password updated successfully"}, status=200)
    