from django.db import models


class NotificationLog(models.Model):
    class NotificationStatus(models.TextChoices):
        SENT = "sent", "Sent"
        FAILED = "failed", "Failed"

    notification_id = models.AutoField(primary_key=True)
    type = models.CharField(max_length=30)
    recipient = models.ForeignKey(
        "accounts.Employee", on_delete=models.PROTECT, related_name="notifications_received"
    )
    related_sale = models.ForeignKey(
        "sales.Sale", on_delete=models.SET_NULL, null=True, blank=True, related_name="notifications"
    )
    sent_at = models.DateTimeField(auto_now_add=True)
    status = models.CharField(
        max_length=20, choices=NotificationStatus.choices, default=NotificationStatus.SENT
    )

    def __str__(self):
        return f"{self.type} -> {self.recipient} ({self.status})"
