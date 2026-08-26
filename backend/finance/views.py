from rest_framework import viewsets
from rest_framework.generics import RetrieveAPIView
from rest_framework.permissions import IsAuthenticated

from accounts.permissions import IsAdmin
from finance.models import Expense, ShopProfile
from finance.serializers import ExpenseSerializer, ShopProfileSerializer


class ExpenseViewSet(viewsets.ModelViewSet):
    serializer_class = ExpenseSerializer
    permission_classes = [IsAdmin]

    def get_queryset(self):
        queryset = Expense.objects.all().order_by("-expense_date", "-expense_id")
        category = self.request.query_params.get("category")
        if category:
            queryset = queryset.filter(category=category)
        return queryset


class ShopProfileView(RetrieveAPIView):
    serializer_class = ShopProfileSerializer
    permission_classes = [IsAuthenticated]

    def get_object(self):
        obj, _ = ShopProfile.objects.get_or_create(
            pk=1, defaults={"business_name": "Promise Electronic Shop"}
        )
        return obj
