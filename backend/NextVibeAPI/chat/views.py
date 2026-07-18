from rest_framework.response import Response
from django.contrib.auth import get_user_model
from .models import Chat, Message
from rest_framework.permissions import IsAuthenticated
from rest_framework.views import APIView
import logging
from django.db.models import Count
from rest_framework.throttling import ScopedRateThrottle

logger = logging.getLogger(__name__)

User = get_user_model()

class ChatListView(APIView):
    permission_classes = [IsAuthenticated]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "chats_list"
    def get(self, request):
        try:
            user = request.user
            chats = Chat.objects.filter(participants=user)
            
            chat_data = []
            for chat in chats:
                other_user = chat.participants.exclude(user_id=user.user_id).first()
                if not other_user:
                    continue
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
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "online_users"

    def get(self, request):
        following_ids = request.user.follow_for
        online_users = User.objects.filter(
            is_online=True,
            user_id__in=following_ids  
        ).exclude(user_id=request.user.user_id)

        users_data = [{
            'user_id': user.user_id,
            'username': user.username,
            'avatar': user.avatar.url if user.avatar else None
        } for user in online_users]

        return Response(users_data)



class CreateChatView(APIView):
    permission_classes = [IsAuthenticated]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "chat"
    
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
                    return Response({'chat_id': chat.id, 'message': 'Chat already exists'}, status=200)

            chat = Chat.objects.create()
            chat.participants.set(participants)
            chat.save()
            
            return Response({'chat_id': chat.id}, status=200)
        except Exception as e:
            logger.error(f"Error in CreateChatView: {str(e)}")
            return Response({'error': str(e)}, status=500)


class DeleteChatView(APIView):
    permission_classes = [IsAuthenticated]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "delete_chat"
    
    def delete(self, request, chat_id):
        try:
            try: 
                users_in_chat = list(Chat.objects.filter(id=chat_id).select_related("participants").values_list("participants__user_id", flat=True))
                if int(request.user.user_id) not in users_in_chat:
                    return Response({
                        "error": "You cannot delete a chat if you are not a member of it"
                    }, status=403)
            except Chat.DoesNotExist:
                return Response({'error': 'Chat not found'}, status=404)
            chat = Chat.objects.get(id=chat_id, participants=request.user)
            chat.delete()
            return Response({'message': 'Chat deleted successfully'}, status=200)
        except Chat.DoesNotExist:
            return Response({'error': 'Chat not found'}, status=404)

class CherryEmbedTokenView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        import jwt
        import uuid
        import datetime
        import requests
        from django.conf import settings

        try:
            wallet_address = request.data.get('walletAddress')
            chat_id = request.data.get('chatId')
            if not wallet_address:
                return Response({'error': 'walletAddress is required'}, status=400)

            # Authenticate: only issue a token for the logged-in user's wallet
            user_wallet = request.user.wallet_address
            if not user_wallet or user_wallet.lower() != wallet_address.lower():
                return Response({'error': 'Unauthorized wallet address'}, status=403)

            app_id = getattr(settings, 'CHERRY_APP_ID', '16e14376-0fce-4536-8891-754fd8fb5748')
            app_secret = getattr(settings, 'CHERRY_APP_SECRET', None)

            if not app_secret:
                logger.error("CHERRY_APP_SECRET is not configured on the backend settings.")
                return Response({'error': 'Server configuration error'}, status=500)

            now = datetime.datetime.utcnow()
            payload = {
                'sub': wallet_address,
                'app_id': app_id,
                'exp': now + datetime.timedelta(minutes=5),
                'jti': str(uuid.uuid4())
            }
            token = jwt.encode(payload, app_secret, algorithm='HS256')

            if isinstance(token, bytes):
                token = token.decode('utf-8')

            response_data = {'token': token}

            # If chatId is provided, retrieve or create the Cherry room ID
            if chat_id:
                try:
                    chat = Chat.objects.get(id=chat_id, participants=request.user)
                    
                    # If cherry_room_id doesn't exist, create it via Cherry API
                    if not chat.cherry_room_id:
                        participants = list(chat.participants.all())
                        owner_wallet = request.user.wallet_address
                        if not owner_wallet:
                            owner_wallet = 'OwnerSolanaWallet1111111111111111'
                        
                        members = [p.wallet_address for p in participants if p.wallet_address]
                        if owner_wallet not in members:
                            members.append(owner_wallet)
                            
                        # Call Cherry API
                        headers = {
                            'Authorization': f'Bearer {app_secret}',
                            'Content-Type': 'application/json'
                        }
                        payload_cherry = {
                            'ownerWallet': owner_wallet,
                            'title': f'Chat {chat.id}',
                            'description': 'NextVibe direct chat room',
                            'initialMembers': members
                        }
                        
                        resp = requests.post(
                            'https://chat.cherry.fun/api/sdk/groups',
                            json=payload_cherry,
                            headers=headers,
                            timeout=10
                        )
                        
                        if resp.status_code in (200, 201):
                            resp_data = resp.json()
                            chat.cherry_room_id = resp_data.get('roomId')
                            chat.save()
                            logger.info(f"Created Cherry chat room {chat.cherry_room_id} for Chat {chat.id}")
                        else:
                            logger.error(f"Cherry group creation failed: {resp.status_code} - {resp.text}")
                    
                    if chat.cherry_room_id:
                        response_data['roomId'] = chat.cherry_room_id
                except Chat.DoesNotExist:
                    return Response({'error': 'Chat not found or access denied'}, status=404)
                except Exception as e:
                    logger.error(f"Error handling Cherry room creation/retrieval: {str(e)}")

            return Response(response_data, status=200)
        except Exception as e:
            logger.error(f"Error in CherryEmbedTokenView: {str(e)}")
            return Response({'error': str(e)}, status=500)

