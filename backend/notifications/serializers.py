from rest_framework import serializers

from notifications.models import NotificationLog


class NotificationLogSerializer(serializers.ModelSerializer):
    class Meta:
        model = NotificationLog
        fields = [
            "notification_id", "type", "recipient", "related_sale",
            "sent_at", "status", "read_at",
        ]
        read_only_fields = fields
