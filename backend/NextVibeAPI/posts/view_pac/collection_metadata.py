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
                    "Two people met in person and tapped phones on NextVibe. Each of them "
                    "holds one Proof of Meet; nobody else can collect it."
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
                "POAPs from event check-ins and posts collected on NextVibe, the IRL "
                "networking layer on Solana. Items go on Solana when their holder has a "
                "wallet connected."
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