import os
import sys
import argparse
import django

# Setup Django environment
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "NextVibeAPI.settings")
django.setup()

from django.contrib.auth import get_user_model
from django.core.mail import send_mail
from django.db.models import Q
from user.models import Notification
from user.src.send_push_message import send

User = get_user_model()


def broadcast_og_cnft_announcement(test_mode=True):
    """
    Broadcast 1: OG cNFT & Mythic Frame Pending Announcement
    Sends via Email, Push Notification (navigates to Profile page), and In-App Notification.
    Test mode targets 'nxv'. Prod mode targets all users.
    """
    title = "🎁 OG cNFT Pending!"
    body = "🎁 Your OG cNFT is pending! Claim your Mythic Frame before the max supply is gone."
    link = "/(tabs)/profile"

    if test_mode:
        users = User.objects.filter(username="nxv")
    else:
        users = User.objects.all()

    print(f"\n==========================================")
    print(f"[Broadcast 1] OG cNFT Announcement (Test Mode: {test_mode})")
    print(f"Target count: {users.count()}")
    print(f"==========================================")

    for user in users:
        print(f"\n -> Processing User: {user.username} (ID: {user.user_id})")

        # 1. Email delivery
        if user.email:
            try:
                send_mail(
                    subject=title,
                    message=body,
                    from_email="noreply@nextvibe.app",
                    recipient_list=[user.email],
                    fail_silently=True,
                )
                print(f"    ✅ [Email] Sent to {user.email}")
            except Exception as e:
                print(f"    ❌ [Email] Failed: {e}")
        else:
            print("    ⚠️ [Email] Skipped (No email address).")

        # 2. Expo Push Notification (navigates to Profile page)
        if user.expo_push_token:
            try:
                send(
                    token=user.expo_push_token,
                    title=title,
                    body=body,
                    link=link
                )
                print(f"    ✅ [Push] Sent to token {user.expo_push_token} with link='{link}'")
            except Exception as e:
                print(f"    ❌ [Push] Failed: {e}")
        else:
            print("    ⚠️ [Push] Skipped (No push token).")

        # 3. In-App Notification
        try:
            Notification.objects.create(
                sender=None,
                recipient=user,
                notification_type="event_announcement",
                text_preview=body
            )
            print(f"    ✅ [In-App] Notification created.")
        except Exception as e:
            print(f"    ❌ [In-App] Failed: {e}")


def broadcast_link_email_announcement(test_mode=True):
    """
    Broadcast 2: Prompt Wallet-only users without email to link email for +20 Reputation.
    Sends via Push Notification (navigates to Settings page) and In-App Notification.
    Test mode targets 'vibe_B8KkPq.lzr'. Prod mode targets all wallet users without email.
    """
    title = "🚀 Link Email & Claim Reputation!"
    body = "Link your email address in settings to earn +20 Reputation & secure your account!"
    link = "/settings"

    if test_mode:
        users = User.objects.filter(username="vibe_B8KkPq.lzr")
    else:
        users = User.objects.filter(wallet_address__isnull=False).filter(
            Q(email__isnull=True) | Q(email="")
        )

    print(f"\n==========================================")
    print(f"[Broadcast 2] Link Email Announcement (Test Mode: {test_mode})")
    print(f"Target count: {users.count()}")
    print(f"==========================================")

    for user in users:
        print(f"\n -> Processing User: {user.username} (ID: {user.user_id})")

        # 1. Expo Push Notification (navigates to Settings page)
        if user.expo_push_token:
            try:
                send(
                    token=user.expo_push_token,
                    title=title,
                    body=body,
                    link=link
                )
                print(f"    ✅ [Push] Sent to token {user.expo_push_token} with link='{link}'")
            except Exception as e:
                print(f"    ❌ [Push] Failed: {e}")
        else:
            print("    ⚠️ [Push] Skipped (No push token).")

        # 2. In-App Notification
        try:
            Notification.objects.create(
                sender=None,
                recipient=user,
                notification_type="event_announcement",
                text_preview=body
            )
            print(f"    ✅ [In-App] Notification created.")
        except Exception as e:
            print(f"    ❌ [In-App] Failed: {e}")


def main():
    parser = argparse.ArgumentParser(description="Broadcast announcements to NextVibe users.")
    parser.add_argument(
        "--prod",
        action="store_true",
        help="Run in production mode (targets all users instead of test accounts nxv and vibe_B8KkPq.lzr)."
    )
    args = parser.parse_args()
    test_mode = not args.prod

    print(f"Starting Broadcast Script... Mode: {'TEST (nxv & vibe_B8KkPq.lzr)' if test_mode else 'PRODUCTION (All Users)'}")

    broadcast_og_cnft_announcement(test_mode=test_mode)
    broadcast_link_email_announcement(test_mode=test_mode)

    print("\n🎉 Broadcast completed successfully!")


if __name__ == "__main__":
    main()
