from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from ..src.generate_image import generate
from django.contrib.auth import get_user_model
from rest_framework.throttling import ScopedRateThrottle
from posts.tasks import generate_image_task

User = get_user_model()


class GenerateImage(APIView):
    """
    API endpoint for generating images using a text prompt.

    This view accepts a POST request with a query parameter 'promt' 
    and generates an image based on the given prompt using the `generate` function.

    Attributes:
        permission_classes (list): Defines the permissions required to access this endpoint. 
                                   Only authenticated users can use this API.

    Methods:
        post(request) -> Response:
            Handles POST requests to generate an image based on the given prompt.
    """
    permission_classes = [IsAuthenticated]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "ai_gen"

    def post(self, request) -> Response:
        """
        Handles POST requests to generate an image from a given text prompt.

        Parameters:
            request (Request): The HTTP request object containing query parameters.

        Returns:
            Response: 
                - 201 CREATED: Returns the task id in celery worker.
                - 400 BAD REQUEST: Returns an error message if the prompt is empty or missing.
        
        Example Request:
            POST /generate-image/?promt=A futuristic cityscape at night
        
        Example Response (201 Created):
            {
                "taskId": 1
            }
        
        Example Response (400 Bad Request):
            {
                "error": "promt is empty"
            }
        """
        user = request.user

        if user.count_generations_ai <= 0:
            return Response({"error": "Unfortunately, you have run out of photo generation attempts."}, status=200)

        prompt = request.query_params.get("promt")
        if not prompt or not prompt.strip():
            return Response({"error": "promt is empty"}, status=400)

        # Call Celery task
        task = generate_image_task.delay(prompt)

        user.count_generations_ai -= 1
        user.save()

        return Response({"taskId": task.id}, status=201)
