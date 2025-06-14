from rest_framework.response import Response
from django.contrib.auth import get_user_model
from .models import Chat, Message, MediaAttachment
from rest_framework.permissions import IsAuthenticated
from rest_framework.views import APIView
import logging
from rest_framework.parsers import MultiPartParser, FormParser
from django.db.models import Prefetch

logger = logging.getLogger(__name__)

User = get_user_model()

class ChatListView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        try:
            user = request.user
            chats = Chat.objects.filter(participants=user).prefetch_related(
                Prefetch(
                    'messages',
                    queryset=Message.objects.order_by('-created_at'),
                    to_attr='all_messages'
                )
            )
            
            chat_data = []
            for chat in chats:
                # Отримуємо останнє повідомлення
                last_message = chat.all_messages[0] if chat.all_messages else None
                
                # Отримуємо іншого учасника чату
                other_user = chat.participants.exclude(user_id=user.user_id).first()
                
                # Формуємо дані про повідомлення
                message_data = None
                if last_message:
                    # Отримуємо медіа файли для повідомлення
                    media_attachments = MediaAttachment.objects.filter(message=last_message)
                    
                    message_data = {
                        "message_id": last_message.id,
                        "content": last_message.text,
                        "sender_id": last_message.sender_id,
                        "created_at": last_message.created_at,
                        "media": [
                            {
                                "id": media.id,
                                "file_url": media.file.url if media.file else None
                            }
                            for media in media_attachments
                        ]
                    }
                
                unread_count = Message.objects.filter(
                    chat=chat,
                    sender=other_user,
                    is_read=False
                ).count()

                chat_data.append({
                    "chat_id": chat.id,
                    "last_message": message_data,
                    "unread_count": unread_count,
                    "other_user": {
                        "user_id": other_user.user_id,
                        "username": other_user.username,
                        "avatar": other_user.avatar.url if other_user.avatar else None,
                        "official": other_user.official
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
    MESSAGES_PER_PAGE = 6

    def get(self, request, chat_id):
        try:
            last_message_id = request.query_params.get('last_message_id')
            chat = Chat.objects.get(id=chat_id, participants=request.user)
            
            messages_query = Message.objects.filter(chat=chat)
            if last_message_id:
                messages_query = messages_query.filter(id__lt=last_message_id)
            
            messages = messages_query.order_by('-created_at')[:self.MESSAGES_PER_PAGE]
            
            data = [{
                'message_id': msg.id,
                'content': msg.text,
                'sender_id': msg.sender.user_id,
                'created_at': msg.created_at.isoformat(),
                "is_read": msg.is_read,
                'media': [{
                    'id': media.id,
                    'file_url': media.file.url if media.file else None,
                } for media in MediaAttachment.objects.filter(message=msg)]
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

class MediaUploadView(APIView):
    permission_classes = [IsAuthenticated]
    parser_classes = (MultiPartParser, FormParser)

    def post(self, request):
        try:
            chat_id = request.data.get('chat_id')
            files = request.FILES.getlist('files')
            chat = Chat.objects.get(id=chat_id, participants=request.user)
            
            uploaded_media = []
            for file in files:
                media = MediaAttachment.objects.create(
                    file=file
                )
                uploaded_media.append({
                    'id': media.id,
                    'file_url': media.file.url if media.file else None
                })
            
            return Response(uploaded_media, status=200)
        except Chat.DoesNotExist:
            return Response({'error': 'Chat not found'}, status=404)
        except Exception as e:
            return Response({'error': str(e)}, status=500)

class CreateChatView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        try:
            user_ids = request.data.get('user_ids')
            if not user_ids:
                return Response({'error': 'No user IDs provided'}, status=400)
            
            participants = User.objects.filter(user_id__in=user_ids)
            if not participants.exists():
                return Response({'error': 'No valid users found'}, status=404)
            
            chat = Chat.objects.create()
            chat.participants.set(participants)
            chat.save()
            
            return Response({'chat_id': chat.id}, status=201)
        except Exception as e:
            logger.error(f"Error in CreateChatView: {str(e)}")
            return Response({'error': str(e)}, status=500)

class ChatsView(APIView):
    def get(self, request):
        try:
            user = request.user
            chats = Chat.objects.filter(participants=user)
            
            chat_data = []
            for chat in chats:
                other_user = chat.participants.exclude(user_id=user.user_id).first()
                last_message = Message.objects.filter(chat=chat).order_by('-created_at').first()
                
                chat_data.append({
                    "chat_id": chat.id,
                    "last_message": {
                        "content": last_message.text if last_message else None,
                        "created_at": last_message.created_at.isoformat() if last_message else None
                    },
                    "other_user": {
                        "user_id": other_user.user_id,
                        "username": other_user.username,
                        "avatar": other_user.avatar.url if other_user.avatar else None,
                        "is_online": other_user.is_active
                    }
                })
            
            return Response(chat_data)
        except Exception as e:
            logger.error(f"Error in ChatsView: {str(e)}")
            return Response({'error': str(e)}, status=500)
        

class DeleteChatView(APIView):
    permission_classes = [IsAuthenticated]

    def delete(self, request, chat_id):
        try:
            chat = Chat.objects.get(id=chat_id, participants=request.user)
            chat.delete()
            return Response({'message': 'Chat deleted successfully'}, status=200)
        except Chat.DoesNotExist:
            print(f"Chat with ID {chat_id} not found for user {request.user.user_id}")
            return Response({'error': 'Chat not found'}, status=404)