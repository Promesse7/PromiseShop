from rest_framework import serializers
from catalog.models import Category


class CategorySerializer(serializers.ModelSerializer):
    class Meta:
        model = Category
        fields = ["category_id", "name", "code", "description"]
        read_only_fields = ["category_id"]
