import time
import logging
from django.http import JsonResponse
from django.utils.timezone import now
from django.utils.deprecation import MiddlewareMixin

logger = logging.getLogger("NextVibeAPI.middleware")

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


class JsonExceptionMiddleware(MiddlewareMixin):
    """
    Guarantees that any 500 error or uncaught exception on API endpoints
    returns a JSON response instead of Django's default HTML error page.
    """
    def process_exception(self, request, exception):
        path = getattr(request, 'path', '')
        if path.startswith('/api/'):
            logger.error("Unhandled API exception on %s: %s", path, exception, exc_info=True)
            return JsonResponse(
                {
                    "detail": "Server error. Please try again later.",
                    "error": "Server error. Please try again later."
                },
                status=500
            )
        return None

    def process_response(self, request, response):
        path = getattr(request, 'path', '')
        if path.startswith('/api/') and response.status_code >= 500:
            content_type = response.get('Content-Type', '')
            # If response is HTML or contains doctype, transform it into JSON
            if 'text/html' in content_type:
                logger.warning("Converting 500 HTML response on %s to structured JSON", path)
                return JsonResponse(
                    {
                        "detail": "Server error. Please try again later.",
                        "error": "Server error. Please try again later."
                    },
                    status=response.status_code
                )
            # Check raw content if available
            if hasattr(response, 'content') and response.content:
                lowered = response.content[:100].lower()
                if b'<!doctype' in lowered or b'<html' in lowered:
                    logger.warning("Detected raw HTML in 500 response on %s; converting to JSON", path)
                    return JsonResponse(
                        {
                            "detail": "Server error. Please try again later.",
                            "error": "Server error. Please try again later."
                        },
                        status=response.status_code
                    )
        return response
