from rest_framework_simplejwt.views import TokenObtainPairView

from accounts.serializers import EmployeeTokenObtainPairSerializer


class EmployeeTokenObtainPairView(TokenObtainPairView):
    serializer_class = EmployeeTokenObtainPairSerializer
