from django.contrib.auth.models import AbstractUser


class Employee(AbstractUser):
    class Meta:
        db_table = "accounts_employee"
