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
                "description": (
                "Proof-of-attendance and collected posts from NextVibe, the IRL networking "
                "layer on Solana. Every item is minted when someone checks in to an event "
                "or collects a post in the app."
            ),
            "image": "https://media.nextvibe.io/NextVibeNFTCollectionImage.jpg",
            "type": "image/jpeg",
            "properties": {
                "files": [
                    {
                        "uri": "https://media.nextvibe.io/NextVibeNFTCollectionImage.jpg",
                        "type": "image/jpeg"
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
            "image": "https://media.nextvibe.io/NextVibeNFTCollectionImage.jpg",
            "type": "image/jpeg",
            "properties": {
                "files": [
                    {
                        "uri": "https://media.nextvibe.io/NextVibeNFTCollectionImage.jpg",
                        "type": "image/jpeg"                     
                    }
                ],
                "category": "image",
            },
        }
        return Response(metadata, status=status.HTTP_200_OK)