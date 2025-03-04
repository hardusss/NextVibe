from django.contrib import admin

from .models import *


admin.site.register(Post)
admin.site.register(PostsMedia)
admin.site.register(Comment)
admin.site.register(CommentReply)
