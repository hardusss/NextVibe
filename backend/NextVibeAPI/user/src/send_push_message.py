from exponent_server_sdk import (
    PushClient,
    PushMessage,
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