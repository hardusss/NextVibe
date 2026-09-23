from django.urls import path

from .view_pac.meet_photo import (
    MeetPhotoCancelView, MeetPhotoCaptionView, MeetPhotoDecisionView, MeetPhotoFileView, MeetPhotoHideView,
    MeetPhotoLockView, MeetPhotoSendView, MeetPhotoTakedownView, MeetPhotoView, MyMeetPhotosView,
    PendingMeetPhotosView,
)
from .view_pac.meet_share import FirstTapCardView, MeetCardView, MeetView


def _both(route, view, name):
    """The route with and without a trailing slash."""
    return [path(route, view, name=name), path(f"{route}/", view, name=f"{name}_slash")]


# /api/v1/meet/… — Proof of Meet (nextvibe.io/u/meet/<slug>). Cards and the
# meet JSON are public; photos only answer the two people in the meet.
urlpatterns = [
    path("first-tap/<int:user_id>/card.png", FirstTapCardView.as_view(), name="first_tap_card"),
    *_both("photos/pending", PendingMeetPhotosView.as_view(), "meet_photos_pending"),
    *_both("photos/mine", MyMeetPhotosView.as_view(), "meet_photos_mine"),
    path("photo-file/<str:token>", MeetPhotoFileView.as_view(), name="meet_photo_file"),
    path("<str:slug>/card.png", MeetCardView.as_view(), name="meet_card"),
    *_both("<str:slug>/photo", MeetPhotoView.as_view(), "meet_photo"),
    *_both("<str:slug>/photo/lock", MeetPhotoLockView.as_view(), "meet_photo_lock"),
    *_both("<str:slug>/photo/send", MeetPhotoSendView.as_view(), "meet_photo_send"),
    *_both("<str:slug>/photo/cancel", MeetPhotoCancelView.as_view(), "meet_photo_cancel"),
    *_both("<str:slug>/photo/decision", MeetPhotoDecisionView.as_view(), "meet_photo_decision"),
    *_both("<str:slug>/photo/takedown", MeetPhotoTakedownView.as_view(), "meet_photo_takedown"),
    *_both("<str:slug>/photo/caption", MeetPhotoCaptionView.as_view(), "meet_photo_caption"),
    *_both("<str:slug>/photo/hide", MeetPhotoHideView.as_view(), "meet_photo_hide"),
    path("<str:slug>", MeetView.as_view(), name="meet"),
    path("<str:slug>/", MeetView.as_view(), name="meet_slash"),
]
