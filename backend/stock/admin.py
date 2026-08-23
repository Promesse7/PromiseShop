from django.contrib import admin
from stock.models import Inventory, EquipmentUnit, EquipmentStatusHistory

admin.site.register(Inventory)
admin.site.register(EquipmentUnit)
admin.site.register(EquipmentStatusHistory)
