from django.urls import path
from .views import RegisterUserView, LoginUserView

urlpatterns = [
    path('register/', RegisterUserView.as_view(), name='register_user'),
    path('login/', LoginUserView.as_view(), name='login_user'),
]
