from rest_framework import serializers
from ..models import PostReport

class PostReportSerializer(serializers.ModelSerializer):
    class Meta:
        model = PostReport
        fields = '__all__'