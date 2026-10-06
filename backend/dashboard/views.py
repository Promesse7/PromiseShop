from datetime import datetime
from decimal import Decimal, ROUND_HALF_UP

from django.db.models import Sum, Count, F, DecimalField
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.permissions import IsAdminOrManager
from catalog.models import Product
from dashboard.services import resolve_period_range
from finance.models import Expense
from notifications.models import NotificationLog
from purchasing.costing import received_cost_totals
from purchasing.models import Purchase
from sales.models import Sale, SaleItem
from stock.models import EquipmentUnit, Inventory


class SalesSummaryView(APIView):
    permission_classes = [IsAdminOrManager]

    def get(self, request):
        period = request.query_params.get("period")
        start, end = resolve_period_range(period)

        completed_sales = Sale.objects.filter(
            status=Sale.SaleStatus.COMPLETED, sale_date__date__range=(start, end)
        )
        total_revenue = completed_sales.aggregate(total=Sum("total_amount"))["total"] or Decimal("0.00")
        sale_count = completed_sales.count()

        top_products = (
            SaleItem.objects.filter(
                sale__status=Sale.SaleStatus.COMPLETED,
                sale__sale_date__date__range=(start, end),
            )
            .values("product_id", "product__name")
            .annotate(revenue=Sum("subtotal"))
            .order_by("-revenue")[:5]
        )

        return Response({
            "period": period,
            "total_revenue": str(total_revenue),
            "sale_count": sale_count,
            "top_products": [
                {
                    "product_id": row["product_id"],
                    "product_name": row["product__name"],
                    "revenue": str(row["revenue"]),
                }
                for row in top_products
            ],
        })


class StockHealthView(APIView):
    permission_classes = [IsAdminOrManager]

    def get(self, request):
        low_stock_count = Inventory.objects.filter(
            quantity_in_stock__lte=F("product__reorder_level")
        ).count()

        status_counts = {choice[0]: 0 for choice in EquipmentUnit.UnitStatus.choices}
        for row in EquipmentUnit.objects.values("status").annotate(count=Count("unit_id")):
            status_counts[row["status"]] = row["count"]

        return Response({
            "low_stock_count": low_stock_count,
            "equipment_status_counts": status_counts,
        })


class FinancialSnapshotView(APIView):
    permission_classes = [IsAdminOrManager]

    def get(self, request):
        period = request.query_params.get("period")
        start, end = resolve_period_range(period)

        total_revenue = Sale.objects.filter(
            status=Sale.SaleStatus.COMPLETED, sale_date__date__range=(start, end)
        ).aggregate(total=Sum("total_amount"))["total"] or Decimal("0.00")

        expenses_in_period = Expense.objects.filter(expense_date__range=(start, end))
        total_expenses = expenses_in_period.aggregate(total=Sum("amount"))["total"] or Decimal("0.00")

        by_category = {choice[0]: Decimal("0.00") for choice in Expense.ExpenseCategory.choices}
        for row in expenses_in_period.values("category").annotate(total=Sum("amount")):
            by_category[row["category"]] = row["total"]

        net = total_revenue - total_expenses

        return Response({
            "period": period,
            "total_revenue": str(total_revenue),
            "total_expenses": str(total_expenses),
            "expenses_by_category": {
                category: str(value) for category, value in by_category.items()
            },
            "net": str(net),
        })


CENT = Decimal("0.01")


def _money(value):
    return value.quantize(CENT, rounding=ROUND_HALF_UP)


def _money_str(value):
    return None if value is None else str(_money(value))


