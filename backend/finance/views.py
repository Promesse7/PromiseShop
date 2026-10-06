from datetime import date
from decimal import Decimal

from django.shortcuts import get_object_or_404
from rest_framework import status as http_status
from rest_framework import viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from rest_framework.generics import RetrieveAPIView
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.permissions import IsAdmin, IsAdminOrManager
from finance.models import Expense, Payment, ShopProfile
from finance.serializers import (
    CustomerPaymentInputSerializer, ExpenseSerializer, PaymentSerializer,
    ReversePaymentInputSerializer, ShopProfileSerializer, SupplierPaymentInputSerializer,
)
from finance.services import (
    confirm_purchase_payment_review, customer_aging, customer_balance, record_customer_payment,
    record_supplier_payment, reverse_payment, supplier_aging,
)
from purchasing.models import Purchase


def is_admin_or_manager(user):
    return user.is_authenticated and user.role in (user.Role.ADMIN, user.Role.MANAGER)


def jsonable(value):
    """Decimals as strings (like every serializer in this API), dates as ISO strings."""
    if isinstance(value, Decimal):
        return str(value)
    if isinstance(value, date):
        return value.isoformat()
    if isinstance(value, dict):
        return {k: jsonable(v) for k, v in value.items()}
    if isinstance(value, (list, tuple)):
        return [jsonable(v) for v in value]
    return value


def parse_date_param(request, name):
    raw = request.query_params.get(name)
    if not raw:
        return None
    try:
        return date.fromisoformat(raw)
    except ValueError:
        raise ValidationError({name: f"Invalid date: {raw!r}. Use YYYY-MM-DD."})


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


class PaymentViewSet(viewsets.ReadOnlyModelViewSet):
    """Payment history, plus the actions that record and reverse payments.

    Staff see customer-side payments only (money in at the counter); supplier
    payments are cost information and stay with admin and manager.
    """

    serializer_class = PaymentSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        queryset = Payment.objects.select_related("recorded_by", "sale", "purchase", "reversal")
        if not is_admin_or_manager(self.request.user):
            queryset = queryset.filter(sale__isnull=False)
        params = self.request.query_params
        if params.get("sale"):
            queryset = queryset.filter(sale_id=params["sale"])
        if params.get("purchase"):
            queryset = queryset.filter(purchase_id=params["purchase"])
        if params.get("customer"):
            queryset = queryset.filter(sale__customer_id=params["customer"])
        if params.get("receipt_group"):
            queryset = queryset.filter(receipt_group=params["receipt_group"])
        return queryset.order_by("-paid_at", "-payment_id")

    @action(detail=False, methods=["post"], url_path="customer")
    def customer(self, request):
        serializer = CustomerPaymentInputSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        group, payments = record_customer_payment(
            data["customer"], data["amount"], data["method"], data["reference"], request.user,
            sale_ids=data["sale_ids"] or None, note=data["note"],
        )
        return Response({
            "receipt_group": str(group),
            "customer": data["customer"].pk,
            "amount": str(data["amount"]),
            "balance_after": str(customer_balance(data["customer"])),
            "payments": PaymentSerializer(payments, many=True).data,
        }, status=http_status.HTTP_201_CREATED)

    @action(detail=False, methods=["post"], url_path="supplier", permission_classes=[IsAdminOrManager])
    def supplier(self, request):
        serializer = SupplierPaymentInputSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        payment = record_supplier_payment(
            data["purchase"], data["amount"], data["method"], data["reference"], request.user,
            note=data["note"],
        )
        return Response(PaymentSerializer(payment).data, status=http_status.HTTP_201_CREATED)

    @action(detail=True, methods=["post"], url_path="reverse", permission_classes=[IsAdminOrManager])
    def reverse(self, request, pk=None):
        payment = get_object_or_404(Payment, pk=pk)
        serializer = ReversePaymentInputSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        reversal = reverse_payment(payment, request.user, serializer.validated_data["reason"])
        return Response(PaymentSerializer(reversal).data, status=http_status.HTTP_201_CREATED)


class CustomerDebtsView(APIView):
    permission_classes = [IsAdminOrManager]

    def get(self, request):
        return Response(jsonable(customer_aging(parse_date_param(request, "as_of"))))


class SupplierDebtsView(APIView):
    permission_classes = [IsAdminOrManager]

    def get(self, request):
        return Response(jsonable(supplier_aging(parse_date_param(request, "as_of"))))


class ConfirmPurchasePaymentReviewView(APIView):
    """The owner confirms a migrated purchase's recorded payments are correct."""

    permission_classes = [IsAdminOrManager]

    def post(self, request, purchase_id):
        purchase = get_object_or_404(Purchase, pk=purchase_id)
        confirm_purchase_payment_review(purchase)
        return Response({"purchase_id": purchase.pk, "payment_needs_review": False})
