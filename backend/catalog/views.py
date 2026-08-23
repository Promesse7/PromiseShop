from rest_framework import viewsets
from rest_framework.permissions import IsAuthenticated

from catalog.models import Category
from catalog.serializers import CategorySerializer


class CategoryViewSet(viewsets.ModelViewSet):
    queryset = Category.objects.all().order_by("category_id")
    serializer_class = CategorySerializer
    permission_classes = [IsAuthenticated]
