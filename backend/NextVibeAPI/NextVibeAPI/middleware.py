import time
from django.utils.timezone import now
from django.utils.deprecation import MiddlewareMixin

class RequestTimingMiddleware(MiddlewareMixin):
    """
    Add request time
    """
    def process_request(self, request):
        request._start_time = time.time()

    def process_response(self, request, response):
        start_time = getattr(request, "_start_time", time.time())
        duration = time.time() - start_time
        timestamp = now().strftime("%d/%b/%Y %H:%M:%S")

        method = request.method
        path = request.get_full_path()
        status = response.status_code
        if hasattr(response, 'content'):
            size = len(response.content)
        elif hasattr(response, 'streaming_content'):
            size = 0
        else:
            size = 0

        log_line = f'[{timestamp}] "{method} {path}" {status} {size} ({duration:.2f}s)'
        print(log_line) 

        return response
