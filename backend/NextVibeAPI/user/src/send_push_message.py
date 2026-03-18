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
            sound="default",         
            ttl=None,
            expiration=None,
            priority="high",       
            badge=None,
            category=None,
            display_in_foreground=True, 
            channel_id=None,         
            subtitle=None,
            mutable_content=None
        )
    )
    print(f"Sent: {body}")