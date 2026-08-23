from django.contrib import admin
from sales.models import Customer, Sale, SaleItem

admin.site.register(Customer)
admin.site.register(Sale)
admin.site.register(SaleItem)
