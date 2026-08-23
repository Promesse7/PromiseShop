from django.contrib import admin
from catalog.models import Category, Product, ProductPricing

admin.site.register(Category)
admin.site.register(Product)
admin.site.register(ProductPricing)
