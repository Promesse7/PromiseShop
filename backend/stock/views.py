import datetime

from django.db.models import F
from rest_framework import status as http_status
from rest_framework import viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import MethodNotAllowed, ValidationError
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from accounts.permissions import IsAdminOrManager
from stock.models import Inventory, EquipmentUnit, StockMovement
from stock.serializers import (
    InventorySerializer, InventoryAdjustmentSerializer, AdjustInventorySerializer,
    EquipmentUnitSerializer, EquipmentUnitListSerializer,
    EquipmentUnitUpdateSerializer, ChangeStatusSerializer, StockMovementSerializer,
)
from stock.services import adjust_inventory, change_equipment_status


class InventoryViewSet(viewsets.ModelViewSet):
    # "post" is only here for the adjust action; creating Inventory rows directly
    # stays disallowed (they are created when a purchase is received).
    http_method_names = ["get", "post", "patch", "head", "options"]
    serializer_class = InventorySerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        queryset = Inventory.objects.all().select_related("product").order_by("inventory_id")
        if self.request.query_params.get("low_stock") == "true":
            queryset = queryset.filter(quantity_in_stock__lte=F("product__reorder_level"))
        product_id = self.request.query_params.get("product")
        if product_id:
            # Lets a product page read its one row instead of walking the whole collection.
            queryset = queryset.filter(product_id=product_id)
        return queryset

    def create(self, request, *args, **kwargs):
        raise MethodNotAllowed("POST")

    @action(detail=True, methods=["post"], url_path="adjust", permission_classes=[IsAdminOrManager])
    def adjust(self, request, pk=None):
        inventory = self.get_object()
        serializer = AdjustInventorySerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        adjustment = adjust_inventory(inventory, changed_by=request.user, **serializer.validated_data)
        return Response(InventoryAdjustmentSerializer(adjustment).data, status=http_status.HTTP_201_CREATED)

    @action(detail=True, methods=["get"], url_path="adjustments")
    def adjustments(self, request, pk=None):
        inventory = self.get_object()
        rows = inventory.adjustments.order_by("-created_at", "-adjustment_id")
        return Response(InventoryAdjustmentSerializer(rows, many=True).data)


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


def _parse_date(value, name):
    try:
        return datetime.date.fromisoformat(value)
    except ValueError:
        raise ValidationError({name: f"Use a YYYY-MM-DD date, not {value!r}."})


class StockMovementViewSet(viewsets.ReadOnlyModelViewSet):
    """The stock ledger, newest first. ?product= &type= &bucket= &from= &to=

    from/to are calendar days in the shop's time zone (Africa/Kigali), inclusive.
    """

    serializer_class = StockMovementSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        params = self.request.query_params
        queryset = StockMovement.objects.select_related("product", "created_by").order_by(
            "-created_at", "-movement_id"
        )
        if params.get("product"):
            queryset = queryset.filter(product_id=params["product"])
        if params.get("type"):
            queryset = queryset.filter(movement_type=params["type"])
        if params.get("bucket"):
            queryset = queryset.filter(bucket=params["bucket"])
        if params.get("from"):
            queryset = queryset.filter(created_at__date__gte=_parse_date(params["from"], "from"))
        if params.get("to"):
            queryset = queryset.filter(created_at__date__lte=_parse_date(params["to"], "to"))
        return queryset
