from django.urls import path
from .views_pac import (
                            RegisterUserView, LoginUserView,
                            GoogleRegisterView,
                            UserDetailView, RecommendedUsersView,
                            FollowView, SearchUsersView,
                            HistorySearchView, TwoFAView,
                            UpdateUserText, UpdateUserAvatar,
                            UpdatePassword, GetReaders,
                            GetFollows, GetCountUnreadNotificationsView,
                            GetNotificationsView, ReadNotificationsView,
                            CheckStatusView, SavePushTokenView
                        )
from rest_framework_simplejwt.views import (
    TokenObtainPairView,
    TokenRefreshView,
)

urlpatterns = [
    path('token/', TokenObtainPairView.as_view(), name='token_obtain_pair'),
    path('token/refresh/', TokenRefreshView.as_view(), name='token_refresh'),
    path("register/", RegisterUserView.as_view(), name='register_user'),
    path("login/", LoginUserView.as_view(), name='login_user'),
    path("google-sign-in/", GoogleRegisterView.as_view(), name="google_sing_in"),
    path("user-detail/<int:id>/", UserDetailView.as_view(), name="user-detail"),
    path("recommendations/<int:id>/", RecommendedUsersView.as_view(), name="recommendations_profiles"),
    path("follow/<int:follow_id>/", FollowView.as_view(), name="follow"),
    path("search/", SearchUsersView.as_view(), name="search"),
    path("history/", HistorySearchView.as_view(), name="history"),
    path("2fa/", TwoFAView.as_view(), name="2fa"),
    path("update/user-text/", UpdateUserText.as_view(), name="update_user_text"),
    path("update/user-avatar/", UpdateUserAvatar.as_view(), name="update_user_avatar"),
    path("reset-password/", UpdatePassword.as_view(), name="reset_password"),
    path("get-readers/", GetReaders.as_view(), name="get_readers"),
    path("get-follows/", GetFollows.as_view(), name="get_follows"),
    path("count-unread-notifications/", GetCountUnreadNotificationsView.as_view(), name="count_unread_notifications"),
    path("notifications/", GetNotificationsView.as_view(), name="notifications"),
    path("read-notifications/", ReadNotificationsView.as_view(), name="read_notifications"),
    path("check-status/", CheckStatusView.as_view(), name="check_status"),
    path("save-push-token/", SavePushTokenView.as_view(), name="token_push_save")
]
