"""
Proof of Meet photos: the selfie two people take together at a tap
(posts/src/meet_photos.py has the flow). Every endpoint answers only the two
people in the meet; anyone else, an unknown slug and a blocked pair all get
the same 404.

    GET  /api/v1/meet/<slug>/photo            where it stands (signed URLs, 10 min)
    POST /api/v1/meet/<slug>/photo/lock       become the photographer (3 min)
    POST /api/v1/meet/<slug>/photo            multipart `image`: a photo or a retake
    POST /api/v1/meet/<slug>/photo/send       the draft goes to the other person
    POST /api/v1/meet/<slug>/photo/cancel     the photographer leaves without sending
    POST /api/v1/meet/<slug>/photo/decision   {"approve": bool}, the subject only
    POST /api/v1/meet/<slug>/photo/takedown   either person, any time
    POST /api/v1/meet/<slug>/photo/caption    {"about": str}, either co-author
    POST /api/v1/meet/<slug>/photo/hide       {"hidden": bool}, your own profile only
    GET  /api/v1/meet/photos/pending          photos waiting for your answer
    GET  /api/v1/meet/photos/mine             every photo you're in (Settings)
    GET  /meta/meet/<slug>.json               the cNFT metadata, public
"""
from django.http import HttpResponse
from rest_framework import status
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.throttling import UserRateThrottle
from rest_framework.views import APIView

from posts.src import meet_photos
from posts.src.meet_photo_store import LocalPrivateStore, private_store
from posts.src.meet_photos import MeetPhotoError


class MeetPhotoThrottle(UserRateThrottle):
    scope = "meet_photo"
    rate = "60/min"


class MeetPhotoUploadThrottle(UserRateThrottle):
    """Uploads (a first photo or a retake): 5 an hour per person."""
    scope = "meet_photo_upload"
    rate = "5/hour"


def _error(e: MeetPhotoError) -> Response:
    response = Response({"error": e.message, "code": e.code, **e.extra}, status=e.http)
    response["Cache-Control"] = "no-store"
    return response


def _state(slug, user, code=status.HTTP_200_OK) -> Response:
    response = Response(meet_photos.state(slug, user), status=code)
    response["Cache-Control"] = "private, no-store"
    return response


def _flag(value) -> bool | None:
    if isinstance(value, bool):
        return value
    if isinstance(value, str) and value.lower() in ("true", "false", "1", "0"):
        return value.lower() in ("true", "1")
    return None


class _MeetPhotoAPIView(APIView):
    permission_classes = [IsAuthenticated]
    throttle_classes = [MeetPhotoThrottle]


class MeetPhotoView(_MeetPhotoAPIView):
    parser_classes = [MultiPartParser, FormParser]

    def get_throttles(self):
        if self.request.method == "POST":
            return [MeetPhotoUploadThrottle()]
        return super().get_throttles()

    def get(self, request, slug):
        try:
            return _state(slug, request.user)
        except MeetPhotoError as e:
            return _error(e)

    def post(self, request, slug):
        image = request.FILES.get("image")
        if image is None:
            return Response({"error": "Attach the photo as `image`.", "code": "NO_IMAGE"},
                            status=status.HTTP_400_BAD_REQUEST)
        try:
            meet_photos.upload(slug, request.user, image)
            return _state(slug, request.user, status.HTTP_201_CREATED)
        except MeetPhotoError as e:
            return _error(e)


class MeetPhotoLockView(_MeetPhotoAPIView):
    def post(self, request, slug):
        try:
            meet_photos.acquire_lock(slug, request.user)
            return _state(slug, request.user)
        except MeetPhotoError as e:
            return _error(e)


class MeetPhotoSendView(_MeetPhotoAPIView):
    def post(self, request, slug):
        try:
            meet_photos.send(slug, request.user)
            return _state(slug, request.user)
        except MeetPhotoError as e:
            return _error(e)


class MeetPhotoCancelView(_MeetPhotoAPIView):
    def post(self, request, slug):
        try:
            meet_photos.cancel(slug, request.user)
            return _state(slug, request.user)
        except MeetPhotoError as e:
            return _error(e)


