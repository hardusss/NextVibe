import jwt, os
from dotenv import load_dotenv
from typing import TypedDict, Literal


# Classes for response
class AuthSuccess(TypedDict):
    auth: Literal[True]
    status: Literal[200]
    detail: str
    user_id: int


class AuthFail(TypedDict):
    auth: Literal[False]
    status: Literal[401]
    detail: str

AuthResponse = AuthSuccess | AuthFail

# load .env
load_dotenv()

# get data from .env
SECRET_KEY = os.getenv("JWT_SECRET_KEY")
ALGORITHM = os.getenv("JWT_ALGORITHM", "HS256")

# Check secret
if not SECRET_KEY:
    raise Exception("JWT_SECRET_KEY is missing in .env")


def auth_jwt(token: str) -> AuthResponse:
    """
    Check user authentication by JWT (SimpleJWT compatible)
    """

    # remove bearer if exists
    if token.startswith("Bearer "):
        token = token.split(" ")[1]

    try:
        payload = jwt.decode(
            token,
            SECRET_KEY,
            algorithms=[ALGORITHM],  # must be list
        )

        return {
            "auth": True,
            "status": 200,
            "detail": "Auth success",
            "user_id": payload.get("user_id"),  # useful
            "token_type": payload.get("token_type"),
        }
    
    except jwt.ExpiredSignatureError:
        return {
            "auth": False,
            "status": 401,
            "detail": "Token expired"
        }
    except jwt.InvalidTokenError:
        return {
            "auth": False,
            "status": 401,
            "detail": "Invalid token"
        }
    