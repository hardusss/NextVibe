from rest_framework.views import APIView
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.request import Request
from rest_framework import status
from celery.result import AsyncResult


class GetGenerationImageStatusView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request: Request) -> Response:
        task_id: str | None = request.query_params.get("taskId")

        if not task_id:
            return Response(
                {"error": "Task id can't be null"},
                status=status.HTTP_400_BAD_REQUEST
            )

        task_result = AsyncResult(task_id)

        if task_result.state == 'PENDING':
            return Response({"status": "pending"}, status=200)

        elif task_result.state == 'STARTED':
            return Response({"status": "started"}, status=200)

        elif task_result.state == 'FAILURE':
            return Response(
                {"status": "failure", "error": str(task_result.result)},
                status=200
            )

        elif task_result.state == 'SUCCESS':
            return Response(
                {"status": "success", "image_url": task_result.result},
                status=200
            )

        return Response({"status": task_result.state}, status=200)
