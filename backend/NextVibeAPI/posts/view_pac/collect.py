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

import logging
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


logger = logging.getLogger("posts.collect")


def _error(code, message, http_status, *, user=None, post_id=None, **extra):
    logger.info(
        "collect.rejected code=%s status=%s user=%s post=%s",
        code, http_status, getattr(user, "pk", None), post_id,
    )
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
    logger.info(
        "collect.finalized user=%s post=%s edition=%s asset=%s minted_count=%s",
        user.pk, post.id, edition, asset_id, post.minted_count,
    )
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
        logger.info(
            "collect.rep_bonus user=%s post=%s points=%s given_by=%s",
            user.pk, post.id, COLLECT_IRL_REP_BONUS, post.owner_id,
        )

    push_token = getattr(post.owner, "expo_push_token", None)
    if push_token:
        try:
            send(
                token=push_token,
                title="Your post was collected",
                body=f"{user.username or 'Someone'} collected edition {edition}/{total} of your post.",
            )
            logger.info("collect.push_sent post=%s author=%s edition=%s", post.id, post.owner_id, edition)
        except Exception:
            logger.warning("collect.push_failed post=%s author=%s", post.id, post.owner_id, exc_info=True)
    else:
        logger.info("collect.push_skipped post=%s author=%s reason=no_token", post.id, post.owner_id)


