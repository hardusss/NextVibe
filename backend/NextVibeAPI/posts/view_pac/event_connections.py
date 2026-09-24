import logging
import threading

from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from ..models import EventCheckin, Reputation, Post
from ..constants import IRL_TAP_POINTS, IRL_TAP_DAILY_LIMIT, IRL_TAP_H3_RESOLUTION
from ..src import collectibles
from ..src.meets import ensure_user_meet_slugs, meet_url, slug_for_pair_event, slug_for_pair_today, tap_slug
from user.models import User
from user.src.send_push_message import send
from user.src.blocking import blocked_user_ids, is_blocked_between
from django.db import transaction
from django.db.models import Sum, Q
from django.utils import timezone
from datetime import timedelta, timezone as dt_timezone
import h3

logger = logging.getLogger("posts.networking")


def is_event_active(post, checkin, now):
    """An event counts as active inside its Luma window, else for 24h after
    its start, else for 24h after the user's check-in."""
    start = post.luma_event_start_time
    end = post.luma_event_end_time
    if start and end:
        return start <= now <= end
    if start:
        return start <= now <= (start + timedelta(days=1))
    return now <= (checkin.checked_in_at + timedelta(days=1))


def get_active_checkins(user):
    """The user's currently active check-ins as [(post, checkin)], most
    recent check-in first (EventCheckin's default ordering)."""
    now = timezone.now()
    checkins = EventCheckin.objects.filter(
        user=user, is_registered=True
    ).select_related('post')
    return [(c.post, c) for c in checkins if is_event_active(c.post, c, now)]


def _utc_day_start(now):
    return now.astimezone(dt_timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)


def _blocked_response():
    # Same answer for both people and both directions: it never says who blocked whom
    return Response({
        "error": "You can't connect with this person.",
        "code": "BLOCKED",
    }, status=status.HTTP_400_BAD_REQUEST)


def _collectible_fields(rows, user):
    """The caller's own Proof of Meet collectible: on its way to Solana, or saved off-chain."""
    row = next((r for r in rows or [] if r.user_id == user.user_id), None)
    if row is None:
        return {}
    return {"collectible": {"id": row.pk, "kind": row.kind, "status": row.status, "onchain": row.is_onchain}}


def _meet_fields(slug):
    """The Proof of Meet a tap response points at (nothing for rows from before slugs)."""
    return {"meet_slug": slug, "meet_url": meet_url(slug)} if slug else {}


def _avatar_url(user):
    if not user:
        return None
    try:
        if user.avatar and getattr(user.avatar, 'name', None):
            return user.avatar.url
    except Exception:
        pass
    return None


