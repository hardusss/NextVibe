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

            # We will always map to the default room for the embed app
            default_room_id = '68a27a2f-f26b-4a84-b8d6-55be5cb86122'
            response_data = {
                'token': token,
                'roomId': default_room_id
            }

            # Exchange the embedToken for a user sessionToken
            try:
                auth_payload = {
                    "embedToken": token,
                    "parentOrigin": "https://nextvibe.io"
                }
                r_auth = requests.post(
                    "https://chat.cherry.fun/api/embed/auth",
                    headers={"Content-Type": "application/json"},
                    json=auth_payload,
                    timeout=5
                )
                if r_auth.status_code == 201:
                    session_token = r_auth.json().get("data", {}).get("token")
                    if session_token:
                        response_data['sessionToken'] = session_token
                else:
                    logger.warning(f"Failed to fetch sessionToken: {r_auth.status_code} - {r_auth.text}")
            except Exception as auth_err:
                logger.error(f"Error fetching sessionToken: {str(auth_err)}")

            if chat_id:
                try:
                    chat = Chat.objects.get(id=chat_id, participants=request.user)
                    if chat.cherry_room_id != default_room_id:
                        chat.cherry_room_id = default_room_id
                        chat.save()
                    
                    # Auto-add the participants to the room members
                    participants = list(chat.participants.all())
                    wallets_to_add = [p.wallet_address for p in participants if p.wallet_address]
                    if wallets_to_add and project_key:
                        headers = {
                            'Authorization': f'Bearer {project_key}',
                            'Content-Type': 'application/json'
                        }
                        invite_url = f"https://api.cherry.fun/api/v1/apps/groups/{default_room_id}/members"
                        invite_payload = {
                            "wallets": wallets_to_add,
                            "autoAccept": True
                        }
                        try:
                            requests.post(invite_url, json=invite_payload, headers=headers, timeout=5)
                        except Exception:
                            pass
                except Chat.DoesNotExist:
                    logger.warning(f"Chat {chat_id} not found for user {request.user.username}")
                except Exception as e:
                    logger.error(f"Error updating Cherry room for chat {chat_id}: {str(e)}")

            return Response(response_data, status=200)
        except Exception as e:
            logger.error(f"Error in CherryEmbedTokenView: {str(e)}")
            return Response({'error': str(e)}, status=500)


