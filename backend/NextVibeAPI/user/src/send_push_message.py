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
            title="Hello",
            body="Test",
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

if __name__ == "__main__":
    send("ExponentPushToken[bl7yHBE9BfBsDLonlic-Q9]", "Hello from NextVibe", "I love u)")