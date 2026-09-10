import logging

from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView
from rest_framework import status

from user.src.seeker_verification import (
    SgtCheckError,
    check_sgt_onchain,
    grant_seeker_verified,
)

logger = logging.getLogger(__name__)


class SeekerVerifyView(APIView):
    """
    POST /api/v1/users/seeker/verify/

    Manual "Verify Seeker" action from the profile. Runs the on-chain
    Genesis Token check synchronously (bypassing the 24h cache) and
    returns { seekerVerified, source, error }.
    """
    permission_classes = [IsAuthenticated]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "seeker_verify"

    def post(self, request) -> Response:
        user = request.user

        if user.seeker_verified and user.seeker_verified_source == "onchain":
            return Response({"seekerVerified": True, "source": "onchain", "error": None})

        if not user.wallet_address:
            return Response(
                {"seekerVerified": bool(user.seeker_verified), "source": user.seeker_verified_source, "error": "NO_WALLET"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            mint = check_sgt_onchain(user.wallet_address, force=True)
        except SgtCheckError as e:
            logger.warning("seeker.verify user=%s wallet=%s check failed: %s", user.user_id, user.wallet_address, e)
            return Response(
                {"seekerVerified": bool(user.seeker_verified), "source": user.seeker_verified_source, "error": "CHECK_FAILED"},
                status=status.HTTP_502_BAD_GATEWAY,
            )

        if not mint:
            logger.info("seeker.verify user=%s wallet=%s result=none", user.user_id, user.wallet_address)
            # .skr-bootstrapped users keep their badge even without an on-chain hit
            return Response({
                "seekerVerified": bool(user.seeker_verified),
                "source": user.seeker_verified_source,
                "error": None if user.seeker_verified else "SGT_NOT_FOUND",
            })

        granted, error = grant_seeker_verified(user, mint, "onchain")
        logger.info(
            "seeker.verify user=%s wallet=%s result=%s",
            user.user_id, user.wallet_address, mint if granted else (error or "none"),
        )
        if not granted:
            return Response(
                {"seekerVerified": bool(user.seeker_verified), "source": user.seeker_verified_source, "error": error},
                status=status.HTTP_409_CONFLICT,
            )
        return Response({"seekerVerified": True, "source": "onchain", "error": None})