class UserEventConnectionsView(APIView):
    """
    GET /posts/user-event-connections/
    Returns a list of events attended, as well as a full breakdown of reputation sources
    (e.g., event check-ins, event posts, Cherry invite rewards, email verification, and referral bonuses).
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        target_user = request.user
        hidden = blocked_user_ids(request.user)
        user_id_param = request.query_params.get('user_id')
        if user_id_param:
            try:
                target_user = User.objects.get(user_id=user_id_param)
            except User.DoesNotExist:
                return Response({"error": "User not found."}, status=status.HTTP_404_NOT_FOUND)
            if target_user.user_id in hidden:
                return Response({"error": "User not found."}, status=status.HTTP_404_NOT_FOUND)

        my_checkins = EventCheckin.objects.filter(
            user=target_user, is_registered=True
        ).select_related('post')

        # Proof of Meet links only on your own history: anyone can share
        # their own meets, nobody else's. Past taps that don't have their
        # slug yet get it now, so every old meet can be shared.
        own = target_user.user_id == request.user.user_id
        if own:
            ensure_user_meet_slugs(target_user.user_id)

        def meet_slug(rep):
            return rep.meet_slug if own else None

        events_data = []
        now = timezone.now()

        for checkin in my_checkins:
            post = checkin.post

            checkin_rep = Reputation.objects.filter(
                user=target_user, event=post, is_checkin=True
            ).aggregate(total=Sum('points'))['total'] or 0

            peer_reps = Reputation.objects.filter(
                event=post,
                is_checkin=False,
                post__isnull=True
            ).filter(
                Q(user=target_user) | Q(given_by=target_user)
            ).select_related('user', 'given_by')

            peer_map = {}
            for rep in peer_reps:
                if rep.user == target_user:
                    other = rep.given_by
                    direction = "received"
                else:
                    other = rep.user
                    direction = "given"

                uid = other.user_id
                if uid not in peer_map:
                    avatar_url = None
                    if other.avatar and getattr(other.avatar, 'name', None):
                        avatar_url = other.avatar.url
                    peer_map[uid] = {
                        "user_id": uid,
                        "username": other.username,
                        "is_official": other.official,
                        "is_seeker_verified": other.seeker_verified,
                        "avatar": avatar_url,
                        "rep_received": 0,
                        "rep_given": 0,
                    }
                if direction == "received":
                    peer_map[uid]["rep_received"] += rep.points
                else:
                    peer_map[uid]["rep_given"] += rep.points
                if meet_slug(rep) and not peer_map[uid].get("meet_slug"):
                    peer_map[uid]["meet_slug"] = meet_slug(rep)

            # Totals still count everyone; only the people shown are filtered
            connections = [c for c in peer_map.values() if c["user_id"] not in hidden]

            event_image = None
            media = post.media.first()
            if media and getattr(media, 'file', None):
                event_image = media.file_url

            is_active = is_event_active(post, checkin, now)

            events_data.append({
                "event_id": post.id,
                "event_name": post.about or "Event",
                "event_image": event_image,
                "checkin_rep": checkin_rep,
                "total_rep": checkin_rep + sum(c["rep_received"] for c in peer_map.values()),
                "connections": connections,
                "checked_in_at": checkin.checked_in_at,
                "is_active": is_active, 
            })

        # 2. Detailed Reputation Breakdown Items (Comprehensive Multi-Source Aggregation)
        reputation_items = []
        all_reps = Reputation.objects.filter(user=target_user).select_related('event', 'post', 'given_by')

        user_date = getattr(target_user, 'created_at', None) or timezone.now()

        for rep in all_reps:
            # Case 0: IRL tap (outside any event)
            if rep.source == 'irl':
                other_name = rep.given_by.username if rep.given_by else "Someone"
                reputation_items.append({
                    "id": f"rep_{rep.id}",
                    "type": "irl_tap",
                    "title": f"Met {other_name}",
                    "description": f"Tapped in person with {other_name}",
                    "points": rep.points,
                    "date": rep.created_at or user_date,
                    "icon": "🤝",
                    "badge_color": "#A855F7",
                    "source": rep.source,
                    "meet_slug": meet_slug(rep),
                })
            # Case A: Cherry invite code activation
            elif rep.post_type == "cherry_invite_code":
                reputation_items.append({
                    "id": f"rep_{rep.id}",
                    "type": "cherry_invite_code",
                    "title": "CHERRY Invite Code Activation",
                    "description": "Activated account using CHERRY invite code",
                    "points": rep.points,
                    "date": rep.created_at or user_date,
                    "icon": "🍒",
                    "badge_color": "#FF5BA8",
                    "source": rep.source,
                })
            # Case B: Email Verification reward
            elif rep.post_type == "link_email_reward":
                reputation_items.append({
                    "id": f"rep_{rep.id}",
                    "type": "email_verification",
                    "title": "Email Linked & Verified",
                    "description": "Linked and verified account email address",
                    "points": rep.points,
                    "date": rep.created_at or user_date,
                    "icon": "✉️",
                    "badge_color": "#3B82F6",
                    "source": rep.source,
                })
            # Case C: Invite / Referral milestone reward
            elif rep.post_type and rep.post_type.startswith("invite_reward"):
                reputation_items.append({
                    "id": f"rep_{rep.id}",
                    "type": "invite_reward",
                    "title": "Community Referral Bonus",
                    "description": "Reputation for inviting friends to NextVibe",
                    "points": rep.points,
                    "date": rep.created_at or user_date,
                    "icon": "👥",
                    "badge_color": "#10B981",
                    "source": rep.source,
                })
            # Case D: Event Check-in
            elif rep.is_checkin and rep.event:
                reputation_items.append({
                    "id": f"rep_{rep.id}",
                    "type": "event_checkin",
                    "title": f"Checked in: {rep.event.about or 'Event'}",
                    "description": f"Verified attendance at event '{rep.event.about or 'Event'}'",
                    "points": rep.points,
                    "date": rep.created_at or user_date,
                    "event_id": rep.event.id,
                    "icon": "🎟️",
                    "badge_color": "#22C55E",
                    "source": rep.source,
                })
            # Case E: Post created at Event
            elif rep.post_type == "event_post" or (rep.post and not rep.is_checkin):
                p = rep.post
                event_title = rep.event.about if rep.event else (p.on_event.about if (p and p.on_event and p.on_event.about) else "Event")
                post_image = None
                if p:
                    media = p.media.first()
                    if media and getattr(media, 'file', None):
                        post_image = media.file_url

                reputation_items.append({
                    "id": f"rep_{rep.id}",
                    "type": "event_post",
                    "title": f"Post at Event: {event_title}",
                    "description": f"+{rep.points} REP for creating a post at event '{event_title}'",
                    "points": rep.points,
                    "date": rep.created_at or (p.create_at if p else user_date),
                    "image": post_image,
                    "post_id": p.id if p else None,
                    "event_id": rep.event.id if rep.event else (p.on_event.id if (p and p.on_event) else None),
                    "icon": "📝",
                    "badge_color": "#A78BFA",
                    "source": rep.source,
                })
            # Case F: Peer interaction / Networking
            elif rep.event and not rep.is_checkin:
                other_name = rep.given_by.username if rep.given_by else "Peer"
                reputation_items.append({
                    "id": f"rep_{rep.id}",
                    "type": "networking",
                    "title": f"Met {other_name} at {rep.event.about or 'Event'}",
                    "description": f"Networked via tap with {other_name}",
                    "points": rep.points,
                    "date": rep.created_at or user_date,
                    "event_id": rep.event.id,
                    "icon": "🤝",
                    "badge_color": "#EAB308",
                    "source": rep.source,
                    "meet_slug": meet_slug(rep),
                })
            else:
                reputation_items.append({
                    "id": f"rep_{rep.id}",
                    "type": "generic",
                    "title": "Reputation Reward",
                    "description": f"Reputation awarded by {rep.given_by.username if rep.given_by else 'NextVibe System'}",
                    "points": rep.points,
                    "date": rep.created_at or user_date,
                    "icon": "⭐",
                    "badge_color": "#F59E0B",
                    "source": rep.source,
                })

        # Fallback Check B: User Posts created on Events or earning reputation (only for posts in DB)
        user_posts_on_events = Post.objects.filter(
            owner=target_user
        ).filter(
            Q(on_event__isnull=False) | Q(reputation_earned__gt=0)
        ).select_related('on_event')

        existing_post_ids = {r.get("post_id") for r in reputation_items if r.get("post_id")}

        for p in user_posts_on_events:
            if p.id not in existing_post_ids:
                event_title = p.on_event.about if (p.on_event and p.on_event.about) else "Event"
                post_image = None
                media = p.media.first()
                if media and getattr(media, 'file', None):
                    post_image = media.file_url

                pts = p.reputation_earned if (p.reputation_earned and p.reputation_earned > 0) else 10

                reputation_items.append({
                    "id": f"post_rep_{p.id}",
                    "type": "event_post",
                    "title": f"Post at Event: {event_title}",
                    "description": f"+{pts} REP for creating a post at event '{event_title}'",
                    "points": pts,
                    "date": p.create_at,
                    "image": post_image,
                    "post_id": p.id,
                    "event_id": p.on_event.id if p.on_event else None,
                    "icon": "📝",
                    "badge_color": "#A78BFA",
                    "source": "post",
                })

        # Fallback Check C: Event Check-ins (only for checkin records in DB)
        existing_checkin_event_ids = {r.get("event_id") for r in reputation_items if r.get("type") == "event_checkin"}
        for checkin in my_checkins:
            ev_id = checkin.post.id if checkin.post else None
            if ev_id and ev_id not in existing_checkin_event_ids:
                event_title = checkin.post.about if (checkin.post and checkin.post.about) else "Event"
                event_image = None
                if checkin.post:
                    media = checkin.post.media.first()
                    if media and getattr(media, 'file', None):
                        event_image = media.file_url

                reputation_items.append({
                    "id": f"checkin_fallback_{checkin.id}",
                    "type": "event_checkin",
                    "title": f"Checked in: {event_title}",
                    "description": f"Verified attendance & POAP claimed for '{event_title}'",
                    "points": 50,
                    "date": checkin.checked_in_at,
                    "image": event_image,
                    "event_id": ev_id,
                    "icon": "🎟️",
                    "badge_color": "#22C55E",
                    "source": "checkin",
                })

        # Sort reputation items by date (newest first)
        reputation_items.sort(key=lambda x: str(x.get("date", "")), reverse=True)

        total_calculated_rep = sum(item.get("points", 0) for item in reputation_items)

        # Rows that name a blocked person ("Met <name>", "awarded by <name>") are
        # hidden; the total above still counts their points
        blocked_rep_ids = {f"rep_{rep.id}" for rep in all_reps if rep.given_by_id in hidden}
        reputation_items = [
            item for item in reputation_items
            if not (item["type"] in ("irl_tap", "networking", "generic") and item["id"] in blocked_rep_ids)
        ]

        # 3. IRL taps (outside any event) — one row per tap, newest first
        irl_taps = []
        irl_reps = Reputation.objects.filter(
            user=target_user, source='irl'
        ).exclude(given_by_id__in=hidden).select_related('given_by').order_by('-created_at')
        for rep in irl_reps:
            other = rep.given_by
            avatar_url = _avatar_url(other)
            lat, lng = None, None
            if rep.h3_geo:
                try:
                    lat, lng = h3.cell_to_latlng(rep.h3_geo)
                except Exception:
                    pass
            irl_taps.append({
                "id": rep.id,
                "user_id": other.user_id if other else None,
                "username": other.username if other else "Someone",
                "avatar": avatar_url,
                "is_official": other.official if other else False,
                "is_seeker_verified": other.seeker_verified if other else False,
                "points": rep.points,
                "date": rep.created_at,
                "lat": lat,
                "lng": lng,
                "meet_slug": meet_slug(rep),
            })

        return Response({
            "events": events_data,
            "reputation_items": reputation_items,
            "irl_taps": irl_taps,
            "total_reputation": total_calculated_rep,
        }, status=status.HTTP_200_OK)


def process_nfc_connect(requesting_user, event_id, scanned_user_id, latitude=None, longitude=None, commit=True):
    """
    Core networking logic. Returns a Response object.
    Handles: geo verification, check-in verification, duplicate check, reputation calc, record creation.
    With commit=False, runs every validation and the points calc but writes nothing —
    used to show the responder a confirmation step before anything is granted.
    """
    h3_geo_val = None
    if latitude is not None and longitude is not None:
        try:
            # Use resolution 15 for max precision
            h3_geo_val = h3.latlng_to_cell(float(latitude), float(longitude), res=15)
        except Exception:
            logger.warning("networking.h3_error", exc_info=True)

    if not event_id or not scanned_user_id:
        return Response({"error": "event_id and scanned_user_id are required."}, status=status.HTTP_400_BAD_REQUEST)

    if str(requesting_user.user_id) == str(scanned_user_id):
        return Response({"error": "You cannot network with yourself."}, status=status.HTTP_400_BAD_REQUEST)

    try:
        post = Post.objects.get(id=event_id, is_luma_event=True)
        scanned_user = User.objects.get(user_id=scanned_user_id)
    except (Post.DoesNotExist, User.DoesNotExist):
        return Response({"error": "Invalid event or user."}, status=status.HTTP_404_NOT_FOUND)

    # Before anything that could name them — the preview must not show who it is
    if is_blocked_between(requesting_user.user_id, scanned_user.user_id):
        return _blocked_response()

    # Geolocation check. A preview without coordinates is allowed — the
    # confirming call always re-runs this with coordinates required.
    if post.h3_geo:
        if latitude is None or longitude is None:
            if commit:
                return Response({"error": "Location coordinates are required for networking at this event."}, status=status.HTTP_400_BAD_REQUEST)
        else:
            try:
                lat = float(latitude)
                lng = float(longitude)
                event_res = h3.get_resolution(post.h3_geo)
                user_cell = h3.latlng_to_cell(lat, lng, event_res)
                if h3.grid_distance(user_cell, post.h3_geo) > 2:
                    return Response({"error": "You must be physically present at the event zone to network."}, status=status.HTTP_400_BAD_REQUEST)
            except Exception:
                logger.warning("networking.geofence_error event=%s", post.id, exc_info=True)
                return Response({"error": "Invalid location coordinates provided."}, status=status.HTTP_400_BAD_REQUEST)

    # Check if the scanning user is registered/checked-in
    is_registered = EventCheckin.objects.filter(user=requesting_user, post=post, is_registered=True).exists()
    if not is_registered:
        return Response({"error": "You must check-in to this event first."}, status=status.HTTP_403_FORBIDDEN)

    # Check if they already networked at this event. post__isnull=True keeps
    # post-linked rep rows (event_post awards, collect bonuses) from counting
    # as a tap — same filter every other consumer of these rows uses.
    already_networked = Reputation.objects.filter(
        event=post,
        is_checkin=False,
        post__isnull=True,
        user=requesting_user,
        given_by=scanned_user
    ).exists()

    if already_networked:
        return Response({
            "error": "You have already connected with this user at this event.",
            **_meet_fields(slug_for_pair_event(requesting_user.user_id, scanned_user.user_id, post.id)),
        }, status=status.HTTP_400_BAD_REQUEST)

    # Calculate total rep for both
    rep_scanner = Reputation.objects.filter(user=requesting_user).aggregate(total=Sum('points'))['total'] or 0
    rep_scanned = Reputation.objects.filter(user=scanned_user).aggregate(total=Sum('points'))['total'] or 0

    # Formula: max(2, min(20, int((HighRep - LowRep) * 0.15)))
    # For the scanner (requesting_user):
    if rep_scanned > rep_scanner:
        scanner_gains = max(2, min(20, int((rep_scanned - rep_scanner) * 0.15)))
        scanned_gains = 2
    else:
        scanner_gains = 2
        scanned_gains = max(2, min(20, int((rep_scanner - rep_scanned) * 0.15)))

    # Avatar URL for response
    avatar_url = None
    if scanned_user.avatar and getattr(scanned_user.avatar, 'name', None):
        avatar_url = scanned_user.avatar.url

    scanned_user_payload = {
        "user_id": scanned_user.user_id,
        "username": scanned_user.username,
        "avatar": avatar_url,
        "is_official": scanned_user.official,
        "is_seeker_verified": scanned_user.seeker_verified,
    }

    if not commit:
        return Response({
            "preview": True,
            "earned_points": scanner_gains,
            "scanned_user": scanned_user_payload,
        }, status=status.HTTP_200_OK)

    # Create Reputation records: one Proof of Meet, one slug on both rows
    meet_slug = tap_slug(requesting_user.user_id, scanned_user.user_id, 'event', event_id=post.id)
    with transaction.atomic():
        Reputation.objects.create(
            user=requesting_user,
            given_by=scanned_user,
            points=scanner_gains,
            is_checkin=False,
            event=post,
            h3_geo=h3_geo_val,
            source='event',
            meet_slug=meet_slug,
        )

        Reputation.objects.create(
            user=scanned_user,
            given_by=requesting_user,
            points=scanned_gains,
            is_checkin=False,
            event=post,
            h3_geo=h3_geo_val,
            source='event',
            meet_slug=meet_slug,
        )
        # Both people's Proof of Meet, minted now for whoever has a wallet
        meet_rows = collectibles.record_meet(meet_slug, requesting_user, scanned_user)

    return Response({
        "success": True,
        "message": f"Connected with {scanned_user.username}!",
        "earned_points": scanner_gains,
        "scanned_user": scanned_user_payload,
        **_meet_fields(meet_slug),
        **_collectible_fields(meet_rows, requesting_user),
    }, status=status.HTTP_200_OK)


class EventNFCConnectView(APIView):
    """
    POST /posts/event-nfc-connect/
    Body: { "event_id": int, "scanned_user_id": int, "latitude": float, "longitude": float }
    """
    permission_classes = [IsAuthenticated]

    def post(self, request):
        event_id = request.data.get('event_id')
        scanned_user_id = request.data.get('scanned_user_id')
        latitude = request.data.get('latitude')
        longitude = request.data.get('longitude')

        return process_nfc_connect(
            requesting_user=request.user,
            event_id=event_id,
            scanned_user_id=scanned_user_id,
            latitude=latitude,
            longitude=longitude
        )


def _send_tap_push_async(receiver, tapper_username):
    push_token = getattr(receiver, "expo_push_token", None)
    if not push_token:
        return
    try:
        send(
            token=push_token,
            title="Tap to Meet",
            body=f"{tapper_username} tapped with you",
        )
    except Exception:
        logger.warning("networking.tap_push_failed receiver=%s", receiver.pk, exc_info=True)


def _send_tap_push_in_background(receiver, tapper_username):
    threading.Thread(
        target=_send_tap_push_async,
        args=(receiver, tapper_username),
        daemon=True,
    ).start()


def process_irl_tap(requesting_user, scanned_user_id, latitude=None, longitude=None, commit=True):
    """
    Tap outside any event: no geofence, no check-in gate.
    Both sides get IRL_TAP_POINTS. One tap per pair per UTC day,
    at most IRL_TAP_DAILY_LIMIT taps per user per UTC day.
    Returns a Response object shaped like process_nfc_connect's success payload.
    With commit=False, runs every validation but writes nothing and sends no push —
    used to show the responder a confirmation step before anything is granted.
    """
    if not scanned_user_id:
        return Response({"error": "scanned_user_id is required."}, status=status.HTTP_400_BAD_REQUEST)

    if str(requesting_user.user_id) == str(scanned_user_id):
        return Response({"error": "You cannot tap with yourself."}, status=status.HTTP_400_BAD_REQUEST)

    try:
        scanned_user = User.objects.get(user_id=scanned_user_id)
    except User.DoesNotExist:
        return Response({"error": "Invalid user."}, status=status.HTTP_404_NOT_FOUND)

    # Before anything that could name them — the preview must not show who it is
    if is_blocked_between(requesting_user.user_id, scanned_user.user_id):
        return _blocked_response()

    now = timezone.now()
    day_start = _utc_day_start(now)

    # Rows are created in mirrored pairs, so one direction is enough.
    already_tapped = Reputation.objects.filter(
        source='irl',
        user=requesting_user,
        given_by=scanned_user,
        created_at__gte=day_start,
    ).exists()
    if already_tapped:
        return Response({
            "error": f"You already tapped with {scanned_user.username} today. See you tomorrow!",
            "code": "ALREADY_TAPPED_TODAY",
            # Both pressed Confirm at once: the other request wrote the meet
            **_meet_fields(slug_for_pair_today(requesting_user.user_id, scanned_user.user_id, day_start)),
        }, status=status.HTTP_400_BAD_REQUEST)

    my_taps_today = Reputation.objects.filter(
        source='irl', user=requesting_user, created_at__gte=day_start
    ).count()
    if my_taps_today >= IRL_TAP_DAILY_LIMIT:
        return Response({
            "error": "You've hit today's tap limit. Back at it tomorrow!",
            "code": "IRL_DAILY_LIMIT",
        }, status=status.HTTP_429_TOO_MANY_REQUESTS)

    their_taps_today = Reputation.objects.filter(
        source='irl', user=scanned_user, created_at__gte=day_start
    ).count()
    if their_taps_today >= IRL_TAP_DAILY_LIMIT:
        return Response({
            "error": f"{scanned_user.username} has hit today's tap limit.",
            "code": "IRL_DAILY_LIMIT",
        }, status=status.HTTP_429_TOO_MANY_REQUESTS)

    h3_geo_val = None
    if latitude is not None and longitude is not None:
        try:
            h3_geo_val = h3.latlng_to_cell(float(latitude), float(longitude), res=IRL_TAP_H3_RESOLUTION)
        except Exception:
            logger.warning("networking.h3_error", exc_info=True)

    avatar_url = _avatar_url(scanned_user)

    if not commit:
        return Response({
            "preview": True,
            "earned_points": IRL_TAP_POINTS,
            "source": "irl",
            "scanned_user": {
                "user_id": scanned_user.user_id,
                "username": scanned_user.username,
                "avatar": avatar_url,
                "is_official": scanned_user.official,
                "is_seeker_verified": scanned_user.seeker_verified,
            }
        }, status=status.HTTP_200_OK)

    # One Proof of Meet per pair per UTC day: same key as the check above
    meet_slug = tap_slug(requesting_user.user_id, scanned_user.user_id, 'irl', when=now)
    with transaction.atomic():
        Reputation.objects.create(
            user=requesting_user,
            given_by=scanned_user,
            points=IRL_TAP_POINTS,
            is_checkin=False,
            event=None,
            h3_geo=h3_geo_val,
            source='irl',
            meet_slug=meet_slug,
        )
        Reputation.objects.create(
            user=scanned_user,
            given_by=requesting_user,
            points=IRL_TAP_POINTS,
            is_checkin=False,
            event=None,
            h3_geo=h3_geo_val,
            source='irl',
            meet_slug=meet_slug,
        )
        # Both people's Proof of Meet, minted now for whoever has a wallet
        meet_rows = collectibles.record_meet(meet_slug, requesting_user, scanned_user)
        transaction.on_commit(
            lambda: _send_tap_push_in_background(scanned_user, requesting_user.username)
        )

    return Response({
        "success": True,
        "message": f"You met {scanned_user.username}!",
        "earned_points": IRL_TAP_POINTS,
        "source": "irl",
        "scanned_user": {
            "user_id": scanned_user.user_id,
            "username": scanned_user.username,
            "avatar": avatar_url,
            "is_official": scanned_user.official,
            "is_seeker_verified": scanned_user.seeker_verified,
        },
        **_meet_fields(meet_slug),
        **_collectible_fields(meet_rows, requesting_user),
    }, status=status.HTTP_200_OK)


class IRLTapView(APIView):
    """
    POST /posts/irl-tap/
    Body: { "scanned_user_id": int, "latitude"?: float, "longitude"?: float }
    """
    permission_classes = [IsAuthenticated]

    def post(self, request):
        return process_irl_tap(
            requesting_user=request.user,
            scanned_user_id=request.data.get('scanned_user_id'),
            latitude=request.data.get('latitude'),
            longitude=request.data.get('longitude'),
        )


class ActiveCheckinView(APIView):
    """
    GET /posts/active-checkin/
    Lightweight list of events the current user is checked in to that are
    still active (same rule as UserEventConnectionsView).
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        active_events = []
        for post, checkin in get_active_checkins(request.user):
            event_image = None
            media = post.media.first()
            if media and getattr(media, 'file', None):
                event_image = media.file_url
            active_events.append({
                "event_id": post.id,
                "event_name": post.about or "Event",
                "event_image": event_image,
                "checked_in_at": checkin.checked_in_at,
            })
        return Response({"active_events": active_events}, status=status.HTTP_200_OK)