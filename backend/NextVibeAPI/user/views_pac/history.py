from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.request import Request
from rest_framework.permissions import IsAuthenticated
from ..models import HistorySearch
from django.contrib.auth import get_user_model
from django.shortcuts import get_object_or_404

User = get_user_model()


class HistorySearchView(APIView):
    permission_classes = [IsAuthenticated]
    """
    A class for create and delete user history search

    Args:
        APIView (_type_): django parent class for api
    """

    def get(self, request: Request, *args, **kwargs) -> Response:
        """
        GET method for get last 5 search

        Args:
            request: default param for django view method

        Returns:
            Response: _description_
        """
        
        user: int = int(request.query_params.get("user"))
        history = HistorySearch.objects.filter(user__user_id=user).order_by("-id")[:5]
        data = []
        for entry in history.values():
            searched_user_id = entry.get("searched_user_id")
            user_data = User.objects.filter(user_id=searched_user_id).values(
                "user_id", "avatar",
                "username", "official", 
                "readers_count").first()
            if user_data:
                data.append(user_data)
        return Response({"data": data}, status=200)
    
    def post(self, request: Request, *args, **kwargs) -> Response:
        """
        POST method for creating a search history entry.
        If an entry with the same user and searched_user exists, it is deleted before creating a new one.

        Args:
            request: default param for Django view method.

        Returns:
            Response: JSON response indicating success or failure.
        """
        user_param: int = int(request.query_params.get("user"))
        searched_user_param = int(request.query_params.get("searchedUser"))

        if not user_param or not searched_user_param:
            return Response({"error": "Missing required parameters"}, status=400)

        user = get_object_or_404(User, user_id=int(user_param))
        searched_user = get_object_or_404(User, user_id=int(searched_user_param))

        HistorySearch.objects.filter(user=user, searched_user=searched_user).delete()

        HistorySearch.objects.create(user=user, searched_user=searched_user)

        return Response({"data": "Success"}, status=201)
    
    def delete(self, request: Request, *args, **kwargs) -> Response:
        """
        Delete item from history

        Args:
            request (Request): default param for Django view method.

        Returns:
            Response: JSON response indicating success or failure.
        """
        
        user_param: int = int(request.query_params.get("user"))
        searched_user_param = int(request.query_params.get("searchedUser"))
        
        user = get_object_or_404(User, user_id=int(user_param))
        searched_user = get_object_or_404(User, user_id=int(searched_user_param))
        try:
            HistorySearch.objects.filter(user=user, searched_user=searched_user).delete()
            return Response({"data": "Success"}, status=200)
        except Exception as err:
            return Response({"data": f"Error: {err}"}, status=404)