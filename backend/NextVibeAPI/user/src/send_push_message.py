from exponent_server_sdk import (
    DeviceNotRegisteredError,
    PushClient,
    PushMessage,
    PushServerError,
    PushTicketError,
)
from dotenv import load_dotenv
import os, requests

load_dotenv()

session = requests.Session()

session.headers.update(
    {
        "Authorization": f"Bearer {os.getenv('EXPO_TOKEN')}",
        "accept": "application/json",
        "accept-encoding": "gzip, deflate",
        "content-type": "application/json",
    }
)


def send(token: str, title: str, body: str):
    response = PushClient().publish(
        PushMessage(
            to=token,
            title=title,
            body=body,
            data=None,
            sound=None,
            ttl=None,
            expiration=None,
            priority=None,
            badge=None,
            category=None,
            display_in_foreground=None,
            channel_id=None,
            subtitle=None,
            mutable_content=None
        )
    )
    print(response)