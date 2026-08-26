from decimal import Decimal

from rest_framework import serializers

from finance.models import Expense, ShopProfile


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


class ShopProfileSerializer(serializers.ModelSerializer):
    class Meta:
        model = ShopProfile
        fields = ["business_name", "tin", "po_box", "phone", "email", "address"]
        read_only_fields = fields
