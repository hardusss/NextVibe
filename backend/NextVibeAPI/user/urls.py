from django.urls import path
from .views_pac import (
                            RegisterUserView, LoginUserView,
                            GoogleRegisterView, GoogleLoginUserView,
                            UserDetailView, RecommendedUsersView,
                            FollowView, SearchUsersView,
                            HistorySearchView, TwoFAView,
                            UpdateUserText, UpdateUserAvatar,
                            UpdatePassword
                        )


urlpatterns = [
    path('register/', RegisterUserView.as_view(), name='register_user'),
    path('login/', LoginUserView.as_view(), name='login_user'),
    path("google-register/", GoogleRegisterView.as_view(), name="google_register"),
    path("google-login/", GoogleLoginUserView.as_view(), name="google_login"),
    path("user-detail/<int:id>/", UserDetailView.as_view(), name="user-detail"),
    path("recommendations/<int:id>/", RecommendedUsersView.as_view(), name="recommendations_profiles"),
    path("follow/<int:id>/<int:follow_id>/", FollowView.as_view(), name="follow"),
    path("search/", SearchUsersView.as_view(), name="search"),
    path("history/", HistorySearchView.as_view(), name="history"),
    path("2fa/", TwoFAView.as_view(), name="2fa"),
    path("update/user-text/", UpdateUserText.as_view(), name="update_user_text"),
    path("update/user-avatar/", UpdateUserAvatar.as_view(), name="update_user_avatar"),
    path("reset-password/", UpdatePassword.as_view(), name="reset_password"),
]
