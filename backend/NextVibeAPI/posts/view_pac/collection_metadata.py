from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status


class CollectionMetadataView(APIView):
    def get(self, request) -> Response:
        metadata = {
            "name": "NextVibe Collection",
            "symbol": "NVIBE",
            "description": "Official NextVibe post collection on Solana",
            "image": "https://nextvibe.io/logo.png",
            "properties": {
                "files": [
                    {
                        "uri": "https://nextvibe.io/logo.png",  
                        "type": "image/png"                     
                    }
                ],
                "category": "image",
            },
        }
        return Response(metadata, status=status.HTTP_200_OK)