import jwt
import requests
import logging
from jwt.algorithms import RSAAlgorithm

logger = logging.getLogger(__name__)

APPLE_KEYS_URL = "https://appleid.apple.com/auth/keys"
APPLE_ISSUER = "https://appleid.apple.com"
APPLE_BUNDLE_ID = "com.nextvibe.app"


def _fetch_apple_public_keys():
    """Fetch Apple's current public keys for JWT verification."""
    try:
        resp = requests.get(APPLE_KEYS_URL, timeout=5)
        resp.raise_for_status()
        return resp.json().get("keys", [])
    except Exception as e:
        logger.error(f"[Apple] Failed to fetch Apple public keys: {e}")
        return []


def validate(identity_token: str):
    """
    Validate an Apple Sign-In identity token (JWT).

    Returns a dict with at least 'email' and 'sub' (Apple user ID) on success,
    or None on failure.
    """
    try:
        # Decode header to find the key ID
        unverified_header = jwt.get_unverified_header(identity_token)
        kid = unverified_header.get("kid")
        if not kid:
            logger.error("[Apple] Token has no 'kid' in header")
            return None

        logger.info(f"[Apple] Validating token with kid={kid}")

        # Fetch Apple's public keys
        apple_keys = _fetch_apple_public_keys()
        if not apple_keys:
            logger.error("[Apple] Could not fetch Apple public keys")
            return None

        # Find the matching key
        matching_key = None
        available_kids = [k.get("kid") for k in apple_keys]
        for key in apple_keys:
            if key.get("kid") == kid:
                matching_key = key
                break

        if not matching_key:
            logger.error(f"[Apple] No matching key found. Token kid={kid}, available kids={available_kids}")
            return None

        # Convert JWK to PEM
        public_key = RSAAlgorithm.from_jwk(matching_key)

        # Peek at unverified payload for debug info
        try:
            unverified_payload = jwt.decode(
                identity_token,
                options={"verify_signature": False},
                algorithms=["RS256"],
            )
            logger.info(f"[Apple] Token aud={unverified_payload.get('aud')!r}, iss={unverified_payload.get('iss')!r}, sub={unverified_payload.get('sub')!r}")
        except Exception:
            pass

        # Decode and verify the token — always verify audience against our bundle ID
        payload = jwt.decode(
            identity_token,
            key=public_key,
            algorithms=["RS256"],
            issuer=APPLE_ISSUER,
            audience=APPLE_BUNDLE_ID,
            options={
                "verify_exp": True,
                "verify_iss": True,
                "verify_aud": True,
            },
        )

        logger.info(f"[Apple] Token validated successfully for sub={payload.get('sub')!r}")
        return payload

    except jwt.ExpiredSignatureError:
        logger.error("[Apple] Token is expired")
        return None
    except jwt.InvalidAudienceError as e:
        logger.error(f"[Apple] Invalid audience: {e}")
        return None
    except jwt.InvalidIssuerError as e:
        logger.error(f"[Apple] Invalid issuer: {e}")
        return None
    except jwt.InvalidTokenError as e:
        logger.error(f"[Apple] Invalid token: {e}")
        return None
    except Exception as e:
        logger.error(f"[Apple] Unexpected error during token validation: {e}")
        return None
