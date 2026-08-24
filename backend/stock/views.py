from django.db.models import F
from rest_framework import viewsets
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from stock.models import Inventory, EquipmentUnit
from stock.serializers import (
    InventorySerializer, EquipmentUnitSerializer, EquipmentUnitListSerializer,
    EquipmentUnitUpdateSerializer, ChangeStatusSerializer,
)
from stock.services import change_equipment_status


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
        if self.action == "list":
            return EquipmentUnitListSerializer
        return EquipmentUnitSerializer

    def update(self, request, *args, **kwargs):
        partial = kwargs.pop("partial", False)
        instance = self.get_object()
        serializer = self.get_serializer(instance, data=request.data, partial=partial)
        serializer.is_valid(raise_exception=True)
        self.perform_update(serializer)
        return Response(EquipmentUnitSerializer(instance, context=self.get_serializer_context()).data)

    @action(detail=True, methods=["post"], url_path="change-status")
    def change_status(self, request, pk=None):
        unit = self.get_object()
        serializer = ChangeStatusSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        updated = change_equipment_status(
            unit, new_status=data["new_status"], reason=data["reason"],
            changed_by=request.user, assigned_to=data.get("assigned_to"),
        )
        return Response(EquipmentUnitSerializer(updated, context={"request": request}).data)
