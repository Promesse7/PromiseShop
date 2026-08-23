from rest_framework import serializers
from sales.models import Customer


class CustomerSerializer(serializers.ModelSerializer):
    class Meta:
        model = Customer
        fields = ["customer_id", "name", "phone", "email", "address"]
        read_only_fields = ["customer_id"]
