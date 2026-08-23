from rest_framework import viewsets
from rest_framework_simplejwt.views import TokenObtainPairView

from accounts.models import Employee
from accounts.permissions import IsAdmin
from accounts.serializers import EmployeeTokenObtainPairSerializer, EmployeeSerializer


class EmployeeTokenObtainPairView(TokenObtainPairView):
    serializer_class = EmployeeTokenObtainPairSerializer


class EmployeeViewSet(viewsets.ModelViewSet):
    queryset = Employee.objects.all().order_by("employee_id")
    serializer_class = EmployeeSerializer
    permission_classes = [IsAdmin]
