from django.contrib import admin
from django.urls import path, include
from django.conf import settings
from django.conf.urls.static import static
from chat.views_cherry import CherryEmbedTokenView, CherryMembersView, CherryMuteView, CherryWebhookView
from user.views_pac.optout import email_optout, push_optout
from nvcli.webhook import resend_webhook

urlpatterns = [
    path('admin/', admin.site.urls),
    path('api/v1/users/', include('user.urls')),
    path('api/v1/posts/', include('posts.urls')),
    path('api/v1/wallets/', include('wallet.urls')),
    path('api/v1/chat/', include('chat.urls')),
    path('api/chat/', include('chat.urls')),
    # nv campaign unsubscribe links (signed user id; see user/views_pac/optout.py)
    path('u/e/<str:token>', email_optout, name='nv_email_optout'),
    path('u/p/<str:token>', push_optout, name='nv_push_optout'),
    # Resend email events for nv campaigns (Svix-signed; see nvcli/webhook.py)
    path('api/v1/nv/resend-webhook/', resend_webhook, name='nv_resend_webhook'),
    path('api/v1/nv/resend-webhook', resend_webhook, name='nv_resend_webhook_no_slash'),
    path('api/cherry-embed-token', CherryEmbedTokenView.as_view(), name='cherry-embed-token-root'),
    path('api/cherry-embed-token/', CherryEmbedTokenView.as_view(), name='cherry-embed-token-root-slash'),
    path('api/v1/cherry-embed-token', CherryEmbedTokenView.as_view(), name='cherry-embed-token-v1-root'),
    path('api/v1/cherry-embed-token/', CherryEmbedTokenView.as_view(), name='cherry-embed-token-v1-root-slash'),
    path('api/cherry-members', CherryMembersView.as_view(), name='cherry-members-root'),
    path('api/cherry-members/', CherryMembersView.as_view(), name='cherry-members-root-slash'),
    path('api/v1/cherry-members', CherryMembersView.as_view(), name='cherry-members-v1-root'),
    path('api/v1/cherry-members/', CherryMembersView.as_view(), name='cherry-members-v1-root-slash'),
    path('api/cherry-mute', CherryMuteView.as_view(), name='cherry-mute-root'),
    path('api/cherry-mute/', CherryMuteView.as_view(), name='cherry-mute-root-slash'),
    path('api/v1/cherry-mute', CherryMuteView.as_view(), name='cherry-mute-v1-root'),
    path('api/v1/cherry-mute/', CherryMuteView.as_view(), name='cherry-mute-v1-root-slash'),
    path('api/cherry-webhook', CherryWebhookView.as_view(), name='cherry-webhook-root'),
    path('api/cherry-webhook/', CherryWebhookView.as_view(), name='cherry-webhook-root-slash'),
    path('api/v1/cherry-webhook', CherryWebhookView.as_view(), name='cherry-webhook-v1-root'),
    path('api/v1/cherry-webhook/', CherryWebhookView.as_view(), name='cherry-webhook-v1-root-slash'),
] + static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)

handler500 = 'NextVibeAPI.exceptions.handler500_json'


