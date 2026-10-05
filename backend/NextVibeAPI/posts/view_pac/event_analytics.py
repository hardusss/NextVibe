from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from ..models import Collectible, MeetPhoto, Post, EventRequest, EventCheckin, Reputation, UserCollection
from django.db.models import Sum, Count
from django.conf import settings
from collections import defaultdict
from user.models import User, Notification
from user.src.blocking import blocked_user_ids
from ..src.event_access import can_view_event
from ..src.meets import tap_rows
import traceback


class EventAnalyticsView(APIView):
    """
    GET /posts/event-analytics/<int:post_id>/
    Returns analytics data for a specific event (the event owner and admins).
    """
    permission_classes = [IsAuthenticated]

    def get(self, request, post_id):
        try:
            try:
                post = Post.objects.get(id=post_id, is_luma_event=True)
            except Post.DoesNotExist:
                return Response({"error": "Event not found"}, status=status.HTTP_404_NOT_FOUND)

            # Ensure only the owner (or an admin) can view analytics
            if not can_view_event(request.user, post):
                return Response({"error": "Only the event owner can view analytics"}, status=status.HTTP_403_FORBIDDEN)

            # 1. Event Requests counts
            total_requests = EventRequest.objects.filter(post=post).count()
            accepted_requests = EventRequest.objects.filter(post=post, status=EventRequest.Status.APPROVED).count()
            rejected_requests = EventRequest.objects.filter(post=post, status=EventRequest.Status.REJECTED).count()

            # 2. NFC Check-ins
            nfc_checkins = EventCheckin.objects.filter(post=post, is_registered=True).count()

            # 3. Total IRL taps (NFC Networking)
            networking_records_count = Reputation.objects.filter(event=post, is_checkin=False, post__isnull=True).count()
            total_irl_taps = networking_records_count // 2

            # 4. Total reputation earned at this event
            total_reputation = Reputation.objects.filter(event=post).aggregate(total=Sum('points'))['total'] or 0

            # 5. cNFT Claim Rate statistics
            checked_in_users = EventCheckin.objects.filter(post=post).values_list('user_id', flat=True)
            total_checkins = checked_in_users.count()
            successful_claims = UserCollection.objects.filter(post=post, user_id__in=checked_in_users).count()
            cnft_claim_rate = round((successful_claims / total_checkins * 100), 2) if total_checkins > 0 else 0.0

            # 6. Ecosystem Statistics for accepted attendees (Wallet vs Web2 Auth Provider)
            accepted_attendee_ids = EventRequest.objects.filter(
                post=post,
                status=EventRequest.Status.APPROVED
            ).values_list('user_id', flat=True)

            total_users = accepted_attendee_ids.count()
            mwa_wallet_users = User.objects.filter(
                user_id__in=accepted_attendee_ids,
                auth_provider='wallet'
            ).count()
            web2_users = User.objects.filter(
                user_id__in=accepted_attendee_ids
            ).exclude(
                auth_provider='wallet'
            ).count()
            mwa_percentage = round((mwa_wallet_users / total_users * 100), 2) if total_users > 0 else 0.0
            web2_percentage = round((web2_users / total_users * 100), 2) if total_users > 0 else 0.0

            ecosystem_stats = {
                "total_users": total_users,
                "mwa_wallet_users": mwa_wallet_users,
                "web2_users": web2_users,
                "mwa_percentage": mwa_percentage,
                "web2_percentage": web2_percentage,
            }

            # 7. Peak Activity Timeline (hourly NFC interactions checkins + networking)
            reps = Reputation.objects.filter(event=post)
            hourly_map = {}
            seen_networking_pairs = set()

            for rep in reps:
                # Guard against missing created_at in legacy data
                if not rep.created_at:
                    continue

                # Group by hour (UTC)
                hour_str = rep.created_at.replace(minute=0, second=0, microsecond=0).isoformat()
                if hour_str not in hourly_map:
                    hourly_map[hour_str] = {
                        "hour": hour_str,
                        "checkins": 0,
                        "networking": 0,
                        "total": 0
                    }

                if rep.is_checkin:
                    hourly_map[hour_str]["checkins"] += 1
                    hourly_map[hour_str]["total"] += 1
                elif not rep.post_id:
                    # Guard against missing given_by in legacy data
                    if rep.user_id and rep.given_by_id:
                        user_ids = sorted([rep.user_id, rep.given_by_id])
                        pair_key = (hour_str, user_ids[0], user_ids[1])
                        if pair_key not in seen_networking_pairs:
                            seen_networking_pairs.add(pair_key)
                            hourly_map[hour_str]["networking"] += 1
                            hourly_map[hour_str]["total"] += 1

            hourly_activity = sorted(hourly_map.values(), key=lambda x: x["hour"])

            # 8. Proof of Meets at the event and how many carry a selfie
            #    (a photo both people agreed to: approved and minting, or minted)
            meet_rows = reps.filter(is_checkin=False, post__isnull=True).values_list("user_id", "given_by_id", "meet_slug")
            meet_pairs = {frozenset((u, g)) for u, g, _ in meet_rows if u and g and u != g}
            meet_slugs = {slug for _, _, slug in meet_rows if slug}
            meets_with_selfie = MeetPhoto.objects.filter(
                meet_slug__in=meet_slugs,
                status__in=[MeetPhoto.Status.APPROVED, MeetPhoto.Status.MINTED],
            ).values("meet_slug").distinct().count() if meet_slugs else 0

            # 9. Seeker Verified among checked-in guests
            guest_ids = EventCheckin.objects.filter(post=post, is_registered=True).values_list("user_id", flat=True)
            seeker_verified_guests = User.objects.filter(user_id__in=guest_ids, seeker_verified=True).count()

            # 10. POAPs: minted on-chain vs saved off-chain (wallet-optional check-in)
            poap_counts = dict(
                Collectible.objects.filter(kind=Collectible.Kind.POAP, source_id=str(post.id))
                .order_by().values_list("status").annotate(n=Count("id"))
            )
            S = Collectible.Status

            data = {
                "total_requests": total_requests,
                "accepted_requests": accepted_requests,
                "rejected_requests": rejected_requests,
                "nfc_checkins": nfc_checkins,
                "total_irl_taps": total_irl_taps,
                "total_reputation_earned": total_reputation,
                "cnft_claims_count": successful_claims,
                "cnft_claim_rate": cnft_claim_rate,
                "ecosystem_stats": ecosystem_stats,
                "hourly_activity": hourly_activity,
                "proof_of_meets": len(meet_pairs),
                "meets_with_selfie": meets_with_selfie,
                "seeker_verified_guests": seeker_verified_guests,
                "poap_status": {
                    "onchain": poap_counts.get(S.MINTED, 0),
                    "saved": poap_counts.get(S.OFFCHAIN, 0),
                    "pending": poap_counts.get(S.QUEUED, 0) + poap_counts.get(S.MINTING, 0),
                    "failed": poap_counts.get(S.FAILED, 0),
                },
            }

            return Response(data, status=status.HTTP_200_OK)

        except Exception as e:
            traceback.print_exc()
            return Response({"error": "Internal server error occurred."},
                            status=status.HTTP_500_INTERNAL_SERVER_ERROR)


