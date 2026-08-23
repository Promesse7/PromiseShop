from django.contrib.auth.base_user import AbstractBaseUser
from django.contrib.auth.models import PermissionsMixin
from django.db import models

from accounts.managers import EmployeeManager


class Employee(AbstractBaseUser, PermissionsMixin):
    class Role(models.TextChoices):
        ADMIN = "admin", "Admin"
        MANAGER = "manager", "Manager"
        SALES_STAFF = "sales_staff", "Sales Staff"
        TECHNICIAN = "technician", "Technician"

    class Status(models.TextChoices):
        ACTIVE = "active", "Active"
        INACTIVE = "inactive", "Inactive"
        TERMINATED = "terminated", "Terminated"

    employee_id = models.AutoField(primary_key=True)
    full_name = models.CharField(max_length=120)
    role = models.CharField(max_length=30, choices=Role.choices)
    phone = models.CharField(max_length=20, blank=True, null=True)
    email = models.EmailField(max_length=120, unique=True, blank=True, null=True)
    username = models.CharField(max_length=50, unique=True)
    # `password` is inherited from AbstractBaseUser — this IS the docx's
    # password_hash column; Django always stores it hashed.
    hire_date = models.DateField()
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.ACTIVE)
    created_at = models.DateTimeField(auto_now_add=True)

    objects = EmployeeManager()

    USERNAME_FIELD = "username"
    REQUIRED_FIELDS = ["full_name", "hire_date"]

    @property
    def is_active(self):
        return self.status == self.Status.ACTIVE

    @property
    def is_staff(self):
        return self.role == self.Role.ADMIN

    def __str__(self):
        return f"{self.full_name} ({self.username})"
