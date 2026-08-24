from rest_framework import viewsets
from rest_framework.permissions import IsAuthenticated
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework import status as http_status

from sales.models import Customer, Sale
from sales.serializers import CustomerSerializer, SaleSerializer, CreateSaleSerializer
from sales.services import complete_sale, reverse_sale


class CustomerViewSet(viewsets.ModelViewSet):
    queryset = Customer.objects.all().order_by("customer_id")
    serializer_class = CustomerSerializer
    permission_classes = [IsAuthenticated]


class SaleViewSet(viewsets.ModelViewSet):
    http_method_names = ["get", "post", "head", "options"]
    queryset = Sale.objects.all().order_by("-sale_date").prefetch_related("items")
    serializer_class = SaleSerializer
    permission_classes = [IsAuthenticated]

    def create(self, request, *args, **kwargs):
        input_serializer = CreateSaleSerializer(data=request.data)
        input_serializer.is_valid(raise_exception=True)
        data = input_serializer.validated_data
        sale = complete_sale(
            customer=data.get("customer"),
            employee=request.user,
            payment_method=data.get("payment_method"),
            items=data["items"],
        )
        return Response(
            SaleSerializer(sale, context={"request": request}).data,
            status=http_status.HTTP_201_CREATED,
        )

    @action(detail=True, methods=["post"], url_path="return")
    def return_action(self, request, pk=None):
        sale = self.get_object()
        updated = reverse_sale(sale, Sale.SaleStatus.RETURNED)
        return Response(SaleSerializer(updated, context={"request": request}).data)

    @action(detail=True, methods=["post"])
    def cancel(self, request, pk=None):
        sale = self.get_object()
        updated = reverse_sale(sale, Sale.SaleStatus.CANCELLED)
        return Response(SaleSerializer(updated, context={"request": request}).data)
