from django.urls import path
from .views import ChatListView, OnlineUsersView, CreateChatView, DeleteChatView

urlpatterns = [
    path('chats/', ChatListView.as_view(), name='chat-list'),
    path('online-users/', OnlineUsersView.as_view(), name='online-users'),
    path('create-chat/', CreateChatView.as_view(), name='create-chat'),
    path('delete-chat/<int:chat_id>/', DeleteChatView.as_view(), name='delete-chat')
]
