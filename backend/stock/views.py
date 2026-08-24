from django.db.models import F
from rest_framework import viewsets
from rest_framework.permissions import IsAuthenticated

from stock.models import Inventory, EquipmentUnit
from stock.serializers import InventorySerializer, EquipmentUnitSerializer, EquipmentUnitUpdateSerializer


class InventoryViewSet(viewsets.ModelViewSet):
    http_method_names = ["get", "patch", "head", "options"]
    serializer_class = InventorySerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        queryset = Inventory.objects.all().select_related("product").order_by("inventory_id")
        if self.request.query_params.get("low_stock") == "true":
            queryset = queryset.filter(quantity_in_stock__lte=F("product__reorder_level"))
        return queryset


class EquipmentUnitViewSet(viewsets.ModelViewSet):
    http_method_names = ["get", "post", "patch", "head", "options"]
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        queryset = EquipmentUnit.objects.all().order_by("unit_id")
        product_id = self.request.query_params.get("product")
        if product_id:
            queryset = queryset.filter(product_id=product_id)
        return queryset

    def get_serializer_class(self):
        if self.action in ("update", "partial_update"):
            return EquipmentUnitUpdateSerializer
        return EquipmentUnitSerializer
