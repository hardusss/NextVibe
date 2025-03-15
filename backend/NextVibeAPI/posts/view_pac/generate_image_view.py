from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from ..src.generate_image import generate

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

    def post(self, request) -> Response:
        """
        Handles POST requests to generate an image from a given text prompt.

        Parameters:
            request (Request): The HTTP request object containing query parameters.

        Returns:
            Response: 
                - 201 CREATED: Returns the generated image URL if the prompt is valid.
                - 400 BAD REQUEST: Returns an error message if the prompt is empty or missing.
        
        Example Request:
            POST /generate-image/?promt=A futuristic cityscape at night
        
        Example Response (201 Created):
            {
                "image_url": "https://replicate.delivery/generated-image.jpg"
            }
        
        Example Response (400 Bad Request):
            {
                "error": "promt is empty"
            }
        """
        promt: str = request.query_params.get("promt")
        if promt is not None and promt.strip() != "":
            image_url = generate(promt=promt)
            return Response({"image_url": image_url}, status=status.HTTP_201_CREATED)
        
        return Response({"error": "promt is empty"}, status=status.HTTP_400_BAD_REQUEST)
