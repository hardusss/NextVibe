from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from django.shortcuts import get_object_or_404
from ..models import Post, EventRequest, EventCheckin


class EventCheckinView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, post_id):
        post = get_object_or_404(Post, id=post_id, is_luma_event=True)

        is_registered = EventRequest.objects.filter(
            user=request.user,
            post=post,
            status=EventRequest.Status.APPROVED
        ).exists()

        post_image = None
        media = post.media.first()
        if media and getattr(media, 'file', None):
            post_image = media.file_url

        avatar_url = None
        if request.user.avatar and getattr(request.user.avatar, 'name', None):
            avatar_url = request.user.avatar.url

        message = "You're verified! Welcome to the event." if is_registered else "You are not registered for this event."

        return Response({
            "verified": is_registered,
            "user_id": request.user.user_id,
            "username": request.user.username,
            "avatar": avatar_url,
            "post_image": post_image,
            "post_name": post.about or "Event", 
            "message": message,
        }, status=status.HTTP_200_OK)


class ClaimEventNftView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, post_id):
        import random, requests, traceback
        from ..models import UserCollection, Reputation

        post = get_object_or_404(Post, id=post_id, is_luma_event=True)

        is_registered = EventRequest.objects.filter(
            user=request.user,
            post=post,
            status=EventRequest.Status.APPROVED
        ).exists()

        if not is_registered:
            return Response({"error": "You are not registered for this event."}, status=status.HTTP_400_BAD_REQUEST)

        if not request.user.wallet_address:
            return Response({"error": "No wallet address. Please link your wallet."}, status=status.HTTP_400_BAD_REQUEST)

        total_supply = int(post.total_supply if post.total_supply is not None else 50)
        if int(post.minted_count) >= total_supply:
            return Response({"error": "NFTs for this event are sold out."}, status=status.HTTP_400_BAD_REQUEST)

        if UserCollection.objects.filter(user=request.user, post=post).exists():
            return Response({"error": "You already have an NFT for this event."}, status=status.HTTP_400_BAD_REQUEST)

        edition = post.minted_count + 1

        try:
            mint_res = requests.post(
                url="http://localhost:3000/mint",
                json={
                    "recipient": request.user.wallet_address,
                    "postId": post.id,
                    "edition": edition,
                },
                timeout=15,
            ).json()

            if mint_res.get("success"):
                UserCollection.objects.create(
                    user=request.user,
                    post=post,
                    asset_id=mint_res.get("assetId"),
                    signature=mint_res.get("signature"),
                    edition=edition,
                    price=0,
                )

                EventCheckin.objects.get_or_create(
                    user=request.user,
                    post=post,
                    defaults={'is_registered': True}
                )

                post.minted_count += 1
                post.is_nft = True
                post.save(update_fields=["minted_count", "is_nft"])

                existing_rep = Reputation.objects.filter(
                    user=request.user, event=post, is_checkin=True
                ).first()

                if existing_rep:
                    earned_points = existing_rep.points
                else:
                    earned_points = random.randint(5, 20)
                    Reputation.objects.create(
                        user=request.user,
                        given_by=post.owner,
                        points=earned_points,
                        is_checkin=True,
                        event=post,
                    )

                return Response({
                    "success": True,
                    "message": "Event NFT minted successfully!",
                    "earned_points": earned_points,
                }, status=status.HTTP_200_OK)

            else:
                print(f"Mint error: {mint_res}")
                return Response(
                    {"error": f"Failed to mint NFT: {mint_res.get('error', 'Unknown error')}"},
                    status=status.HTTP_400_BAD_REQUEST,
                )

        except Exception as e:
            print(f"Mint exception: {e}")
            traceback.print_exc()
            return Response(
                {"error": "Minting service error. Please try again."},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

class EventCheckinListView(APIView):
    """
    GET /posts/event-checkin/list/<post_id>/
    Returns all users who checked in via NFC for this event.
    Only the event owner can access this endpoint.
    """
    permission_classes = [IsAuthenticated]

    def get(self, request, post_id):
        post = get_object_or_404(Post, id=post_id, is_luma_event=True)

        if post.owner != request.user:
            return Response(
                {"error": "Not authorized"},
                status=status.HTTP_403_FORBIDDEN
            )

        checkins = EventCheckin.objects.filter(post=post).select_related('user')

        data = [
            {
                "user_id": c.user.user_id,
                "username": c.user.username,
                "avatar": c.user.avatar.url if c.user.avatar and getattr(c.user.avatar, 'name', None) else None,
                "is_registered": c.is_registered,
                "checked_in_at": c.checked_in_at,
            }
            for c in checkins
        ]

        registered_count = sum(1 for d in data if d['is_registered'])

        return Response({
            "total": len(data),
            "registered": registered_count,
            "unregistered": len(data) - registered_count,
            "checkins": data,
        }, status=status.HTTP_200_OK)
