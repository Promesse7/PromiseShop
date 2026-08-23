from django.contrib.auth.base_user import BaseUserManager
from datetime import date


class EmployeeManager(BaseUserManager):
    def create_user(self, username, password=None, **extra_fields):
        if not username:
            raise ValueError("Employees must have a username")
        if "full_name" not in extra_fields:
            raise ValueError("Employees must have a full_name")
        if "hire_date" not in extra_fields:
            raise ValueError("Employees must have a hire_date")

        employee = self.model(username=username, **extra_fields)
        employee.set_password(password)
        employee.save(using=self._db)
        return employee

    def create_superuser(self, username, password=None, **extra_fields):
        extra_fields.setdefault("role", self.model.Role.ADMIN)
        extra_fields.setdefault("full_name", username)
        extra_fields.setdefault("hire_date", date.today())
        extra_fields.setdefault("is_superuser", True)
        return self.create_user(username, password, **extra_fields)
