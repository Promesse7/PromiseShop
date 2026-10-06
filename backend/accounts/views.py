from rest_framework import status, viewsets
from rest_framework.exceptions import AuthenticationFailed
from rest_framework.response import Response
from rest_framework_simplejwt.views import TokenObtainPairView

from accounts import lockout
from accounts.models import Employee
from accounts.permissions import IsAdmin
from accounts.serializers import EmployeeTokenObtainPairSerializer, EmployeeSerializer


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
