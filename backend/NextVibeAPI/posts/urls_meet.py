from django.urls import path

from .view_pac.meet_share import MeetCardView, MeetView

# /api/v1/meet/… — Proof of Meet (nextvibe.io/u/meet/<slug>), public
urlpatterns = [
    path("<str:slug>/card.png", MeetCardView.as_view(), name="meet_card"),
    path("<str:slug>", MeetView.as_view(), name="meet"),
    path("<str:slug>/", MeetView.as_view(), name="meet_slash"),
]
