from django.contrib import admin
from .models import Post, PostsMedia, PostReport, Comment, CommentReply
from django.contrib import admin
from user.models import User

@admin.register(Post)
class PostAdmin(admin.ModelAdmin):
    def get_queryset(self, request):
        return Post.all_objects.all()
    
    def formfield_for_foreignkey(self, db_field, request, **kwargs):
        # For showing field owner even user is baned
        if db_field.name == "owner":
            kwargs["queryset"] = User.all_objects.all()
        return super().formfield_for_foreignkey(db_field, request, **kwargs)

admin.site.register(PostsMedia)
admin.site.register(PostReport)

@admin.register(Comment)
class CommentAdmin(admin.ModelAdmin):
    def get_queryset(self, request):
        return Comment.all_objects.all()
    
    def formfield_for_foreignkey(self, db_field, request, **kwargs):
        # For showing field owner even user is baned
        if db_field.name == "owner":
            kwargs["queryset"] = User.all_objects.all()
        return super().formfield_for_foreignkey(db_field, request, **kwargs)
    
@admin.register(CommentReply)
class ReplyAdmin(admin.ModelAdmin):
    def get_queryset(self, request):
        return CommentReply.all_objects.all()
    
    def formfield_for_foreignkey(self, db_field, request, **kwargs):
        # For showing field owner even user is baned
        if db_field.name == "owner":
            kwargs["queryset"] = User.all_objects.all()
        return super().formfield_for_foreignkey(db_field, request, **kwargs)

