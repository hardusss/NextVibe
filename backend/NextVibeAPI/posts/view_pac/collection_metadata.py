from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status


class CollectionMetadataView(APIView):
    def get(self, request) -> Response:
        is_og = request.query_params.get("isOg", "").lower() == "true"
        if is_og:
            metadata = {
                "name": "NextVibe OG Status",
                "symbol": "NVOG",
                "description": "Official NextVibe og collection limited 25 cNFTs",
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