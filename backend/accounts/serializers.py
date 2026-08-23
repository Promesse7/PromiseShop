from rest_framework_simplejwt.serializers import TokenObtainPairSerializer


class EmployeeTokenObtainPairSerializer(TokenObtainPairSerializer):
    def validate(self, attrs):
        data = super().validate(attrs)
        data["role"] = self.user.role
        return data
