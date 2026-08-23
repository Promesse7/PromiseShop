from django.contrib import admin
from accounts.models import Employee


class EmployeeAdmin(admin.ModelAdmin):
    exclude = ["password"]


admin.site.register(Employee, EmployeeAdmin)
