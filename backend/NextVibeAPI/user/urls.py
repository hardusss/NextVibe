from django.urls import path
from .views_pac import (
                            RegisterUserView, LoginUserView,
                            GoogleRegisterView, GoogleLoginUserView,
                            UserDetailView, RecommendedUsersView,
                            FollowView
                        )


urlpatterns = [
    path('register/', RegisterUserView.as_view(), name='register_user'),
    path('login/', LoginUserView.as_view(), name='login_user'),
    path("google-register/", GoogleRegisterView.as_view(), name="google_register"),
    path("google-login/", GoogleLoginUserView.as_view(), name="google_login"),
    path("user-detail/<int:id>/", UserDetailView.as_view(), name="user-detail"),
    path("recommendations/<int:user_id>/", RecommendedUsersView.as_view(), name="recommendations_profiles"),
    path("follow/<int:id>/<int:follow_id>/", FollowView.as_view(), name="follow")
]
