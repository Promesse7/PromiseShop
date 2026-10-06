from rest_framework.permissions import SAFE_METHODS, BasePermission
from accounts.models import Employee


class IsAdmin(BasePermission):
    def has_permission(self, request, view):
        return bool(
            request.user
            and request.user.is_authenticated
            and request.user.role == Employee.Role.ADMIN
        )


class IsAdminOrManager(BasePermission):
    def has_permission(self, request, view):
        return bool(
            request.user
            and request.user.is_authenticated
            and request.user.role in (Employee.Role.ADMIN, Employee.Role.MANAGER)
        )


class IsAdminOrManagerOrReadOnly(BasePermission):
    """Any signed-in employee may read; only admin and manager may write."""

    def has_permission(self, request, view):
        if not (request.user and request.user.is_authenticated):
            return False
        if request.method in SAFE_METHODS:
            return True
        return request.user.role in (Employee.Role.ADMIN, Employee.Role.MANAGER)
