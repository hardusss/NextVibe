from django.urls import path
from .view_pac import PostMenuView

urlpatterns = [
    path('posts-menu/<int:id>/', PostMenuView.as_view(), name='posts_menu'),
]
