from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from django.shortcuts import get_object_or_404
from ..models import Post, EventRequest, EventCheckin


class EventCheckinView(APIView):
    """
    POST /posts/event-checkin/<post_id>/
    Called by the attendee after tapping NFC and opening the deeplink.
    Checks if the user has an approved EventRequest, creates a check-in record.
    """
    permission_classes = [IsAuthenticated]

    def post(self, request, post_id):
        import random
        import requests
        from ..models import Reputation, UserCollection

        post = get_object_or_404(Post, id=post_id, is_luma_event=True)

        # Check if user has an approved event request
        is_registered = EventRequest.objects.filter(
            user=request.user,
            post=post,
            status=EventRequest.Status.APPROVED
        ).exists()

        # Create or get check-in record
        checkin, created = EventCheckin.objects.get_or_create(
            user=request.user,
            post=post,
            defaults={'is_registered': is_registered}
        )

        earned_points = 0

        if not created:
            # Update registration status in case it changed
            if checkin.is_registered != is_registered:
                checkin.is_registered = is_registered
                checkin.save(update_fields=['is_registered'])
        
        if is_registered:
            # 1. Grant reputation if not already granted
            has_rep = Reputation.objects.filter(user=request.user, event=post, is_checkin=True).exists()
            if not has_rep:
                earned_points = random.randint(5, 20)
                Reputation.objects.create(
                    user=request.user,
                    given_by=post.owner,
                    points=earned_points,
                    is_checkin=True,
                    event=post
                )
            else:
                # If they already have rep, fetch it to show in UI if we want, or leave as 0
                rep = Reputation.objects.filter(user=request.user, event=post, is_checkin=True).first()
                if rep:
                    earned_points = rep.points


        avatar_url = None
        if request.user.avatar and getattr(request.user.avatar, 'name', None):
            avatar_url = request.user.avatar.url

        post_image = None
        if post.file and getattr(post.file, 'name', None):
            post_image = post.file.url

        message = "You're verified! Welcome to the event."
        if is_registered:
            if earned_points > 0:
                message += f" +{earned_points} Rep!"
        else:
            message = "You are not registered for this event."

        return Response({
            "verified": is_registered,
            "already_checked_in": not created,
            "user_id": request.user.user_id,
            "username": request.user.username,
            "avatar": avatar_url,
            "post_image": post_image,
            "post_name": post.name,
            "checked_in_at": checkin.checked_in_at,
            "earned_points": earned_points,
            "message": message
        }, status=status.HTTP_200_OK)


class ClaimEventNftView(APIView):
    """
    POST /posts/claim-event-cnft/<post_id>/
    Called after check-in to claim the event cNFT.
    """
    permission_classes = [IsAuthenticated]

    def post(self, request, post_id):
        import requests
        from ..models import UserCollection

        post = get_object_or_404(Post, id=post_id, is_luma_event=True)

        # Ensure user is checked in
        is_checked_in = EventCheckin.objects.filter(
            user=request.user, post=post, is_registered=True
        ).exists()

        if not is_checked_in:
            return Response({"error": "You must check in first."}, status=status.HTTP_400_BAD_REQUEST)

        if not request.user.wallet_address:
            return Response({"error": "No wallet address provided. Please link your wallet."}, status=status.HTTP_400_BAD_REQUEST)

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
                post.minted_count += 1
                post.is_nft = True
                post.save(update_fields=["minted_count", "is_nft"])
                
                return Response({"success": True, "message": "Event NFT minted successfully!"}, status=status.HTTP_200_OK)
            else:
                return Response({"error": "Failed to mint NFT. Please try again."}, status=status.HTTP_400_BAD_REQUEST)
        except Exception as e:
            print(f"Mint error on claim: {e}")
            return Response({"error": "Minting service error. Please try again."}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


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
