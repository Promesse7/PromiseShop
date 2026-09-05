import pytest
from datetime import date
from rest_framework.test import APIClient
from accounts.models import Employee
from catalog.models import Category
from core.pagination import StandardPagination

pytestmark = pytest.mark.django_db


def auth_client(employee, password):
    client = APIClient()
    response = client.post(
        "/api/auth/login/", {"username": employee.username, "password": password}, format="json"
    )
    token = response.json()["access"]
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {token}")
    return client


@pytest.fixture
def staff():
    return Employee.objects.create_user(
        username="staff1", password="staffpass", full_name="Staff One",
        hire_date=date(2025, 1, 1), role=Employee.Role.SALES_STAFF,
    )


@pytest.fixture
def three_categories():
    return [Category.objects.create(name=f"Cat {i}", code=f"C{i}") for i in range(3)]


def test_client_can_request_a_page_size(staff, three_categories):
    client = auth_client(staff, "staffpass")
    body = client.get("/api/categories/?page_size=2").json()
    assert body["count"] == 3
    assert len(body["results"]) == 2
    assert body["next"] is not None


def test_default_page_size_still_applies_without_the_param(staff, three_categories):
    client = auth_client(staff, "staffpass")
    body = client.get("/api/categories/").json()
    assert len(body["results"]) == 3
    assert body["next"] is None


def test_page_size_is_capped_so_a_client_cannot_pull_everything_in_one_request():
    # Big enough that a whole shop catalog fits in a couple of requests, small
    # enough that a runaway client can't ask for an unbounded page.
    assert StandardPagination.page_size == 20
    assert StandardPagination.page_size_query_param == "page_size"
    assert StandardPagination.max_page_size == 500
