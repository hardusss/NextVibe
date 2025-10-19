from ..serializers_pac import PostReportSerializer
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from rest_framework.permissions import IsAuthenticated

class SendReportForPostView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request) -> Response:
        if request.data == None:
            return Response({"error": "Data not found, please check your report"}, status=status.HTTP_400_BAD_REQUEST)
        try:
            report_post = PostReportSerializer(data=request.data)
            if report_post.is_valid():
                report_post.save()
                return Response({"data": "Report sent successfully"}, status=status.HTTP_201_CREATED)
            else:
                error_message = report_post.errors.get('non_field_errors', ['Unknown error'])[0]
                if error_message == "The fields post, reporter must make a unique set.":
                    error_message = "you have already sent a report on this post."
                return Response(
                    {"error": f"Uppss... error, please check your report, {error_message}"},
                    status=status.HTTP_400_BAD_REQUEST
                )

        except Exception as ex:
            return Response({"error": f"Upss... error: {str(ex)}"})
