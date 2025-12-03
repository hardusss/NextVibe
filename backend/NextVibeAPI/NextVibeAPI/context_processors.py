from user.models import User
from django.utils.timezone import now
from posts.models import Post, Comment, PostReport

def admin_dashboard_metrics(request):
    if request.path.startswith('/admin/'):
        online_users = User.objects.filter(is_online=True).count()  
        today_registrations = User.objects.filter(created_at__date=now().date()).count()
        posts_today = Post.objects.filter(create_at__date=now().date()).count()
        post_reports_today = PostReport.objects.filter(created_at__date=now().date()).count()
        total_users_banned = User.all_objects.filter(is_baned=True).count()
        comments_today = Comment.objects.filter(create_at__date=now().date()).count()
        return {
            'online_users_count': online_users,
            'today_registrations': today_registrations,
            'posts_today': posts_today,
            "post_reports_today": post_reports_today,
            'comments_today': comments_today,
            "total_users_banned": total_users_banned
        }
    return {}