class MeetPhotoDecisionView(_MeetPhotoAPIView):
    parser_classes = [JSONParser, FormParser]

    def post(self, request, slug):
        approve = _flag(request.data.get("approve"))
        if approve is None:
            return Response({"error": "`approve` must be true or false.", "code": "BAD_REQUEST"},
                            status=status.HTTP_400_BAD_REQUEST)
        try:
            meet_photos.decide(slug, request.user, approve)
            return _state(slug, request.user)
        except MeetPhotoError as e:
            return _error(e)


class MeetPhotoTakedownView(_MeetPhotoAPIView):
    def post(self, request, slug):
        try:
            photo = meet_photos.take_down(slug, request.user)
        except MeetPhotoError as e:
            return _error(e)
        # Not the full state: after a block the pair's meet is hidden, but the takedown still counts
        return Response({"slug": slug, "status": photo.status, "id": photo.pk,
                         "taken_down_at": photo.taken_down_at})


class MeetPhotoCaptionView(_MeetPhotoAPIView):
    parser_classes = [JSONParser, FormParser]

    def post(self, request, slug):
        about = request.data.get("about", "")
        if not isinstance(about, str):
            return Response({"error": "`about` must be text.", "code": "BAD_REQUEST"},
                            status=status.HTTP_400_BAD_REQUEST)
        try:
            photo = meet_photos.set_caption(slug, request.user, about)
        except MeetPhotoError as e:
            return _error(e)
        return Response({"slug": slug, "post_id": photo.post_id, "about": about.strip()})


class MeetPhotoHideView(_MeetPhotoAPIView):
    parser_classes = [JSONParser, FormParser]

    def post(self, request, slug):
        hidden = _flag(request.data.get("hidden"))
        if hidden is None:
            return Response({"error": "`hidden` must be true or false.", "code": "BAD_REQUEST"},
                            status=status.HTTP_400_BAD_REQUEST)
        try:
            meet_photos.set_hidden(slug, request.user, hidden)
        except MeetPhotoError as e:
            return _error(e)
        return Response({"slug": slug, "hidden": hidden})


class PendingMeetPhotosView(_MeetPhotoAPIView):
    def get(self, request):
        response = Response({"available": meet_photos.is_available(), "data": meet_photos.pending_for(request.user)})
        response["Cache-Control"] = "private, no-store"
        return response


class MyMeetPhotosView(_MeetPhotoAPIView):
    def get(self, request):
        response = Response({"data": meet_photos.my_photos(request.user)})
        response["Cache-Control"] = "private, no-store"
        return response


class MeetPhotoFileView(APIView):
    """
    GET /api/v1/meet/photo-file/<token>: a private file for a signed URL, only
    when the photos live on disk (local runs, tests). With the R2 bucket, signed
    URLs point at R2 itself and this answers 404.
    """
    permission_classes = [AllowAny]
    authentication_classes = []
    throttle_classes = []

    def get(self, request, token):
        store = private_store()
        key = store.key_for_token(token) if isinstance(store, LocalPrivateStore) else None
        if key is None:
            return HttpResponse(status=404)
        try:
            data = store.get(key)
        except (OSError, ValueError):
            return HttpResponse(status=404)
        response = HttpResponse(data, content_type="image/jpeg")
        response["Cache-Control"] = "private, no-store"
        return response


class MeetMetadataView(APIView):
    """
    GET https://api.nextvibe.io/meta/meet/<slug>.json: what both cNFTs of a
    meet point to. Public and cacheable; 404 until the photo is approved.
    """
    permission_classes = [AllowAny]
    authentication_classes = []
    throttle_classes = []

    def get(self, request, slug):
        data = meet_photos.metadata(slug)
        if data is None:
            response = Response({"error": "Not found"}, status=status.HTTP_404_NOT_FOUND)
            response["Cache-Control"] = "no-store"
            return response
        response = Response(data)
        response["Cache-Control"] = "public, max-age=300"
        response["Access-Control-Allow-Origin"] = "*"
        return response
