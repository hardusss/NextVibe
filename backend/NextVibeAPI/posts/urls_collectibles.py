from django.urls import path

from .view_pac.collectibles import (
    CollectibleClaimAllView, CollectibleClaimView, CollectibleDetailView, CollectibleListView,
    CollectibleSummaryView, NotificationSettingsView,
)


def _both(route, view, name):
    """The route with and without a trailing slash."""
    return [path(route, view, name=name), path(f"{route}/", view, name=f"{name}_slash")]


# /api/v1/… — wallet-optional collectibles (posts/src/collectibles.py)
urlpatterns = [
    *_both("collectibles/claim-all", CollectibleClaimAllView.as_view(), "collectibles_claim_all"),
    *_both("collectibles/<int:pk>/claim", CollectibleClaimView.as_view(), "collectible_claim"),
    *_both("collectibles/<int:pk>", CollectibleDetailView.as_view(), "collectible_detail"),
    *_both("me/collectibles/summary", CollectibleSummaryView.as_view(), "collectibles_summary"),
    *_both("me/notification-settings", NotificationSettingsView.as_view(), "notification_settings"),
    # `path:` so a username with a slash still resolves (like seeker-share)
    *_both("users/<path:username>/collectibles", CollectibleListView.as_view(), "user_collectibles"),
]