class CollectPrepareView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request) -> Response:
        post_id = request.data.get("postId")
        signer = request.data.get("signer", "mwa")

        # MWA only exists on Android. If an iOS client still asks for the MWA
        # path (older builds selected the signer from wallet state), downgrade
        # to the backend-signed mint instead of handing out a transaction the
        # client can never sign.
        platform = (request.headers.get("X-Client-Platform") or "").lower()
        if signer == "mwa" and platform and platform != "android":
            logger.warning(
                "collect.prepare.signer_downgraded user=%s post=%s platform=%s",
                request.user.pk, post_id, platform,
            )
            signer = "none"

        logger.info("collect.prepare user=%s post=%s signer=%s platform=%s",
                    request.user.pk, post_id, signer, platform or "unknown")
        if not post_id:
            return _error("POST_NOT_FOUND", "Missing postId.", status.HTTP_404_NOT_FOUND,
                          user=request.user)

        post = Post.objects.select_related("owner", "on_event").filter(id=post_id).first()
        if not post or not post.is_approved or post.is_hide:
            return _error("POST_NOT_FOUND", "Post not found.", status.HTTP_404_NOT_FOUND,
                          user=request.user, post_id=post_id)

        if not request.user.wallet_address:
            return _error("WALLET_REQUIRED", "Connect a wallet to collect.", status.HTTP_400_BAD_REQUEST,
                          user=request.user, post_id=post_id)

        if post.owner == request.user:
            return _error("OWNER_USE_PUBLISH", "Owners publish their post instead of collecting it.", status.HTTP_400_BAD_REQUEST,
                          user=request.user, post_id=post_id)

        if UserCollection.objects.filter(user=request.user, post=post).exists():
            return _error("ALREADY_CLAIMED", "You already collected this post.", status.HTTP_409_CONFLICT,
                          user=request.user, post_id=post_id)

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
                user=request.user, post_id=post_id,
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
                return _error("SOLD_OUT", "All editions are gone.", status.HTTP_410_GONE,
                              user=request.user, post_id=post_id)

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
                    user=request.user, post_id=post_id,
                )

            claim = PendingClaim.objects.create(
                user=request.user,
                post=locked,
                edition=next_edition,
                expires_at=now + timedelta(seconds=COLLECT_CLAIM_TTL_SECONDS),
            )

        logger.info(
            "collect.prepare.reserved user=%s post=%s edition=%s claim=%s pending=%s",
            request.user.pk, post.id, next_edition, claim.claim_id, pending + 1,
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
                logger.error("collect.prepare.mint_service_unreachable user=%s post=%s edition=%s",
                             request.user.pk, post.id, next_edition, exc_info=True)
                claim.delete()
                return _error("MINT_FAILED", "Mint service connection error.", status.HTTP_502_BAD_GATEWAY,
                              user=request.user, post_id=post_id)

            if not mint_res.get("success"):
                logger.error("collect.prepare.mint_service_error user=%s post=%s edition=%s error=%s",
                             request.user.pk, post.id, next_edition, mint_res.get("error"))
                claim.delete()
                return _error("MINT_FAILED", mint_res.get("error") or "Mint failed on service side.", status.HTTP_502_BAD_GATEWAY,
                              user=request.user, post_id=post_id)

            finalized_post, _ = _finalize_collect(
                request.user, post.id, next_edition, mint_res.get("assetId"), mint_res.get("signature")
            )
            _after_collect(request.user, finalized_post, next_edition)
            logger.info("collect.prepare.none_path_done user=%s post=%s edition=%s",
                        request.user.pk, post.id, next_edition)
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
            logger.error("collect.prepare.service_unreachable user=%s post=%s edition=%s",
                         request.user.pk, post.id, next_edition, exc_info=True)
            claim.delete()
            return _error("MINT_FAILED", "Mint service connection error.", status.HTTP_502_BAD_GATEWAY,
                          user=request.user, post_id=post_id)

        if not prep_res.get("success"):
            logger.error("collect.prepare.service_error user=%s post=%s edition=%s error=%s",
                         request.user.pk, post.id, next_edition, prep_res.get("error"))
            claim.delete()
            return _error("MINT_FAILED", prep_res.get("error") or "Could not prepare the transaction.", status.HTTP_502_BAD_GATEWAY,
                          user=request.user, post_id=post_id)

        claim.message_hash = prep_res["messageHash"]
        claim.tx_base64 = prep_res["transaction"]
        claim.expires_at = timezone.now() + timedelta(seconds=COLLECT_CLAIM_TTL_SECONDS)
        claim.save(update_fields=["message_hash", "tx_base64", "expires_at"])

        logger.info(
            "collect.prepare.ready user=%s post=%s edition=%s claim=%s hash=%s expires=%s memo=%r",
            request.user.pk, post.id, next_edition, claim.claim_id,
            claim.message_hash, claim.expires_at.isoformat(), memo,
        )
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
        logger.info("collect.submit user=%s claim=%s", request.user.pk, claim_id)
        if not claim_id or not signed_tx:
            return _error("CLAIM_NOT_FOUND", "Missing claimId or signedTransaction.", status.HTTP_404_NOT_FOUND,
                          user=request.user)

        claim = (
            PendingClaim.objects
            .select_related("post", "post__owner", "post__on_event")
            .filter(claim_id=claim_id, user=request.user)
            .first()
        )
        if not claim:
            return _error("CLAIM_NOT_FOUND", "Claim not found.", status.HTTP_404_NOT_FOUND,
                          user=request.user)

        if claim.expires_at < timezone.now():
            logger.info(
                "collect.submit.expired user=%s post=%s edition=%s claim=%s expired_at=%s",
                request.user.pk, claim.post_id, claim.edition, claim.claim_id,
                claim.expires_at.isoformat(),
            )
            claim.delete()
            return _error("CLAIM_EXPIRED", "The claim expired — prepare again.", status.HTTP_410_GONE,
                          user=request.user, post_id=claim.post_id)

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
            logger.error("collect.submit.service_unreachable user=%s post=%s edition=%s claim=%s",
                         request.user.pk, claim.post_id, claim.edition, claim.claim_id, exc_info=True)
            return _error("MINT_FAILED", "Mint service connection error.", status.HTTP_502_BAD_GATEWAY,
                          user=request.user, post_id=claim.post_id)

        if not submit_res.get("success"):
            if submit_res.get("error") == "CLAIM_EXPIRED" or submit_raw.status_code == 410:
                logger.info("collect.submit.blockhash_expired user=%s post=%s edition=%s claim=%s",
                            request.user.pk, claim.post_id, claim.edition, claim.claim_id)
                claim.delete()
                return _error("CLAIM_EXPIRED", "The claim expired — prepare again.", status.HTTP_410_GONE,
                              user=request.user, post_id=claim.post_id)
            # Leave the PendingClaim to expire on its own so a quick retry
            # keeps the same edition reservation.
            logger.error("collect.submit.service_error user=%s post=%s edition=%s claim=%s http=%s error=%s",
                         request.user.pk, claim.post_id, claim.edition, claim.claim_id,
                         submit_raw.status_code, submit_res.get("error"))
            return _error("MINT_FAILED", submit_res.get("error") or "Mint failed on service side.", status.HTTP_502_BAD_GATEWAY,
                          user=request.user, post_id=claim.post_id)

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
