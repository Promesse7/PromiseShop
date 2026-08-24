from rest_framework import viewsets
from rest_framework.permissions import IsAuthenticated
from django.shortcuts import get_object_or_404
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied
from rest_framework.response import Response
from rest_framework import status as http_status

from purchasing.models import Supplier, Purchase, PurchaseItem
from purchasing.serializers import SupplierSerializer, PurchaseSerializer, AddPurchaseItemSerializer, PurchaseItemSerializer
from purchasing.services import add_existing_product_item, add_new_product_item, remove_item, receive_purchase


class SupplierViewSet(viewsets.ModelViewSet):
    queryset = Supplier.objects.all().order_by("supplier_id")
    serializer_class = SupplierSerializer
    permission_classes = [IsAuthenticated]


class PurchaseViewSet(viewsets.ModelViewSet):
    queryset = Purchase.objects.all().order_by("-purchase_date")
    serializer_class = PurchaseSerializer
    permission_classes = [IsAuthenticated]

    def perform_create(self, serializer):
        serializer.save(employee=self.request.user)

    def perform_update(self, serializer):
        if serializer.instance.status != Purchase.Status.DRAFT:
            raise PermissionDenied("Cannot edit a purchase that has already been received.")
        serializer.save()

    @action(detail=True, methods=["post"], url_path="items")
    def add_item(self, request, pk=None):
        purchase = self.get_object()
        serializer = AddPurchaseItemSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = dict(serializer.validated_data)
        is_new_product = data.pop("_is_new_product")
        if is_new_product:
            item = add_new_product_item(
                purchase, category=data["category"], name=data["name"],
                quantity=data["quantity"], unit_cost_paid=data["unit_cost_paid"],
                unit_cost_invoiced=data["unit_cost_invoiced"], selling_price=data["selling_price"],
                brand=data.get("brand", ""), model_number=data.get("model_number", ""),
                specifications=data.get("specifications", ""),
                usage_instructions=data.get("usage_instructions", ""),
                warranty_months=data.get("warranty_months", 0),
                reorder_level=data.get("reorder_level", 5),
                price_discrepancy_note=data.get("price_discrepancy_note", ""),
            )
        else:
            item = add_existing_product_item(
                purchase, data["product"], data["quantity"], data["unit_cost_paid"],
                data["unit_cost_invoiced"], data.get("price_discrepancy_note", ""),
            )
        return Response(PurchaseItemSerializer(item).data, status=http_status.HTTP_201_CREATED)

    @action(detail=True, methods=["delete"], url_path=r"items/(?P<item_id>[^/.]+)")
    def remove_item_action(self, request, pk=None, item_id=None):
        purchase = self.get_object()
        item = get_object_or_404(PurchaseItem, pk=item_id, purchase=purchase)
        remove_item(purchase, item)
        return Response(status=http_status.HTTP_204_NO_CONTENT)

    @action(detail=True, methods=["post"])
    def receive(self, request, pk=None):
        purchase = self.get_object()
        purchase = receive_purchase(purchase)
        return Response(PurchaseSerializer(purchase).data)
