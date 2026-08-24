from django.db.models import F
from rest_framework import viewsets
from rest_framework.permissions import IsAuthenticated

from stock.models import Inventory
from stock.serializers import InventorySerializer


class InventoryViewSet(viewsets.ModelViewSet):
    http_method_names = ["get", "patch", "head", "options"]
    serializer_class = InventorySerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        queryset = Inventory.objects.all().select_related("product").order_by("inventory_id")
        if self.request.query_params.get("low_stock") == "true":
            queryset = queryset.filter(quantity_in_stock__lte=F("product__reorder_level"))
        return queryset
