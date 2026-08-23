from rest_framework import serializers
from purchasing.models import Supplier


class SupplierSerializer(serializers.ModelSerializer):
    class Meta:
        model = Supplier
        fields = ["supplier_id", "name", "contact_person", "phone", "email", "address"]
        read_only_fields = ["supplier_id"]
