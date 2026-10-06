from decimal import Decimal

from django.db.models import DecimalField, Q, Sum, Value
from django.db.models.functions import Coalesce
from django.utils import timezone
from rest_framework import viewsets
from rest_framework.permissions import IsAuthenticated
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework import status as http_status
from rest_framework.exceptions import PermissionDenied, ValidationError

from accounts.permissions import IsAdmin, IsAdminOrManager

from finance.services import OPEN_SALE_STATUSES as OPEN_SALE_STATUSES_FOR_BALANCE
from finance.services import SALE_UNPAID, customer_statement
from finance.views import is_admin_or_manager, jsonable, parse_date_param

from sales.models import Customer, Sale
from sales.pricing import evaluate_line, max_staff_discount_pct, price_floor
from sales.serializers import (
    CreateReturnSerializer, CreateSaleSerializer, CustomerSerializer, PriceCheckSerializer,
    SaleSerializer, VoidSaleSerializer,
)
from sales.services import _resolve_retail_price, complete_sale, return_sale_items, void_sale
from stock.models import StockMovement
from stock.services import weighted_average_cost

MONEY = DecimalField(max_digits=14, decimal_places=2)


def sale_movements(sale, include_cost):
    """Every stock movement this sale caused: the sale itself, a void, and returns."""
    item_ids = [item.pk for item in sale.items.all()]
    return_item_ids = [ri.pk for r in sale.returns.all() for ri in r.items.all()]
    rows = (
        StockMovement.objects.filter(
            Q(source_type="sale_item", source_id__in=item_ids)
            | Q(source_type="sale_return_item", source_id__in=return_item_ids)
        )
        .select_related("product", "created_by")
        .order_by("created_at", "movement_id")
    )
    result = []
    for m in rows:
        row = {
            "movement_id": m.movement_id, "product": m.product_id, "product_name": m.product.name,
            "movement_type": m.movement_type, "bucket": m.bucket, "quantity_delta": m.quantity_delta,
            "balance_after": m.balance_after, "reason": m.reason, "created_at": m.created_at.isoformat(),
            "created_by_name": m.created_by.full_name if m.created_by else None,
        }
        if include_cost:
            row["unit_cost"] = None if m.unit_cost is None else str(m.unit_cost)
        result.append(row)
    return result


class CustomerViewSet(viewsets.ModelViewSet):
    serializer_class = CustomerSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        open_sales = Q(sales__status__in=OPEN_SALE_STATUSES_FOR_BALANCE)
        return Customer.objects.annotate(
            open_balance=Coalesce(Sum("sales__total_amount", filter=open_sales), Value(Decimal("0")), output_field=MONEY)
            - Coalesce(Sum("sales__returned_amount", filter=open_sales), Value(Decimal("0")), output_field=MONEY)
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
        params = self.request.query_params
        queryset = (
            Sale.objects.all().order_by("-sale_date", "-sale_id")
            .select_related("customer", "employee", "voided_by")
            .prefetch_related(
                "items__product", "payments__recorded_by", "payments__reversal",
                "returns__items__sale_item__product", "returns__created_by",
            )
        )
        customer = params.get("customer")
        open_debts = params.get("open") == "true"
        if not is_admin_or_manager(self.request.user):
            # Staff see their own sales from today only. Exception: a customer's open
            # sales, so any role can take a debt payment from the customer page.
            if not (customer and open_debts):
                queryset = queryset.filter(
                    employee=self.request.user, sale_date__date=timezone.localdate()
                )
        if customer:
            queryset = queryset.filter(customer_id=customer)
        if params.get("payment_status"):
            queryset = queryset.filter(payment_status=params["payment_status"])
        if open_debts:
            queryset = queryset.filter(SALE_UNPAID, status__in=OPEN_SALE_STATUSES_FOR_BALANCE)
        if params.get("status"):
            queryset = queryset.filter(status__in=params["status"].split(","))
        if params.get("cashier"):
            queryset = queryset.filter(employee_id=params["cashier"])
        date_from = parse_date_param(self.request, "from")
        date_to = parse_date_param(self.request, "to")
        if date_from:
            queryset = queryset.filter(sale_date__date__gte=date_from)
        if date_to:
            queryset = queryset.filter(sale_date__date__lte=date_to)
        if params.get("payment_method"):
            method = params["payment_method"]
            queryset = queryset.filter(
                Q(payment_method=method) | Q(payments__method=method)
            ).distinct()
        if params.get("has_discount") == "true":
            queryset = queryset.filter(items__discount_amount__gt=0).distinct()
        if params.get("has_return") == "true":
            queryset = queryset.filter(returned_amount__gt=0)
        return queryset

    def retrieve(self, request, *args, **kwargs):
        sale = self.get_object()
        body = SaleSerializer(sale, context={"request": request}).data
        body["movements"] = sale_movements(sale, include_cost=is_admin_or_manager(request.user))
        return Response(body)

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

    def _fresh(self, pk):
        return self.get_queryset().get(pk=pk)

    @action(detail=True, methods=["post"], url_path="void", permission_classes=[IsAdminOrManager])
    def void(self, request, pk=None):
        sale = self.get_object()
        serializer = VoidSaleSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        void_sale(sale, request.user, serializer.validated_data["reason"])
        return Response(SaleSerializer(self._fresh(sale.pk), context={"request": request}).data)

    @action(detail=True, methods=["post"], url_path="returns", permission_classes=[IsAdminOrManager])
    def returns(self, request, pk=None):
        sale = self.get_object()
        serializer = CreateReturnSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        sale_return = return_sale_items(
            sale, [dict(line) for line in data["items"]], data["reason"], request.user,
            refund_method=data.get("refund_method"), refund_reference=data.get("refund_reference", ""),
        )
        body = SaleSerializer(self._fresh(sale.pk), context={"request": request}).data
        body["return_id"] = sale_return.pk
        return Response(body, status=http_status.HTTP_201_CREATED)
