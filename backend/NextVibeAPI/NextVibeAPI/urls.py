from django.contrib import admin
from django.urls import path, include
from django.conf import settings
from django.conf.urls.static import static
from chat.views_cherry import CherryEmbedTokenView

urlpatterns = [
    path('admin/', admin.site.urls),
    path('api/v1/users/', include('user.urls')),
    path('api/v1/posts/', include('posts.urls')),
    path('api/v1/wallets/', include('wallet.urls')),
    path('api/v1/chat/', include('chat.urls')),
    path('api/chat/', include('chat.urls')),
    path('api/cherry-embed-token', CherryEmbedTokenView.as_view(), name='cherry-embed-token-root'),
    path('api/cherry-embed-token/', CherryEmbedTokenView.as_view(), name='cherry-embed-token-root-slash'),
    path('api/v1/cherry-embed-token', CherryEmbedTokenView.as_view(), name='cherry-embed-token-v1-root'),
    path('api/v1/cherry-embed-token/', CherryEmbedTokenView.as_view(), name='cherry-embed-token-v1-root-slash'),
] + static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)

