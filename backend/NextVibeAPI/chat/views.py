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
        import requests
        from django.conf import settings
        import time

        try:
            # SECURITY: In app-trusted mode, NEVER derive the wallet from the
            # request body — the client cannot be trusted. Use the wallet stored
            # on the authenticated user's profile exclusively.
            chat_id = request.data.get('chatId')
            wallet_address = request.user.wallet_address

            if not wallet_address:
                logger.warning(f"User {request.user.username} has no wallet address linked; cannot issue Cherry embed token.")
                return Response({'error': 'No wallet address linked to your account. Please connect your wallet first.'}, status=400)

            app_id = getattr(settings, 'CHERRY_APP_ID', '16e14376-0fce-4536-8891-754fd8fb5748')
            app_secret = getattr(settings, 'CHERRY_APP_SECRET', None)
            project_key = getattr(settings, 'CHERRY_PROJECT_KEY', None)

            if app_secret:
                app_secret = app_secret.strip().strip("'\"")
            if project_key:
                project_key = project_key.strip().strip("'\"")
            if app_id:
                app_id = app_id.strip().strip("'\"")

            if not app_secret:
                logger.error("CHERRY_APP_SECRET is not configured on the backend settings.")
                return Response({'error': 'Server configuration error'}, status=500)

            now_ts = int(time.time())
            payload = {
                'sub': wallet_address,
                'app_id': app_id,
                'iat': now_ts,
                'exp': now_ts + 300,
                'jti': str(uuid.uuid4())
            }
            token = jwt.encode(payload, app_secret, algorithm='HS256')

            if isinstance(token, bytes):
                token = token.decode('utf-8')

            response_data = {'token': token}

            if chat_id:
                try:
                    chat = Chat.objects.get(id=chat_id, participants=request.user)
                    
                    if not chat.cherry_room_id:
                        owner_wallet = wallet_address
                        participants = list(chat.participants.all())
                        members = [p.wallet_address for p in participants if p.wallet_address]
                        if owner_wallet not in members:
                            members.append(owner_wallet)

                        other_user = chat.participants.exclude(user_id=request.user.user_id).first()
                        chat_title = f"Chat with {other_user.username}" if other_user else f"Chat {chat.id}"

                        if not project_key:
                            logger.warning("CHERRY_PROJECT_KEY is not configured on the backend settings.")
                        auth_token = project_key if project_key else app_secret
                        headers = {
                            'Authorization': f'Bearer {auth_token}',
                            'Content-Type': 'application/json'
                        }
                        payload_cherry = {
                            'ownerWallet': owner_wallet,
                            'title': chat_title,
                            'description': 'NextVibe direct chat room',
                            'initialMembers': members
                        }
                        
                        try:
                            resp = requests.post(
                                'https://api.cherry.fun/api/v1/apps/groups',
                                json=payload_cherry,
                                headers=headers,
                                timeout=10
                            )
                            if resp.status_code in (200, 201):
                                resp_data = resp.json()
                                room_id = resp_data.get('roomId') or resp_data.get('id')
                                if room_id:
                                    chat.cherry_room_id = room_id
                                    chat.save()
                                    logger.info(f"Created Cherry chat room {chat.cherry_room_id} for Chat {chat.id}")
                            else:
                                logger.error(f"Cherry group creation failed: {resp.status_code} - {resp.text}")
                        except Exception as req_err:
                            logger.error(f"Error calling Cherry group API: {str(req_err)}")

                    if chat.cherry_room_id:
                        response_data['roomId'] = chat.cherry_room_id
                        # Dynamic membership sync: make sure all current participants with valid wallet addresses
                        # are active members in the Cherry room.
                        participants = list(chat.participants.all())
                        wallets_to_add = [p.wallet_address for p in participants if p.wallet_address]
                        if wallets_to_add:
                            if not project_key:
                                logger.warning("CHERRY_PROJECT_KEY is not configured on the backend settings.")
                            auth_token = project_key if project_key else app_secret
                            headers = {
                                'Authorization': f'Bearer {auth_token}',
                                'Content-Type': 'application/json'
                            }
                            try:
                                invite_url = f"https://api.cherry.fun/api/v1/apps/groups/{chat.cherry_room_id}/members"
                                invite_payload = {
                                    "wallets": wallets_to_add,
                                    "autoAccept": True
                                }
                                resp = requests.post(invite_url, json=invite_payload, headers=headers, timeout=5)
                                if resp.status_code not in (200, 201):
                                    logger.warning(f"Failed to auto-accept members to existing room {chat.cherry_room_id}: {resp.status_code} - {resp.text}")
                            except Exception as invite_err:
                                logger.error(f"Error checking/adding members to existing room: {str(invite_err)}")
                    else:
                        response_data['roomId'] = '68a27a2f-f26b-4a84-b8d6-55be5cb86122'
                except Chat.DoesNotExist:
                    logger.warning(f"Chat {chat_id} not found for user {request.user.username}")
                    response_data['roomId'] = '68a27a2f-f26b-4a84-b8d6-55be5cb86122'
                except Exception as e:
                    logger.error(f"Error retrieving/creating Cherry room for chat {chat_id}: {str(e)}")
                    response_data['roomId'] = '68a27a2f-f26b-4a84-b8d6-55be5cb86122'
            else:
                response_data['roomId'] = '68a27a2f-f26b-4a84-b8d6-55be5cb86122'

            return Response(response_data, status=200)
        except Exception as e:
            logger.error(f"Error in CherryEmbedTokenView: {str(e)}")
            return Response({'error': str(e)}, status=500)

