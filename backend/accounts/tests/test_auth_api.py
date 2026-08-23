import pytest
from datetime import date
from rest_framework.test import APIClient
from accounts.models import Employee

pytestmark = pytest.mark.django_db


@pytest.fixture
def employee():
    return Employee.objects.create_user(
        username="e.mugisha",
        password="s3cret-pass",
        full_name="Eric Mugisha",
        hire_date=date(2025, 1, 15),
        role=Employee.Role.SALES_STAFF,
    )


def test_login_with_valid_credentials_returns_tokens_and_role(employee):
    client = APIClient()
    response = client.post(
        "/api/auth/login/",
        {"username": "e.mugisha", "password": "s3cret-pass"},
        format="json",
    )
    assert response.status_code == 200
    body = response.json()
    assert "access" in body
    assert "refresh" in body
    assert body["role"] == Employee.Role.SALES_STAFF


def test_login_with_invalid_credentials_returns_401(employee):
    client = APIClient()
    response = client.post(
        "/api/auth/login/",
        {"username": "e.mugisha", "password": "wrong-pass"},
        format="json",
    )
    assert response.status_code == 401


def test_refresh_issues_new_access_token(employee):
    client = APIClient()
    login_response = client.post(
        "/api/auth/login/",
        {"username": "e.mugisha", "password": "s3cret-pass"},
        format="json",
    )
    refresh_token = login_response.json()["refresh"]

    refresh_response = client.post(
        "/api/auth/refresh/", {"refresh": refresh_token}, format="json"
    )
    assert refresh_response.status_code == 200
    assert "access" in refresh_response.json()
