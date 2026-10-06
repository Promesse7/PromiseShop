from django.contrib import admin
from purchasing.models import (
    BundleTemplate, BundleTemplateComponent, Purchase, PurchaseItem, PurchaseItemComponent, Supplier,
)

admin.site.register(Supplier)
admin.site.register(Purchase)
admin.site.register(PurchaseItem)
admin.site.register(PurchaseItemComponent)
admin.site.register(BundleTemplate)
admin.site.register(BundleTemplateComponent)
