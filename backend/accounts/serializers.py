from rest_framework import serializers
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer

from accounts.models import Employee


class EmployeeTokenObtainPairSerializer(TokenObtainPairSerializer):
    def validate(self, attrs):
        data = super().validate(attrs)
        data["role"] = self.user.role
        return data


class EmployeeSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True)

    class Meta:
        model = Employee
        fields = [
            "employee_id", "full_name", "role", "phone", "email",
            "username", "password", "hire_date", "status", "created_at",
        ]
        read_only_fields = ["employee_id", "created_at"]

    def create(self, validated_data):
        password = validated_data.pop("password")
        return Employee.objects.create_user(password=password, **validated_data)

    def update(self, instance, validated_data):
        password = validated_data.pop("password", None)
        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        if password:
            instance.set_password(password)
        instance.save()
        return instance
