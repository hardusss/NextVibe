from exponent_server_sdk import (
    PushClient,
    PushMessage,
)

from typing import Optional

def send(token: str, title: str, body: str, link: Optional[str] = None):
    data = {"url": link} if link else None
    response = PushClient().publish(
        PushMessage(
            to=token,
            title=title,
            body=body,
            data=data,
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
