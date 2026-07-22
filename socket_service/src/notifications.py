import logging
import asyncio
import urllib.request
import json
from typing import List, Dict, Any, Optional

logger = logging.getLogger("websocket.notifications")

EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send"

def _send_push_sync(payloads: List[Dict[str, Any]]):
    try:
        data_bytes = json.dumps(payloads).encode('utf-8')
        req = urllib.request.Request(
            EXPO_PUSH_URL,
            data=data_bytes,
            headers={
                "Content-Type": "application/json",
                "Accept": "application/json",
                "Accept-Encoding": "gzip, deflate"
            },
            method="POST"
        )
        with urllib.request.urlopen(req, timeout=5) as resp:
            response_data = resp.read().decode('utf-8')
            logger.info(f"📱 Expo push notification sent successfully: {response_data}")
    except Exception as e:
        logger.error(f"❌ Failed to send Expo push notification: {e}")


async def send_chat_push_notification(
    recipient_tokens: List[str],
    sender_name: str,
    message_text: str,
    chat_id: int,
    message_id: Optional[int] = None
):
    """
    Sends Expo Push Notification asynchronously to offline recipients.
    """
    if not recipient_tokens:
        return

    # Prepare body text: mask ciphertext JSON payload if encrypted
    is_encrypted = False
    if message_text and message_text.strip().startswith('{') and '"ciphertext"' in message_text:
        is_encrypted = True
        body = "🔒 New encrypted message"
    else:
        body = message_text if len(message_text) <= 120 else f"{message_text[:117]}..."

    payloads = []
    for token in recipient_tokens:
        if not token or not isinstance(token, str):
            continue
        payloads.append({
            "to": token,
            "title": sender_name or "New Message",
            "body": body,
            "sound": "default",
            "priority": "high",
            "channelId": "chat-messages",
            "data": {
                "type": "chat_message",
                "chat_id": chat_id,
                "message_id": message_id
            }
        })

    if payloads:
        # Run HTTP request in background executor so WebSocket hot-path remains non-blocking
        loop = asyncio.get_event_loop()
        loop.run_in_executor(None, _send_push_sync, payloads)
