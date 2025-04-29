from rest_framework.response import Response
from django.contrib.auth import get_user_model
from .models import Chat, Message
from rest_framework.permissions import IsAuthenticated
from rest_framework.views import APIView
import logging

logger = logging.getLogger(__name__)

User = get_user_model()

class ChatListView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        try:
            user = request.user
            chats = Chat.objects.filter(participants=user)
            
            chat_data = []
            for chat in chats:
                last_message = Message.objects.filter(chat=chat).order_by('-created_at').first()
                other_participant = chat.participants.exclude(user_id=user.user_id).first()
                
                if other_participant:
                    chat_data.append({
                        'chat_id': chat.id,
                        'other_user': {
                            'user_id': other_participant.user_id,
                            'username': other_participant.username,
                            'avatar': other_participant.avatar.url if other_participant.avatar else None,
                            'is_online': other_participant.is_active
                        },
                        'last_message': {
                            'content': last_message.text if last_message else None,
                            'created_at': last_message.created_at.isoformat() if last_message else None,
                        }
                    })
            
            return Response(chat_data)
        except Exception as e:
            logger.error(f"Error in ChatListView: {str(e)}")
            return Response({'error': str(e)}, status=500)

class OnlineUsersView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        following_ids = request.user.follow_for
        online_users = User.objects.filter(
            is_active=True,
            user_id__in=following_ids  
        )

        users_data = [{
            'user_id': user.user_id,
            'username': user.username,
            'avatar': user.avatar.url if user.avatar else None
        } for user in online_users]

        return Response(users_data)


class MessagesView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, chat_id):
        try:
            chat = Chat.objects.get(id=chat_id, participants=request.user)
            messages = Message.objects.filter(chat=chat).order_by('-created_at')[:50]
            data = [{
                'message_id': msg.id,
                'content': msg.text,
                'sender_id': msg.sender.user_id,
                'created_at': msg.created_at.isoformat()
            } for msg in messages]
            return Response(data)
        except Chat.DoesNotExist:
            return Response({'error': 'Chat not found'}, status=404)

    def post(self, request, chat_id):
        try:
            chat = Chat.objects.get(id=chat_id, participants=request.user)
            message = Message.objects.create(
                chat=chat,
                sender=request.user,
                text=request.data.get('content')
            )
            return Response({
                'id': message.id,
                'content': message.text,
                'sender_id': message.sender.user_id,
                'created_at': message.created_at
            })
        except Chat.DoesNotExist:
            return Response({'error': 'Chat not found'}, status=404)
