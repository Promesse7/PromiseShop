from datetime import timedelta

from django.utils import timezone
from rest_framework.exceptions import ValidationError

VALID_PERIODS = {"today", "week", "month", "year"}


def resolve_period_range(period):
    if period not in VALID_PERIODS:
        raise ValidationError({"period": f"Invalid period: {period!r}. Must be one of {sorted(VALID_PERIODS)}."})

    today = timezone.localdate()

    if period == "today":
        start = today
    elif period == "week":
        start = today - timedelta(days=6)
    elif period == "month":
        start = today.replace(day=1)
    else:
        start = today.replace(month=1, day=1)

    return start, today
