from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import AuthenticationFailed
from rest_framework.response import Response
from rest_framework_simplejwt.views import TokenObtainPairView

from accounts import lockout
from accounts.models import Employee
from accounts.permissions import IsAdmin
from accounts.serializers import EmployeeTokenObtainPairSerializer, EmployeeSerializer
from accounts.services import set_approval_pin


class EmployeeTokenObtainPairView(TokenObtainPairView):
    serializer_class = EmployeeTokenObtainPairSerializer

    def post(self, request, *args, **kwargs):
        username = request.data.get("username", "") if hasattr(request.data, "get") else ""
        if lockout.is_locked(username):
            return Response(
                {"detail": lockout.LOCKED_MESSAGE, "code": "locked_out"},
                status=status.HTTP_429_TOO_MANY_REQUESTS,
            )
        try:
            response = super().post(request, *args, **kwargs)
        except AuthenticationFailed:
            lockout.record_failure(username)
            raise
        lockout.clear_failures(username)
        return response


class EmployeeViewSet(viewsets.ModelViewSet):
    queryset = Employee.objects.all().order_by("employee_id")
    serializer_class = EmployeeSerializer
    permission_classes = [IsAdmin]

    @action(detail=True, methods=["post"], url_path="set-pin")
    def set_pin(self, request, pk=None):
        """Admin sets the 4-6 digit approval PIN of an admin or manager account."""
        employee = self.get_object()
        set_approval_pin(employee, request.data.get("pin"))
        return Response(EmployeeSerializer(employee).data)
