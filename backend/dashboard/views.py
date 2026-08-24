from decimal import Decimal

from django.db.models import Sum, Count, F
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.permissions import IsAdmin
from dashboard.services import resolve_period_range
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
            "total_revenue": total_revenue,
            "sale_count": sale_count,
            "top_products": [
                {
                    "product_id": row["product_id"],
                    "product_name": row["product__name"],
                    "revenue": row["revenue"],
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
