import logging
from django.http import JsonResponse
from rest_framework.views import exception_handler
from rest_framework.response import Response
from rest_framework import status

logger = logging.getLogger("NextVibeAPI.exceptions")

def custom_api_exception_handler(exc, context):
    """
    Custom exception handler for Django REST Framework views.
    Ensures unhandled exceptions (500) return JSON instead of falling through
    to Django's standard HTML error page.
    """
    response = exception_handler(exc, context)

    if response is None:
        view = context.get('view')
        view_name = view.__class__.__name__ if view else 'UnknownView'
        request = context.get('request')
        path = request.path if request else 'UnknownPath'

        logger.error(
            "Unhandled 500 Exception in DRF view %s on %s: %s",
            view_name,
            path,
            exc,
            exc_info=True
        )

        return Response(
            {
                "detail": "Server error. Please try again later.",
                "error": "Server error. Please try again later."
            },
            status=status.HTTP_500_INTERNAL_SERVER_ERROR
        )

    return response

def handler500_json(request, *args, **kwargs):
    """
    Global Django 500 handler that guarantees JSON response for API endpoints.
    """
    logger.error("Global 500 error encountered on %s", getattr(request, 'path', 'Unknown'), exc_info=True)
    return JsonResponse(
        {
            "detail": "Server error. Please try again later.",
            "error": "Server error. Please try again later."
        },
        status=500
    )

