from rest_framework import serializers


class TokensPriceSerializer(serializers.Serializer):
    tokens = serializers.ListField(
        child=serializers.CharField(),
        allow_empty=False
    )
    currency = serializers.CharField(default="usd")
