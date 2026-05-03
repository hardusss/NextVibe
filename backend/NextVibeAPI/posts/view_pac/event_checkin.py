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
        nft_minted = False

        if not created:
            # Update registration status in case it changed
            if checkin.is_registered != is_registered:
                checkin.is_registered = is_registered
                checkin.save(update_fields=['is_registered'])
        
        if created and is_registered:
            # 1. Grant reputation randomly from 5 to 20
            earned_points = random.randint(5, 20)
            Reputation.objects.create(
                user=request.user,
                given_by=post.owner,
                points=earned_points,
                is_checkin=True,
                event=post
            )

            # 2. Mint NFT of the event if possible
            total_supply = int(post.total_supply if post.total_supply is not None else 50)
            if request.user.wallet_address and int(post.minted_count) < total_supply:
                if not UserCollection.objects.filter(user=request.user, post=post).exists():
                    edition = post.minted_count + 1
                    try:
                        mint_res = requests.post(
                            url="http://localhost:3000/mint",
                            json={
                                "recipient": request.user.wallet_address,
                                "postId": post.id,
                                "edition": edition,
                            },
                            timeout=10,
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
                            nft_minted = True
                    except Exception as e:
                        print(f"Mint error on check-in: {e}")

        avatar_url = None
        if request.user.avatar and getattr(request.user.avatar, 'name', None):
            avatar_url = request.user.avatar.url

        message = "You're verified! Welcome to the event."
        if is_registered:
            if earned_points > 0:
                message += f" +{earned_points} Rep!"
            if nft_minted:
                message += " Event NFT minted!"
        else:
            message = "You are not registered for this event."

        return Response({
            "verified": is_registered,
            "already_checked_in": not created,
            "user_id": request.user.user_id,
            "username": request.user.username,
            "avatar": avatar_url,
            "checked_in_at": checkin.checked_in_at,
            "earned_points": earned_points,
            "nft_minted": nft_minted,
            "message": message
        }, status=status.HTTP_200_OK)


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
