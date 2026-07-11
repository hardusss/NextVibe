import jwt
import requests
from jwt.algorithms import RSAAlgorithm


APPLE_KEYS_URL = "https://appleid.apple.com/auth/keys"
APPLE_ISSUER = "https://appleid.apple.com"


def _fetch_apple_public_keys():
    """Fetch Apple's current public keys for JWT verification."""
    try:
        resp = requests.get(APPLE_KEYS_URL, timeout=5)
        resp.raise_for_status()
        return resp.json().get("keys", [])
    except Exception:
        return []


def validate(identity_token: str, bundle_id: str = None):
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
            return None

        # Fetch Apple's public keys
        apple_keys = _fetch_apple_public_keys()
        if not apple_keys:
            return None

        # Find the matching key
        matching_key = None
        for key in apple_keys:
            if key.get("kid") == kid:
                matching_key = key
                break

        if not matching_key:
            return None

        # Convert JWK to PEM
        public_key = RSAAlgorithm.from_jwk(matching_key)

        # Decode and verify the token
        decode_options = {
            "verify_exp": True,
            "verify_iss": True,
            "verify_aud": bundle_id is not None,
        }

        payload = jwt.decode(
            identity_token,
            key=public_key,
            algorithms=["RS256"],
            issuer=APPLE_ISSUER,
            audience=bundle_id,
            options=decode_options,
        )

        return payload

    except jwt.ExpiredSignatureError:
        return None
    except jwt.InvalidTokenError:
        return None
    except Exception:
        return None
