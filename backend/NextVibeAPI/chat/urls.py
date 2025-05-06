from django.urls import path
from .views import ChatListView, OnlineUsersView, MessagesView, MediaUploadView, CreateChatView, DeleteChatView

urlpatterns = [
    path('chats/', ChatListView.as_view(), name='chat-list'),
    path('online-users/', OnlineUsersView.as_view(), name='online-users'),
    path('messages/<int:chat_id>/', MessagesView.as_view(), name='messages'),
    path('upload-media/', MediaUploadView.as_view(), name='upload-media'),
    path('create-chat/', CreateChatView.as_view(), name='create-chat'),
    path('delete-chat/<int:chat_id>/', DeleteChatView.as_view(), name='delete-chat')
]