class CherryRoomMessagesView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, room_id):
        import requests
        import json
        from django.conf import settings

        try:
            # 1. Resolve Chat object
            chat = None
            chat_id_param = request.GET.get('chatId')
            if chat_id_param:
                try:
                    chat = Chat.objects.filter(id=int(chat_id_param), participants=request.user).first()
                except (ValueError, TypeError):
                    pass
            
            if not chat:
                if room_id.isdigit():
                    chat = Chat.objects.filter(id=int(room_id), participants=request.user).first()
                else:
                    chat = Chat.objects.filter(cherry_room_id=room_id, participants=request.user).first()

            if not chat:
                return Response({'error': 'You do not have permission to view this chat room'}, status=403)

            # 2. Get API credentials
            app_secret = getattr(settings, 'CHERRY_APP_SECRET', None)
            project_key = getattr(settings, 'CHERRY_PROJECT_KEY', None)

            if project_key:
                project_key = project_key.strip().strip("'\"")
            if app_secret:
                app_secret = app_secret.strip().strip("'\"")

            auth_token = project_key if project_key else app_secret
            if not auth_token:
                logger.error("Cherry credentials not configured in settings.")
                return Response({'error': 'Cherry API credentials not configured'}, status=500)

            # 3. Call Cherry API using the shared room ID
            cherry_room_id = chat.cherry_room_id if chat.cherry_room_id else '68a27a2f-f26b-4a84-b8d6-55be5cb86122'
            url = f"https://api.cherry.fun/api/v1/apps/groups/{cherry_room_id}/messages"
            
            params = {}
            if 'cursor' in request.GET:
                params['cursor'] = request.GET['cursor']
            
            # Fetch a larger limit because we'll be filtering messages by chatId
            params['limit'] = 100

            resp = requests.get(url, headers={'Authorization': f'Bearer {auth_token}', 'Content-Type': 'application/json'}, params=params, timeout=10)
            if resp.status_code != 200:
                logger.error(f"Cherry API GET messages failed: {resp.status_code} - {resp.text}")
                return Response({'error': f'Failed to fetch messages: {resp.text}'}, status=resp.status_code)

            cherry_data = resp.json()
            messages_list = cherry_data.get('messages', [])

            parsed_messages = []
            for msg in messages_list:
                msg_id = msg.get('id')
                content = msg.get('content', '')
                
                created_at_raw = msg.get('createdAt') or msg.get('created_at')
                created_at = created_at_raw
                if isinstance(created_at_raw, dict) and '_seconds' in created_at_raw:
                    import datetime
                    try:
                        dt = datetime.datetime.fromtimestamp(created_at_raw['_seconds'], tz=datetime.timezone.utc)
                        created_at = dt.isoformat()
                    except Exception:
                        pass
                elif isinstance(created_at_raw, (int, float)):
                    import datetime
                    try:
                        dt = datetime.datetime.fromtimestamp(created_at_raw, tz=datetime.timezone.utc)
                        created_at = dt.isoformat()
                    except Exception:
                        pass

                parsed_text = content
                sender_id = None
                sender_username = "System"
                sender_wallet = None
                msg_chat_id = None

                # Check if content is our custom JSON payload
                try:
                    data = json.loads(content)
                    if isinstance(data, dict):
                        parsed_text = data.get('text', '')
                        sender_id = data.get('sender_id')
                        sender_username = data.get('username', 'User')
                        sender_wallet = data.get('sender_wallet')
                        msg_chat_id = data.get('chat_id')
                except (json.JSONDecodeError, TypeError, ValueError):
                    pass

                # Filter by local chat ID
                if msg_chat_id == chat.id:
                    parsed_messages.append({
                        'id': msg_id,
                        'text': parsed_text,
                        'created_at': created_at,
                        'sender': {
                            'user_id': sender_id,
                            'username': sender_username,
                            'wallet_address': sender_wallet
                        }
                    })

            return Response({
                'messages': parsed_messages,
                'next_cursor': cherry_data.get('nextCursor')
            })

        except Exception as e:
            logger.error(f"Error in CherryRoomMessagesView GET: {str(e)}")
            return Response({'error': str(e)}, status=500)

    def post(self, request, room_id):
        import requests
        import json
        import jwt
        import uuid
        import time
        from django.conf import settings

        try:
            # 1. Resolve Chat object
            chat = None
            chat_id_param = request.data.get('chatId')
            if chat_id_param:
                try:
                    chat = Chat.objects.filter(id=int(chat_id_param), participants=request.user).first()
                except (ValueError, TypeError):
                    pass

            if not chat:
                if room_id.isdigit():
                    chat = Chat.objects.filter(id=int(room_id), participants=request.user).first()
                else:
                    chat = Chat.objects.filter(cherry_room_id=room_id, participants=request.user).first()

            if not chat:
                return Response({'error': 'You do not have permission to post to this chat room'}, status=403)

            text = request.data.get('text')
            if not text:
                return Response({'error': 'Message text is required'}, status=400)

            # 2. Get API credentials
            app_id = getattr(settings, 'CHERRY_APP_ID', '16e14376-0fce-4536-8891-754fd8fb5748')
            app_secret = getattr(settings, 'CHERRY_APP_SECRET', None)
            
            if app_secret:
                app_secret = app_secret.strip().strip("'\"")
            if app_id:
                app_id = app_id.strip().strip("'\"")

            if not app_secret or not request.user.wallet_address:
                return Response({'error': 'Cherry configuration error or missing user wallet'}, status=500)

            # 3. Generate embedToken (JWT) for the user
            now_ts = int(time.time())
            payload_jwt = {
                'sub': request.user.wallet_address,
                'app_id': app_id,
                'iat': now_ts,
                'exp': now_ts + 300,
                'jti': str(uuid.uuid4())
            }
            embed_token = jwt.encode(payload_jwt, app_secret, algorithm='HS256')
            if isinstance(embed_token, bytes):
                embed_token = embed_token.decode('utf-8')

            # 4. Exchange for sessionToken
            auth_payload = {
                "embedToken": embed_token,
                "parentOrigin": "https://nextvibe.io"
            }
            r_auth = requests.post(
                "https://chat.cherry.fun/api/embed/auth",
                headers={"Content-Type": "application/json"},
                json=auth_payload,
                timeout=5
            )
            if r_auth.status_code != 201:
                logger.error(f"Cherry auth exchange failed: {r_auth.status_code} - {r_auth.text}")
                return Response({'error': 'Authentication with Cherry failed'}, status=401)

            session_token = r_auth.json().get("data", {}).get("token")
            if not session_token:
                return Response({'error': 'Failed to obtain session token'}, status=500)

            # 5. Build the JSON content payload to identify the sender and the chat ID
            payload_content = {
                'text': text,
                'sender_id': request.user.user_id,
                'username': request.user.username,
                'sender_wallet': request.user.wallet_address,
                'chat_id': chat.id
            }

            # 6. Call Cherry API to send message using sessionToken and Origin header
            headers = {
                'Authorization': f'Bearer {session_token}',
                'Content-Type': 'application/json',
                'Origin': 'https://embed.cherry.fun',
                'Referer': 'https://embed.cherry.fun/'
            }
            cherry_room_id = chat.cherry_room_id if chat.cherry_room_id else '68a27a2f-f26b-4a84-b8d6-55be5cb86122'
            url = "https://chat.cherry.fun/api/messages/send"
            payload = {
                'roomId': cherry_room_id,
                'content': json.dumps(payload_content),
                'encrypted': False,
                'legacy': False
            }

            resp = requests.post(url, headers=headers, json=payload, timeout=10)
            if resp.status_code not in (200, 201):
                logger.error(f"Cherry API POST message failed: {resp.status_code} - {resp.text}")
                return Response({'error': f'Failed to send message: {resp.text}'}, status=resp.status_code)

            cherry_resp = resp.json().get('data', {})

            # 7. Also write it locally to the Django database
            try:
                Message.objects.create(
                    chat=chat,
                    sender=request.user,
                    text=text
                )
            except Exception as db_err:
                logger.error(f"Error saving message locally: {db_err}")

            return Response({
                'id': cherry_resp.get('id'),
                'text': text,
                'created_at': cherry_resp.get('createdAt') or cherry_resp.get('created_at'),
                'sender': {
                    'user_id': request.user.user_id,
                    'username': request.user.username,
                    'wallet_address': request.user.wallet_address
                }
            }, status=201)

        except Exception as e:
            logger.error(f"Error in CherryRoomMessagesView POST: {str(e)}")
            return Response({'error': str(e)}, status=500)


