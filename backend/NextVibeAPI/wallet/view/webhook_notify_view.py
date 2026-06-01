import logging
from rest_framework.views import APIView
from rest_framework.response import Response
from django.conf import settings
from user.models import User, Notification

logger = logging.getLogger(__name__)

class WebhookNotifyView(APIView):
    authentication_classes = []
    permission_classes = []

    def post(self, request):
        # Validate internal secret
        secret = request.headers.get("x-internal-secret")
        if not secret or secret != settings.INDEXER_INTERNAL_SECRET:
            return Response({"error": "Unauthorized"}, status=401)

        wallet_address = request.data.get("address")
        title = request.data.get("title", "New transaction received")

        if not wallet_address:
            return Response({"error": "Missing address"}, status=400)

        try:
            user = User.objects.get(wallet_address=wallet_address)
            
            # Create a notification for the user
            Notification.objects.create(
                recipient=user,
                notification_type="revived_transaction", # Misspelled in model, keeping consistent
                text_preview=title
            )
            
            logger.info(f"Created transaction push notification for user {user.username}")
            return Response({"status": "ok"})
            
        except User.DoesNotExist:
            logger.info(f"Received webhook notify for unknown wallet: {wallet_address}")
            return Response({"status": "ignored", "reason": "user not found"})
        except Exception as e:
            logger.error(f"Error creating webhook notification: {str(e)}")
            return Response({"error": "Internal server error"}, status=500)
