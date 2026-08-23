from rest_framework import viewsets
from rest_framework.permissions import IsAuthenticated

from sales.models import Customer
from sales.serializers import CustomerSerializer


class CustomerViewSet(viewsets.ModelViewSet):
    queryset = Customer.objects.all().order_by("customer_id")
    serializer_class = CustomerSerializer
    permission_classes = [IsAuthenticated]
