from decimal import Decimal

from rest_framework import serializers

from finance.models import Expense


class ExpenseSerializer(serializers.ModelSerializer):
    amount = serializers.DecimalField(
        max_digits=12, decimal_places=2, min_value=Decimal("0.01")
    )

    class Meta:
        model = Expense
        fields = [
            "expense_id", "category", "amount", "expense_date",
            "description", "recorded_by",
        ]
        read_only_fields = ["expense_id", "recorded_by"]

    def create(self, validated_data):
        validated_data["recorded_by"] = self.context["request"].user
        return super().create(validated_data)