class EventTopUsersView(APIView):
    """
    GET /posts/event-top-users/<int:post_id>/
    Returns top users at an event based on reputation and taps.
    """
    permission_classes = [IsAuthenticated]

    def get(self, request, post_id):
        try:
            try:
                post = Post.objects.get(id=post_id, is_luma_event=True)
            except Post.DoesNotExist:
                return Response({"error": "Event not found"}, status=status.HTTP_404_NOT_FOUND)

            # Only the owner (or an admin) sees who came and their wallets
            if not can_view_event(request.user, post):
                return Response({"error": "Only the event owner can view top attendees"},
                                status=status.HTTP_403_FORBIDDEN)

            top_users_qs = Reputation.objects.filter(
                event=post
            ).values(
                'user__user_id',
                'user__username',
                'user__avatar',
                'user__wallet_address'
            ).annotate(
                total_reputation=Sum('points'),
                total_taps=Count('id')
            ).order_by('-total_reputation', '-total_taps')

            top_users = []
            for item in top_users_qs:
                avatar_path = item.get('user__avatar')
                if avatar_path:
                    avatar_url = f"https://{settings.AWS_S3_CUSTOM_DOMAIN}/{avatar_path}"
                else:
                    avatar_url = None

                top_users.append({
                    "user_id": item['user__user_id'],
                    "username": item['user__username'],
                    "wallet_address": item['user__wallet_address'],
                    "avatar": avatar_url,
                    "total_taps": item['total_taps'],
                    "total_reputation": item['total_reputation'] or 0
                })

            return Response(top_users, status=status.HTTP_200_OK)

        except Exception as e:
            traceback.print_exc()
            return Response({"error": "Internal server error occurred."},
                            status=status.HTTP_500_INTERNAL_SERVER_ERROR)


