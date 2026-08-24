from rest_framework import viewsets

from accounts.permissions import IsAdmin
from finance.models import Expense
from finance.serializers import ExpenseSerializer


class ExpenseViewSet(viewsets.ModelViewSet):
    serializer_class = ExpenseSerializer
    permission_classes = [IsAdmin]

    def get_queryset(self):
        queryset = Expense.objects.all().order_by("-expense_date", "-expense_id")
        category = self.request.query_params.get("category")
        if category:
            queryset = queryset.filter(category=category)
        return queryset
