from django.urls import path, include
from .view_pac import PostMenuView, LikePostView, PostViewSet
from .view_pac import (
    CommentCreateView, CommentReplyView,
    GetCommentView, AddMediaToPostView,
    GenerateImage
    )
from rest_framework.routers import DefaultRouter

router = DefaultRouter()
router.register(r'posts', PostViewSet)

urlpatterns = [
    path('', include(router.urls)),
    path("add-media/", AddMediaToPostView.as_view(), name="add_media"),
    path('posts-menu/<int:id>/', PostMenuView.as_view(), name='posts_menu'),
    path("post-like/<int:id>/<int:post_id>/", LikePostView.as_view(), name="post_like"),
    path("comment-create/", CommentCreateView.as_view(), name="comment_create"),
    path("comment-reply/<int:comment_id>/", CommentReplyView.as_view(), name="comment_reply"),
    path("get-comments/<int:post_id>/", GetCommentView.as_view(), name="get_comments"),
    path("generate-image/", GenerateImage.as_view(), name="generate_image"),
]