class EventSocialGraphView(APIView):
    """
    GET /posts/event-social-graph/<int:post_id>/
    Returns nodes and edges representing the event's attendee networking graph.
    """
    permission_classes = [IsAuthenticated]

    def get(self, request, post_id):
        try:
            try:
                post = Post.objects.get(id=post_id, is_luma_event=True)
            except Post.DoesNotExist:
                return Response({"error": "Event not found"}, status=status.HTTP_404_NOT_FOUND)

            # Ensure only the owner (or an admin) can view
            if not can_view_event(request.user, post):
                return Response({"error": "Only the event owner can view the social graph"}, status=status.HTTP_403_FORBIDDEN)

            # Fetch all reputation records for the event
            reps = Reputation.objects.filter(event=post).select_related('user')

            # Find all users checked in or involved in networking at this event
            checked_in_user_ids = set(EventCheckin.objects.filter(post=post).values_list('user_id', flat=True))
            rep_user_ids = set(reps.values_list('user_id', flat=True))
            rep_given_by_ids = set(reps.filter(is_checkin=False).values_list('given_by_id', flat=True))
            all_user_ids = checked_in_user_ids | rep_user_ids | rep_given_by_ids

            users = User.objects.filter(user_id__in=all_user_ids)

            user_connections = defaultdict(set)
            user_rep = defaultdict(int)
            edges_map = {}

            for rep in reps:
                user_rep[rep.user.user_id] += rep.points
                if not rep.is_checkin and not rep.post_id:
                    # Guard against missing foreign keys
                    if rep.user_id and rep.given_by_id:
                        u1 = min(rep.user.user_id, rep.given_by_id)
                        u2 = max(rep.user.user_id, rep.given_by_id)
                        edges_map[(u1, u2)] = edges_map.get((u1, u2), 0) + rep.points
                        user_connections[rep.user.user_id].add(rep.given_by_id)
                        user_connections[rep.given_by_id].add(rep.user.user_id)

            nodes = []
            for user in users:
                avatar_url = None
                if user.avatar and getattr(user.avatar, 'name', None):
                    raw = str(user.avatar)
                    if raw.startswith("https://") or raw.startswith("http://"):
                        avatar_url = raw
                    else:
                        avatar_url = f"https://{settings.AWS_S3_CUSTOM_DOMAIN}/{raw}"

                connections_count = len(user_connections[user.user_id])
                nodes.append({
                    "id": user.user_id,
                    "label": user.username,
                    "avatar": avatar_url,
                    "connections_count": connections_count,
                    "reputation_earned": user_rep[user.user_id],
                    "is_super_connector": connections_count >= 3,
                    "is_organizer": user.user_id == post.owner_id
                })

            edges = []
            for (u1, u2), weight in edges_map.items():
                edges.append({
                    "source": u1,
                    "target": u2,
                    "weight": weight
                })

            return Response({
                "nodes": nodes,
                "edges": edges,
                # For the dashboard's replay: how many checked in, and every
                # event tap in the order it happened
                "total_checkins": EventCheckin.objects.filter(post=post, is_registered=True).count(),
                "taps": replay_taps(post),
            }, status=status.HTTP_200_OK)

        except Exception as e:
            traceback.print_exc()
            return Response({"error": "Internal server error occurred."},
                            status=status.HTTP_500_INTERNAL_SERVER_ERROR)


def replay_taps(post):
    """
    The event's taps (source 'event'), one per meet, oldest first:
    {time, h3, user_a, user_b}. time is when the first of its two rows was
    written; h3 the cell it was tapped in (None when the phone sent no
    location); user_a confirmed the tap.
    """
    rows = (
        tap_rows().filter(source="event", event=post)
        .order_by("created_at", "id")
        .values("user_id", "given_by_id", "created_at", "h3_geo", "meet_slug")
    )
    taps, seen = [], {}
    for row in rows:
        pair = frozenset((row["user_id"], row["given_by_id"]))
        key = row["meet_slug"] or pair
        if key in seen:
            tap = seen[key]
            tap["h3"] = tap["h3"] or row["h3_geo"]
            continue
        tap = {
            "time": row["created_at"].isoformat(),
            "h3": row["h3_geo"],
            "user_a": row["user_id"],
            "user_b": row["given_by_id"],
        }
        seen[key] = tap
        taps.append(tap)
    return taps


class EventBroadcastView(APIView):
    """
    POST /posts/event-broadcast/<int:post_id>/
    Allows organizers to send a notification message to all approved event participants.
    """
    permission_classes = [IsAuthenticated]

    def post(self, request, post_id):
        try:
            try:
                post = Post.objects.get(id=post_id, is_luma_event=True)
            except Post.DoesNotExist:
                return Response({"error": "Event not found"}, status=status.HTTP_404_NOT_FOUND)

            # Ensure only the owner can send broadcasts
            if post.owner != request.user:
                return Response({"error": "Only the event owner can send broadcasts"}, status=status.HTTP_403_FORBIDDEN)

            message = request.data.get("message")
            if not message:
                return Response({"error": "Message is required"}, status=status.HTTP_400_BAD_REQUEST)

            # Get all approved event requests
            approved_requests = EventRequest.objects.filter(
                post=post,
                status=EventRequest.Status.APPROVED
            ).exclude(user_id__in=blocked_user_ids(request.user)).select_related('user')

            sent_count = 0
            for req in approved_requests:
                # Create a notification object.
                # This triggers trigger_push_and_cache receiver which sends push notification
                Notification.objects.create(
                    sender=request.user,
                    recipient=req.user,
                    notification_type="event_announcement",
                    post=post,
                    text_preview=message
                )
                sent_count += 1

            return Response({
                "success": True,
                "message": f"Broadcast sent to {sent_count} participants.",
                "recipients_count": sent_count
            }, status=status.HTTP_200_OK)

        except Exception as e:
            traceback.print_exc()
            return Response({"error": "Internal server error occurred."},
                            status=status.HTTP_500_INTERNAL_SERVER_ERROR)
