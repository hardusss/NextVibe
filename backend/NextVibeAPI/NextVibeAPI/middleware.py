from django.utils import timezone
from django.contrib.auth import get_user_model

class UserActivityMiddleware:
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        response = self.get_response(request)
        if request.user.is_authenticated:
            get_user_model().objects.filter(user_id=request.user.user_id).update(
                last_activity=timezone.now()
            )
        return response
