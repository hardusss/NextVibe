from rest_framework.response import Response
from django.contrib.auth import get_user_model
from .models import Chat, Message
from rest_framework.permissions import IsAuthenticated
from rest_framework.views import APIView
import logging
from django.db.models import Count

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
                        "is_online": other_user.is_online
                    },
                    "sort_date": last_message.created_at if last_message else None
                })
            
            chat_data.sort(
                    key=lambda x: x["sort_date"].timestamp() if x["sort_date"] else 0,
                    reverse=True
                )


            for chat in chat_data:
                chat.pop("sort_date", None)

            return Response(chat_data)
        except Exception as e:
            logger.error(f"Error in ChatsView: {str(e)}")
            return Response({'error': str(e)}, status=500)

class OnlineUsersView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        following_ids = request.user.follow_for
        online_users = User.objects.filter(
            is_online=True,
            user_id__in=following_ids  
        )

        users_data = [{
            'user_id': user.user_id,
            'username': user.username,
            'avatar': user.avatar.url if user.avatar else None
        } for user in online_users]

        return Response(users_data)



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
            
            
            existing_chat = Chat.objects.annotate(
                num_participants=Count('participants')
            ).filter(num_participants=len(participants))
            for chat in existing_chat:
                chat_participants = set(chat.participants.values_list('user_id', flat=True))
                if chat_participants == set(participants.values_list('user_id', flat=True)):
                    return Response({'error': 'Chat already exists', "existing_chat_id": chat.id}, status=400)

            chat = Chat.objects.create()
            chat.participants.set(participants)
            chat.save()
            
            return Response({'chat_id': chat.id}, status=200)
        except Exception as e:
            logger.error(f"Error in CreateChatView: {str(e)}")
            return Response({'error': str(e)}, status=500)

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
                    },

                    "sort_date": last_message.created_at if last_message else None
                })

            chat_data.sort(
                key=lambda x: x["sort_date"].timestamp() if x["sort_date"] else 0,
                reverse=True
            )


            for chat in chat_data:
                chat.pop("sort_date", None)

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
            return Response({'error': 'Chat not found'}, status=404)