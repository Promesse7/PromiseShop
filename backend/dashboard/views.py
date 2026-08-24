from datetime import datetime
from decimal import Decimal

from django.db.models import Sum, Count, F
from django.utils import timezone
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.permissions import IsAdmin
from dashboard.services import resolve_period_range
from finance.models import Expense
from notifications.models import NotificationLog
from purchasing.models import Purchase
from sales.models import Sale, SaleItem
from stock.models import EquipmentUnit, Inventory


class SalesSummaryView(APIView):
    permission_classes = [IsAdmin]

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
    permission_classes = [IsAdmin]

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
    permission_classes = [IsAdmin]

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


class ActivityFeedView(APIView):
    permission_classes = [IsAdmin]

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
