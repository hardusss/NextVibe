from rest_framework import viewsets
from ..models import Post
from ..serializers_pac import PostSerializer
from rest_framework.permissions import IsAuthenticated
from rest_framework.decorators import action
from rest_framework.response import Response
from django.contrib.auth import get_user_model
from rest_framework.throttling import ScopedRateThrottle
from ..tasks import send_post_for_moderation
import h3

User = get_user_model()

class PostViewSet(viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "post" 
    queryset = Post.objects.all()
    serializer_class = PostSerializer

    def perform_create(self, serializer):
        is_v2 = self.request.query_params.get("v2") == "true"

        extra_data = {
            "owner": self.request.user
        }

        lat = None
        lng = None

        # Extract lat/lng if coords are provided in the payload
        coords = self.request.data.get("coords")
        if coords:
            try:
                lat = float(coords.get("lat"))
                lng = float(coords.get("lng"))
            except (ValueError, TypeError, AttributeError):
                pass

        if is_v2:
            resolution = self.request.data.get("resolution")
            if lat is not None and lng is not None and resolution:
                try:
                    h3_index = h3.latlng_to_cell(
                        lat=lat,
                        lng=lng,
                        res=int(resolution)
                    )
                    extra_data["h3_geo"] = h3_index
                except Exception as ex:
                    print("H3 error:", ex)

        # Save post first to obtain an ID
        post = serializer.save(**extra_data)

        # Event post reputation mechanic:
        # Check if the user is checked into any active events
        from django.utils import timezone
        from ..models import EventCheckin, Reputation
        
        now = timezone.now()
        
        # Query active check-ins (event must be currently active and check-in must exist)
        active_checkins = EventCheckin.objects.filter(
            user=self.request.user,
            post__is_luma_event=True,
            post__luma_event_start_time__lte=now,
            post__luma_event_end_time__gte=now
        ).select_related('post')

        # If active check-ins exist and we have coordinates for the new post
        if active_checkins.exists() and lat is not None and lng is not None:
            for checkin in active_checkins:
                event = checkin.post
                if event.h3_geo:
                    try:
                        event_res = h3.get_resolution(event.h3_geo)
                        post_cell_at_event_res = h3.latlng_to_cell(lat, lng, event_res)
                        
                        # Verify geolocation: post cell is same or adjacent to the event cell (grid distance <= 2 for GPS margin)
                        if h3.grid_distance(post_cell_at_event_res, event.h3_geo) <= 2:
                            rep_points = 10
                            
                            # Mark post as created during the event and store reputation earned
                            post.on_event = event
                            post.reputation_earned = rep_points
                            post.save(update_fields=['on_event', 'reputation_earned'])
                            
                            # Create a reputation entry
                            Reputation.objects.create(
                                user=self.request.user,
                                given_by=event.owner,
                                points=rep_points,
                                is_checkin=False,
                                event=event,
                                h3_geo=post.h3_geo or event.h3_geo,
                                post=post,
                                post_type="event_post"
                            )
                            # Reward for the first matching event only
                            break
                    except Exception as e:
                        print("Error verifying event geolocation for post:", e)

    @action(detail=True, methods=['post'], url_path='finalize')
    def finalize_creation(self, request, pk=None):
        """
        Client call. when post and all medias uploaded.
        Once start moderation.
        """
        post = self.get_object()
        
        # Check rules
        if post.owner != request.user:
            return Response(
                {"error": "Not your post"}, 
                status=status.HTTP_403_FORBIDDEN
            )

        # Update status
        post.moderation_status = "pending"
        post.save(update_fields=['moderation_status'])
        
        # Start Celery task
        print(f"🚀 Finalize called for post {post.id}. Triggering moderation task.")
        send_post_for_moderation.delay(post.id)
        
        return Response({
            "status": "moderation_started",
            "message": "Post submitted for review"
        })