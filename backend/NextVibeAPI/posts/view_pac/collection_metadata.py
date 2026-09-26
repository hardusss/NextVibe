from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status


class CollectionMetadataView(APIView):
    def get(self, request) -> Response:
        if request.query_params.get("kind") == "meet":
            # The Proof of Meet collection (nft-service/src/create-meet-collection.ts)
            return Response({
                "name": "NextVibe Proof of Meet",
                "symbol": "NVMEET",
                "description": (
                    "Two people met in person, tapped phones on NextVibe and took one selfie "
                    "together. Each of them holds one Proof of Meet; nobody else can collect it."
                ),
                "image": "https://media.nextvibe.io/NextVibeNFTCollectionImage.jpg",
                "external_url": "https://nextvibe.io",
                "properties": {
                    "files": [{"uri": "https://media.nextvibe.io/NextVibeNFTCollectionImage.jpg", "type": "image/jpeg"}],
                    "category": "image",
                },
            }, status=status.HTTP_200_OK)
        is_og = request.query_params.get("isOg", "").lower() == "true"
        if is_og:
            metadata = {
                "name": "NextVibe OG Status",
                "symbol": "NVOG",
                "description": (
                    "NextVibe OG Status is a limited collection for members who brought at least "
                    "three friends to NextVibe. Holding one adds the OG badge, with its edition "
                    "number, to your NextVibe profile."
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