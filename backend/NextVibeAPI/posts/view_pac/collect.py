"""
Free collect: two-phase, gasless, user-signed claim of a post as a cNFT.

prepare — validates eligibility, reserves the next edition, asks the
          nft-service to build a partially signed transaction (backend pays
          the network fee, the user is a required memo signer), and hands
          the transaction to the client for MWA signing.
submit  — sends the user-signed transaction back through the nft-service,
          finalizes the claim, awards the IRL reputation bonus, and
          notifies the author.

Wallets without MWA (LazorKit / passkey sessions) pass signer="none" and
get the legacy fully-backend mint in a single prepare call.
"""

from datetime import timedelta, timezone as dt_timezone
from decimal import Decimal

import requests
from django.db import transaction
from django.utils import timezone
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from user.src.send_push_message import send

from ..constants import (
    COLLECT_CLAIM_TTL_SECONDS,
    COLLECT_DAILY_LIMIT,
    COLLECT_IRL_REP_BONUS,
    COLLECT_IRL_RESERVE_HOURS,
    COLLECT_IRL_RESERVED_EDITIONS,
    COLLECT_MAX_EDITIONS,
    NFT_SERVICE_URL,
)
from ..models import PendingClaim, Post, Reputation, UserCollection
from ..src.collect_eligibility import is_irl_connected
from ..src.collect_memo import build_memo


def _error(code, message, http_status, **extra):
    payload = {"error": message, "code": code}
    payload.update(extra)
    return Response(payload, status=http_status)


def _next_utc_midnight(now):
    day_start = now.astimezone(dt_timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
    return day_start, day_start + timedelta(days=1)


def _finalize_collect(user, post_id, edition, asset_id, signature):
    """Record a confirmed mint: collection row, counters, claim cleanup."""
    with transaction.atomic():
        post = Post.objects.select_for_update().select_related("owner").get(id=post_id)
        collection = UserCollection.objects.create(
            user=user,
            post=post,
            asset_id=asset_id,
            signature=signature,
            edition=edition,
            price=Decimal("0"),
        )
        post.minted_count += 1
        post.is_nft = True
        post.save(update_fields=["minted_count", "is_nft"])
        PendingClaim.objects.filter(user=user, post=post).delete()
    return post, collection


def _after_collect(user, post, edition):
    """Post-mint side effects: IRL reputation bonus and author push."""
    total = post.total_supply or COLLECT_MAX_EDITIONS

    if is_irl_connected(user, post):
        Reputation.objects.create(
            user=user,
            given_by=post.owner,
            points=COLLECT_IRL_REP_BONUS,
            is_checkin=False,
            event=post.on_event,
            post=post,
            post_type="collect",
        )

    push_token = getattr(post.owner, "expo_push_token", None)
    if push_token:
        try:
            send(
                token=push_token,
                title="Your post was collected",
                body=f"{user.username or 'Someone'} collected edition {edition}/{total} of your post.",
            )
        except Exception as e:
            print(f"Push notification failed: {e}")


class CollectPrepareView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request) -> Response:
        post_id = request.data.get("postId")
        signer = request.data.get("signer", "mwa")
        if not post_id:
            return _error("POST_NOT_FOUND", "Missing postId.", status.HTTP_404_NOT_FOUND)

        post = Post.objects.select_related("owner", "on_event").filter(id=post_id).first()
        if not post or not post.is_approved or post.is_hide:
            return _error("POST_NOT_FOUND", "Post not found.", status.HTTP_404_NOT_FOUND)

        if not request.user.wallet_address:
            return _error("WALLET_REQUIRED", "Connect a wallet to collect.", status.HTTP_400_BAD_REQUEST)

        if post.owner == request.user:
            return _error("OWNER_USE_PUBLISH", "Owners publish their post instead of collecting it.", status.HTTP_400_BAD_REQUEST)

        if UserCollection.objects.filter(user=request.user, post=post).exists():
            return _error("ALREADY_CLAIMED", "You already collected this post.", status.HTTP_409_CONFLICT)

        now = timezone.now()
        day_start, resets_at = _next_utc_midnight(now)
        claims_today = UserCollection.objects.filter(
            user=request.user, minted_at__gte=day_start
        ).count()
        if claims_today >= COLLECT_DAILY_LIMIT:
            return _error(
                "DAILY_LIMIT",
                f"You've collected {COLLECT_DAILY_LIMIT} posts today.",
                status.HTTP_429_TOO_MANY_REQUESTS,
                resetsAt=resets_at.isoformat(),
            )

        total = post.total_supply or COLLECT_MAX_EDITIONS

        # Reserve the edition under a row lock so concurrent prepares never
        # hand out the same number. minted_count is NOT incremented here —
        # live PendingClaim rows hold the in-flight editions.
        with transaction.atomic():
            locked = Post.objects.select_for_update().get(id=post.id)
            now = timezone.now()
            PendingClaim.objects.filter(post=locked, expires_at__lt=now).delete()
            PendingClaim.objects.filter(post=locked, user=request.user).delete()
            pending = PendingClaim.objects.filter(post=locked).count()
            next_edition = locked.minted_count + pending + 1

            if next_edition > total:
                return _error("SOLD_OUT", "All editions are gone.", status.HTTP_410_GONE)

            reserve_window_open = (now - locked.create_at) < timedelta(hours=COLLECT_IRL_RESERVE_HOURS)
            if (
                reserve_window_open
                and next_edition <= 1 + COLLECT_IRL_RESERVED_EDITIONS
                and not is_irl_connected(request.user, post)
            ):
                return _error(
                    "RESERVED_FOR_IRL",
                    "Early editions are reserved for people who met the author IRL",
                    status.HTTP_403_FORBIDDEN,
                )

            claim = PendingClaim.objects.create(
                user=request.user,
                post=locked,
                edition=next_edition,
                expires_at=now + timedelta(seconds=COLLECT_CLAIM_TTL_SECONDS),
            )

        # LazorKit / no-MWA sessions: legacy fully-backend mint, finalized
        # immediately, same response shape as submit.
        if signer == "none":
            try:
                mint_res = requests.post(
                    url=f"{NFT_SERVICE_URL}/mint",
                    json={
                        "recipient": request.user.wallet_address,
                        "postId": post.id,
                        "edition": next_edition,
                    },
                    timeout=90,
                ).json()
            except Exception:
                claim.delete()
                return _error("MINT_FAILED", "Mint service connection error.", status.HTTP_502_BAD_GATEWAY)

            if not mint_res.get("success"):
                claim.delete()
                return _error("MINT_FAILED", mint_res.get("error") or "Mint failed on service side.", status.HTTP_502_BAD_GATEWAY)

            finalized_post, _ = _finalize_collect(
                request.user, post.id, next_edition, mint_res.get("assetId"), mint_res.get("signature")
            )
            _after_collect(request.user, finalized_post, next_edition)
            return Response({
                "success": True,
                "edition": next_edition,
                "totalSupply": total,
                "assetId": mint_res.get("assetId"),
                "signature": mint_res.get("signature"),
            }, status=status.HTTP_201_CREATED)

        # MWA path: build the partially signed transaction.
        memo = build_memo(post, next_edition)
        try:
            prep_res = requests.post(
                url=f"{NFT_SERVICE_URL}/collect/prepare",
                json={
                    "recipient": request.user.wallet_address,
                    "postId": post.id,
                    "edition": next_edition,
                    "memo": memo,
                    "userPubkey": request.user.wallet_address,
                },
                timeout=60,
            ).json()
        except Exception:
            claim.delete()
            return _error("MINT_FAILED", "Mint service connection error.", status.HTTP_502_BAD_GATEWAY)

        if not prep_res.get("success"):
            claim.delete()
            return _error("MINT_FAILED", prep_res.get("error") or "Could not prepare the transaction.", status.HTTP_502_BAD_GATEWAY)

        claim.message_hash = prep_res["messageHash"]
        claim.tx_base64 = prep_res["transaction"]
        claim.expires_at = timezone.now() + timedelta(seconds=COLLECT_CLAIM_TTL_SECONDS)
        claim.save(update_fields=["message_hash", "tx_base64", "expires_at"])

        return Response({
            "claimId": str(claim.claim_id),
            "edition": next_edition,
            "totalSupply": total,
            "transaction": prep_res["transaction"],
            "expiresAt": claim.expires_at.isoformat(),
            "memo": memo,
        }, status=status.HTTP_200_OK)


