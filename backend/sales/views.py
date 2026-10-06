from decimal import Decimal

from django.db.models import DecimalField, F, Q, Sum, Value
from django.db.models.functions import Coalesce
from rest_framework import viewsets
from rest_framework.permissions import IsAuthenticated
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework import status as http_status
from rest_framework.exceptions import PermissionDenied, ValidationError

from accounts.permissions import IsAdmin, IsAdminOrManager
from finance.services import OPEN_SALE_STATUSES as OPEN_SALE_STATUSES_FOR_BALANCE
from finance.services import customer_statement
from finance.views import is_admin_or_manager, jsonable, parse_date_param

from sales.models import Customer, Sale
from sales.pricing import evaluate_line, max_staff_discount_pct, price_floor
from sales.serializers import CustomerSerializer, CreateSaleSerializer, PriceCheckSerializer, SaleSerializer
from sales.services import _resolve_retail_price, complete_sale, reverse_sale
from stock.services import weighted_average_cost

MONEY = DecimalField(max_digits=14, decimal_places=2)


class CustomerViewSet(viewsets.ModelViewSet):
    serializer_class = CustomerSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        open_sales = Q(sales__status__in=OPEN_SALE_STATUSES_FOR_BALANCE)
        return Customer.objects.annotate(
            open_balance=Coalesce(Sum("sales__total_amount", filter=open_sales), Value(Decimal("0")), output_field=MONEY)
            - Coalesce(Sum("sales__amount_paid", filter=open_sales), Value(Decimal("0")), output_field=MONEY)
        ).order_by("customer_id")

    def get_permissions(self):
        if self.action == "destroy":
            return [IsAdmin()]
        return super().get_permissions()

    def _guard_credit_limit(self):
        # Credit limits are a manager decision; staff may not set or change them.
        if "credit_limit" in self.request.data and not is_admin_or_manager(self.request.user):
            raise PermissionDenied("Only an admin or manager can set a customer's credit limit.")

    def perform_create(self, serializer):
        self._guard_credit_limit()
        serializer.save()

    def perform_update(self, serializer):
        self._guard_credit_limit()
        serializer.save()

    def perform_destroy(self, instance):
        # Sale.customer is SET_NULL, so deleting would silently strip the name off
        # past sales and open debts.
        if instance.sales.exists():
            raise ValidationError(
                "This customer has sales on record and cannot be deleted."
            )
        instance.delete()

    @action(detail=True, methods=["get"], url_path="statement")
    def statement(self, request, pk=None):
        customer = self.get_object()
        statement = customer_statement(
            customer, parse_date_param(request, "from"), parse_date_param(request, "to")
        )
        return Response(jsonable(statement))


class SaleViewSet(viewsets.ModelViewSet):
    http_method_names = ["get", "post", "head", "options"]
    serializer_class = SaleSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        queryset = (
            Sale.objects.all().order_by("-sale_date")
            .select_related("customer", "employee")
            .prefetch_related("items__product", "payments__recorded_by", "payments__reversal")
        )
        customer = self.request.query_params.get("customer")
        if customer:
            queryset = queryset.filter(customer_id=customer)
        payment_status = self.request.query_params.get("payment_status")
        if payment_status:
            queryset = queryset.filter(payment_status=payment_status)
        if self.request.query_params.get("open") == "true":
            queryset = queryset.filter(
                status__in=OPEN_SALE_STATUSES_FOR_BALANCE, amount_paid__lt=F("total_amount")
            )
        return queryset

    def create(self, request, *args, **kwargs):
        input_serializer = CreateSaleSerializer(data=request.data)
        input_serializer.is_valid(raise_exception=True)
        data = input_serializer.validated_data
        payments = data.get("payments")
        sale = complete_sale(
            customer=data.get("customer"),
            employee=request.user,
            payment_method=data.get("payment_method"),
            items=data["items"],
            payments=[dict(p) for p in payments] if payments is not None else None,
            approval=data.get("approval"),
            due_date=data.get("due_date"),
        )
        change_due = sale.change_due
        sale = self.get_queryset().get(pk=sale.pk)
        body = SaleSerializer(sale, context={"request": request}).data
        body["change_due"] = str(change_due)
        return Response(body, status=http_status.HTTP_201_CREATED)

    @action(detail=False, methods=["post"], url_path="price-check")
    def price_check(self, request):
        """Which bargaining rule each cart line falls under, for the till's colours.

        Never returns cost or the floor itself — only the rule and whether the
        line needs a manager's approval or a note, for the signed-in seller.
        """
        serializer = PriceCheckSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        max_pct = max_staff_discount_pct()
        lines = []
        for index, entry in enumerate(serializer.validated_data["items"]):
            product = entry["product"]
            try:
                list_price = _resolve_retail_price(product)
            except ValidationError:
                lines.append({"index": index, "product": product.pk, "rule": "no_price",
                              "discount_pct": None, "needs_approval": False, "needs_note": False})
                continue
            unit_price = entry.get("unit_price") or list_price
            verdict = evaluate_line(
                unit_price=unit_price, list_price=list_price,
                floor=price_floor(product, weighted_average_cost(product)),
                seller=request.user, max_pct=max_pct,
            )
            lines.append({
                "index": index, "product": product.pk, "rule": verdict.rule,
                "list_price": str(list_price), "unit_price": str(unit_price),
                "discount_pct": str(verdict.discount_pct),
                "needs_approval": verdict.needs_approval, "needs_note": verdict.needs_note,
            })
        return Response({"max_staff_discount_pct": str(max_pct), "lines": lines})

    @action(detail=True, methods=["post"], url_path="return", permission_classes=[IsAdminOrManager])
    def return_action(self, request, pk=None):
        sale = self.get_object()
        updated = reverse_sale(sale, Sale.SaleStatus.RETURNED, user=request.user)
        return Response(SaleSerializer(updated, context={"request": request}).data)

    @action(detail=True, methods=["post"], permission_classes=[IsAdminOrManager])
    def cancel(self, request, pk=None):
        sale = self.get_object()
        updated = reverse_sale(sale, Sale.SaleStatus.CANCELLED, user=request.user)
        return Response(SaleSerializer(updated, context={"request": request}).data)
