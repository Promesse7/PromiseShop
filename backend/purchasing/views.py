from rest_framework import viewsets
from rest_framework.permissions import IsAuthenticated

from purchasing.models import Supplier
from purchasing.serializers import SupplierSerializer


class SupplierViewSet(viewsets.ModelViewSet):
    queryset = Supplier.objects.all().order_by("supplier_id")
    serializer_class = SupplierSerializer
    permission_classes = [IsAuthenticated]