class CollectSubmitView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request) -> Response:
        claim_id = request.data.get("claimId")
        signed_tx = request.data.get("signedTransaction")
        if not claim_id or not signed_tx:
            return _error("CLAIM_NOT_FOUND", "Missing claimId or signedTransaction.", status.HTTP_404_NOT_FOUND)

        claim = (
            PendingClaim.objects
            .select_related("post", "post__owner", "post__on_event")
            .filter(claim_id=claim_id, user=request.user)
            .first()
        )
        if not claim:
            return _error("CLAIM_NOT_FOUND", "Claim not found.", status.HTTP_404_NOT_FOUND)

        if claim.expires_at < timezone.now():
            claim.delete()
            return _error("CLAIM_EXPIRED", "The claim expired — prepare again.", status.HTTP_410_GONE)

        try:
            submit_raw = requests.post(
                url=f"{NFT_SERVICE_URL}/collect/submit",
                json={
                    "signedTransaction": signed_tx,
                    "messageHash": claim.message_hash,
                    "postId": claim.post_id,
                    "edition": claim.edition,
                },
                timeout=90,
            )
            submit_res = submit_raw.json()
        except Exception:
            return _error("MINT_FAILED", "Mint service connection error.", status.HTTP_502_BAD_GATEWAY)

        if not submit_res.get("success"):
            if submit_res.get("error") == "CLAIM_EXPIRED" or submit_raw.status_code == 410:
                claim.delete()
                return _error("CLAIM_EXPIRED", "The claim expired — prepare again.", status.HTTP_410_GONE)
            # Leave the PendingClaim to expire on its own so a quick retry
            # keeps the same edition reservation.
            return _error("MINT_FAILED", submit_res.get("error") or "Mint failed on service side.", status.HTTP_502_BAD_GATEWAY)

        edition = claim.edition
        post, collection = _finalize_collect(
            request.user, claim.post_id, edition, submit_res.get("assetId"), submit_res.get("signature")
        )
        _after_collect(request.user, post, edition)

        return Response({
            "success": True,
            "edition": edition,
            "assetId": collection.asset_id,
            "signature": collection.signature,
        }, status=status.HTTP_200_OK)