def _profitability_row(product_id, product_name, cost, sale):
    """Combine one product's all-time cost figures with its period sales figures.

    Costs come from received purchases only (weighted average per unit); this
    system does not lot-track stock, so a weighted average is the honest
    per-unit cost. "Actual" margin is what the till charged (SaleItem.unit_price)
    minus the paid cost; "projected" is the catalog price (SaleItem.list_price)
    minus the invoiced cost — the gap between the two is what discounts at the
    till and supplier billing differences cost the shop.
    """
    units_bought = int(cost["units"] or 0) if cost else 0
    if units_bought:
        avg_cost_paid = _money(cost["paid"] / units_bought)
        avg_cost_invoiced = _money(cost["invoiced"] / units_bought)
    else:
        avg_cost_paid = avg_cost_invoiced = None

    units_sold = int(sale["units"] or 0) if sale else 0
    revenue = _money(sale["revenue"] or Decimal("0")) if sale else Decimal("0.00")
    projected_revenue = _money(sale["projected"] or Decimal("0")) if sale else Decimal("0.00")

    cogs_paid = _money(avg_cost_paid * units_sold) if avg_cost_paid is not None else None
    cogs_invoiced = _money(avg_cost_invoiced * units_sold) if avg_cost_invoiced is not None else None
    gross_margin = revenue - cogs_paid if cogs_paid is not None else None
    projected_margin = projected_revenue - cogs_invoiced if cogs_invoiced is not None else None

    return {
        "product_id": product_id,
        "product_name": product_name,
        "units_bought": units_bought,
        "avg_cost_paid": avg_cost_paid,
        "avg_cost_invoiced": avg_cost_invoiced,
        "units_sold": units_sold,
        "revenue": revenue,
        "projected_revenue": projected_revenue,
        "cogs_paid": cogs_paid,
        "cogs_invoiced": cogs_invoiced,
        "gross_margin": gross_margin,
        "projected_margin": projected_margin,
    }


def _with_percentages(row):
    revenue = row["revenue"]
    projected = row["projected_revenue"]
    row["margin_pct"] = (
        _money(row["gross_margin"] / revenue * 100) if row["gross_margin"] is not None and revenue > 0 else None
    )
    row["projected_margin_pct"] = (
        _money(row["projected_margin"] / projected * 100)
        if row["projected_margin"] is not None and projected > 0 else None
    )
    return row


def _serialize_row(row):
    return {
        "product_id": row["product_id"],
        "product_name": row["product_name"],
        "units_bought": row["units_bought"],
        "avg_cost_paid": _money_str(row["avg_cost_paid"]),
        "avg_cost_invoiced": _money_str(row["avg_cost_invoiced"]),
        "units_sold": row["units_sold"],
        "revenue": _money_str(row["revenue"]),
        "projected_revenue": _money_str(row["projected_revenue"]),
        "cogs_paid": _money_str(row["cogs_paid"]),
        "cogs_invoiced": _money_str(row["cogs_invoiced"]),
        "gross_margin": _money_str(row["gross_margin"]),
        "projected_margin": _money_str(row["projected_margin"]),
        "margin_pct": _money_str(row["margin_pct"]),
        "projected_margin_pct": _money_str(row["projected_margin_pct"]),
    }


class ProfitabilityView(APIView):
    """Per-product actual vs projected margin.

    ?period=today|week|month|year|all scopes the SALES side; costs are always
    all-time weighted averages over received purchases (units sold this month
    were usually bought earlier). ?product=<id> narrows to one product and
    always returns a row for it, even with no sales in the period.
    """

    permission_classes = [IsAdminOrManager]

    def get(self, request):
        period = request.query_params.get("period")
        if period == "all":
            date_range = None
        else:
            date_range = resolve_period_range(period)

        product_id_param = request.query_params.get("product")
        only_product = None
        if product_id_param is not None:
            try:
                only_product = get_object_or_404(Product, pk=int(product_id_param))
            except ValueError:
                raise ValidationError({"product": f"Invalid product id: {product_id_param!r}."})

        sale_qs = SaleItem.objects.filter(sale__status=Sale.SaleStatus.COMPLETED)
        if date_range is not None:
            sale_qs = sale_qs.filter(sale__sale_date__date__range=date_range)
        if only_product is not None:
            sale_qs = sale_qs.filter(product=only_product)

        # Per single unit, whatever the line kind (Module F: packs and bundle components).
        costs = received_cost_totals([only_product.pk] if only_product is not None else None)
        sales = {
            row["product_id"]: row
            for row in sale_qs.values("product_id").annotate(
                units=Sum("quantity"),
                revenue=Sum("subtotal"),
                projected=Sum(
                    F("list_price") * F("quantity"),
                    output_field=DecimalField(max_digits=14, decimal_places=2),
                ),
            )
        }

        product_ids = {only_product.pk} if only_product is not None else set(costs) | set(sales)
        names = dict(Product.objects.filter(pk__in=product_ids).values_list("product_id", "name"))

        rows = [
            _with_percentages(_profitability_row(pid, names.get(pid), costs.get(pid), sales.get(pid)))
            for pid in product_ids
        ]
        rows.sort(key=lambda r: (r["revenue"], r["units_sold"]), reverse=True)

        def total(key):
            values = [r[key] for r in rows if r[key] is not None]
            return sum(values, Decimal("0.00")) if values else None

        totals = _with_percentages({
            "product_id": None,
            "product_name": None,
            "units_bought": sum(r["units_bought"] for r in rows),
            "avg_cost_paid": None,
            "avg_cost_invoiced": None,
            "units_sold": sum(r["units_sold"] for r in rows),
            "revenue": total("revenue") or Decimal("0.00"),
            "projected_revenue": total("projected_revenue") or Decimal("0.00"),
            "cogs_paid": total("cogs_paid"),
            "cogs_invoiced": total("cogs_invoiced"),
            "gross_margin": total("gross_margin"),
            "projected_margin": total("projected_margin"),
        })

        return Response({
            "period": period,
            "products": [_serialize_row(r) for r in rows],
            "totals": _serialize_row(totals),
        })


