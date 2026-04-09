from django.urls import path, include
from .view_pac import PostMenuView, LikePostView, PostViewSet, LikeCommentView
from .view_pac import (
    CommentCreateView, CommentReplyView,
    GetCommentView, AddMediaToPostView,
    GenerateImage, RecomendationsView,
    ModerationCallbackView, RecommendationFeedView,
    DeletePostView, SendReportForPostView,
    GetGenerationImageStatusView, GetPostView,
    PostMetadataView, CollectionMetadataView,
    MintNftView, UserCollectionView
    )
from rest_framework.routers import DefaultRouter

router = DefaultRouter()
router.register(r'posts', PostViewSet)

urlpatterns = [
    path('', include(router.urls)),
    path("add-media/", AddMediaToPostView.as_view(), name="add_media"),
    path('posts-menu/<int:id>/', PostMenuView.as_view(), name='posts_menu'),
    path("post-like/<int:id>/<int:post_id>/", LikePostView.as_view(), name="post_like"),
    path("comment-like/<int:comment_id>/", LikeCommentView.as_view(), name="comment_like"),
    path("comment-create/", CommentCreateView.as_view(), name="comment_create"),
    path("comment-reply/<int:comment_id>/", CommentReplyView.as_view(), name="comment_reply"),
    path("get-comments/<int:post_id>/", GetCommentView.as_view(), name="get_comments"),
    path("generate-image/", GenerateImage.as_view(), name="generate_image"),
    path("generate-image/status/", GetGenerationImageStatusView.as_view(), name="generate_image_status"),
    path("recomendations/", RecomendationsView.as_view(), name="recomendations"),
    path("moderation-callback/", ModerationCallbackView.as_view(), name="moderation_callback"),
    path("delete-post/", DeletePostView.as_view(), name="delete_post"),
    path("report-post/", SendReportForPostView.as_view(), name="report_post"),
    path("recommendation-feed/", RecommendationFeedView.as_view(), name="recommendation-feed"),
    path("get-post/", GetPostView.as_view(), name="get_post"),
    path('<int:post_id>/metadata/<int:edition>/', PostMetadataView.as_view(), name='post_metadata'),
    path("collection/metadata/", CollectionMetadataView.as_view(), name="metadata"),
    path("cnft-mint/", MintNftView.as_view(), name="mint_cnft"),
    path("collections-menu/<int:id>/", UserCollectionView.as_view(), name="collections_menu"),
]


