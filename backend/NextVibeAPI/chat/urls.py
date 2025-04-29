from django.urls import path
from .views import ChatListView, OnlineUsersView, MessagesView

urlpatterns = [
    path('chats/', ChatListView.as_view(), name='chat-list'),
    path('online-users/', OnlineUsersView.as_view(), name='online-users'),
    path('messages/<int:chat_id>/', MessagesView.as_view(), name='messages'),
]