class ActivityFeedView(APIView):
    permission_classes = [IsAdminOrManager]

    def get(self, request):
        raw_limit = request.query_params.get("limit", "20")
        try:
            limit = int(raw_limit)
        except ValueError:
            raise ValidationError({"limit": f"Invalid limit: {raw_limit!r}. Must be an integer."})
        limit = max(1, min(limit, 100))

        sales = Sale.objects.order_by("-sale_date")[:limit]
        purchases = Purchase.objects.select_related("supplier").order_by(
            "-purchase_date", "-purchase_id"
        )[:limit]
        notifications = NotificationLog.objects.filter(
            recipient=request.user
        ).order_by("-sent_at")[:limit]

        items = []
        for sale in sales:
            items.append({
                "type": "sale",
                "id": sale.sale_id,
                "timestamp": sale.sale_date,
                "status": sale.status,
                "summary": f"Sale #{sale.sale_id} - {sale.total_amount}",
            })
        for purchase in purchases:
            purchase_timestamp = timezone.make_aware(
                datetime.combine(purchase.purchase_date, datetime.min.time())
            )
            items.append({
                "type": "purchase",
                "id": purchase.purchase_id,
                "timestamp": purchase_timestamp,
                "status": purchase.status,
                "summary": str(purchase),
            })
        for notification in notifications:
            items.append({
                "type": "notification",
                "id": notification.notification_id,
                "timestamp": notification.sent_at,
                "summary": notification.type,
            })

        items.sort(key=lambda item: item["timestamp"], reverse=True)
        return Response(items[:limit])


# --- Module H: money dashboards -------------------------------------------------

from dashboard import money as money_reports  # noqa: E402


def _jsonable(value):
    if isinstance(value, Decimal):
        return str(value)
    if isinstance(value, dict):
        return {k: _jsonable(v) for k, v in value.items()}
    if isinstance(value, (list, tuple)):
        return [_jsonable(v) for v in value]
    if hasattr(value, "isoformat"):
        return value.isoformat()
    return value


class _MoneyView(APIView):
    permission_classes = [IsAdminOrManager]

    def compute(self, start, end, request, **kwargs):  # pragma: no cover - abstract
        raise NotImplementedError

    def get(self, request, **kwargs):
        start, end = money_reports.parse_range(request.query_params)
        return Response(_jsonable(self.compute(start, end, request, **kwargs)))


class MoneySummaryView(_MoneyView):
    def compute(self, start, end, request):
        return money_reports.summary(start, end)


class MoneyChainView(_MoneyView):
    def compute(self, start, end, request):
        result = money_reports.chain(start, end)
        result["vat"] = money_reports.vat_position(start, end, output_vat=result["figures"]["output_vat"])
        return result


class MoneyLeakageView(_MoneyView):
    def compute(self, start, end, request):
        return money_reports.leakage(start, end)


class MoneyProductView(_MoneyView):
    def compute(self, start, end, request, product_id=None):
        return money_reports.product_drilldown(get_object_or_404(Product, pk=product_id), start, end)


class MoneyPeopleView(_MoneyView):
    def compute(self, start, end, request):
        return money_reports.people(start, end)


class MoneyAlertsView(_MoneyView):
    def compute(self, start, end, request):
        return money_reports.alerts(as_of=end)
