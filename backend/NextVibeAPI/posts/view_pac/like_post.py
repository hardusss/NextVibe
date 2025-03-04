from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from django.contrib.auth import get_user_model
from ..models import Post


User = get_user_model()

class LikePostView(APIView):
    """
    A class for ApiView which can like or dislike post
    Args:
        APIView (_type_): Parent class from drf for api

    """
    permission_classes = [IsAuthenticated] # checks if the user is authorized
    
    def put(self, request, id: int, post_id: int) -> Response:
        """

        Args:
            request: a required parameter for drf dunction api view
            id (int): id it is pk of User model
            post_id (int): post_id it is a pk of Post model

        Returns:
            Response: A data (success or not) and status
        """
        try:
            post = Post.objects.get(id=post_id)
            
        except Post.DoesNotExist:
            return Response({"data": "Post does not exist"}, status=status.HTTP_404_NOT_FOUND)
        try:
            user = User.objects.get(user_id=id)
        except User.DoesNotExist:
            return Response({"data": "Error: user not exist"}, status=status.HTTP_404_NOT_FOUND)

        if post_id in user.liked_posts:
            user.liked_posts.remove(post_id)
            post.count_likes -= 1
            post.save()
            user.save()
            return Response({"data": "Post is unliked"}, status=status.HTTP_200_OK)
        else:
            user.liked_posts.append(post_id)
            post.count_likes += 1
            post.save()
            user.save()
            return Response({"data": "Succes"}, status=status.HTTP_200_OK)
        
        return Response({"data": "Bad request"}, status=status.HTTP_400_BAD_REQUEST)