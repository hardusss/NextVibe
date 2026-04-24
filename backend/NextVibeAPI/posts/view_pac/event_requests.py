from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from django.shortcuts import get_object_or_404
from ..models import Post, EventRequest
from user.models import Notification
from django.db import IntegrityError

class EventRequestCreateView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, post_id):
        post = get_object_or_404(Post, id=post_id, is_luma_event=True)
        
        if post.owner == request.user:
            return Response({"error": "Cannot request your own event"}, status=status.HTTP_400_BAD_REQUEST)
            
        try:
            event_request, created = EventRequest.objects.get_or_create(
                user=request.user,
                post=post,
                defaults={'status': EventRequest.Status.PENDING}
            )
            if created:
                Notification.objects.create(
                    sender=request.user,
                    recipient=post.owner,
                    notification_type='event_request',
                    post=post,
                    text_preview=f"{request.user.username} requested to attend your event"
                )
            return Response({"status": event_request.status}, status=status.HTTP_201_CREATED if created else status.HTTP_200_OK)
        except IntegrityError:
            return Response({"error": "Already requested"}, status=status.HTTP_400_BAD_REQUEST)

class EventRequestListView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        requests = EventRequest.objects.filter(post__owner=request.user).select_related('user', 'post')
        
        data = []
        for req in requests:
            data.append({
                "id": req.id,
                "post_id": req.post.id,
                "post_about": req.post.about,
                "user_id": req.user.user_id,
                "username": req.user.username,
                "avatar": req.user.avatar.url if req.user.avatar and getattr(req.user.avatar, 'name', None) else None,
                "status": req.status,
                "created_at": req.created_at
            })
            
        return Response(data, status=status.HTTP_200_OK)

class EventRequestActionView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, request_id):
        action = request.data.get('action')
        if action not in ['approve', 'reject']:
            return Response({"error": "Invalid action"}, status=status.HTTP_400_BAD_REQUEST)
            
        event_request = get_object_or_404(EventRequest, id=request_id, post__owner=request.user)
        
        if action == 'approve':
            event_request.status = EventRequest.Status.APPROVED
            text_preview = f"Your request for event was approved!"
        else:
            event_request.status = EventRequest.Status.REJECTED
            text_preview = f"Your request for event was denied"
            
        event_request.save(update_fields=['status'])
        
        Notification.objects.create(
            sender=request.user,
            recipient=event_request.user,
            notification_type='event_request_status',
            post=event_request.post,
            text_preview=text_preview
        )
        
        return Response({"status": event_request.status}, status=status.HTTP_200_OK)


class EventAttendeesView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, post_id):
        post = get_object_or_404(Post, id=post_id, is_luma_event=True)

        # Only owner can see attendees
        if post.owner != request.user:
            return Response({"error": "Not authorized"}, status=status.HTTP_403_FORBIDDEN)

        approved = EventRequest.objects.filter(
            post=post, status=EventRequest.Status.APPROVED
        ).select_related('user')

        data = [
            {
                "user_id": req.user.user_id,
                "username": req.user.username,
                "avatar": req.user.avatar.url if req.user.avatar and getattr(req.user.avatar, 'name', None) else None,
                "created_at": req.created_at,
            }
            for req in approved
        ]
        return Response({"count": len(data), "attendees": data}, status=status.HTTP_200_OK)
