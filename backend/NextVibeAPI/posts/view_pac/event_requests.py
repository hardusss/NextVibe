from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from django.shortcuts import get_object_or_404
from ..models import Post, EventRequest
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
                "user_id": req.user.id,
                "username": req.user.username,
                "avatar": req.user.avatar.url if req.user.avatar else None,
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
        else:
            event_request.status = EventRequest.Status.REJECTED
            
        event_request.save(update_fields=['status'])
        
        return Response({"status": event_request.status}, status=status.HTTP_200_OK)
