from django.contrib import admin
from purchasing.models import Supplier, Purchase, PurchaseItem

admin.site.register(Supplier)
admin.site.register(Purchase)
admin.site.register(PurchaseItem)
