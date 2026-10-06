"""Release Phase 0.5: 5 failed logins per username in 15 minutes lock that
username for 15 minutes."""
import pytest
from datetime import date
from unittest import mock
from rest_framework.test import APIClient

from accounts import lockout
from accounts.models import Employee

pytestmark = pytest.mark.django_db


@pytest.fixture
def employee():
    return Employee.objects.create_user(
        username="admin1", password="rightpass", full_name="Admin One",
        hire_date=date(2025, 1, 1), role=Employee.Role.ADMIN,
    )


def login(username, password):
    return APIClient().post("/api/auth/login/", {"username": username, "password": password}, format="json")


def test_five_failures_return_401_and_the_sixth_attempt_is_locked_out(employee):
    for _ in range(5):
        assert login("admin1", "wrong").status_code == 401

    response = login("admin1", "rightpass")

    assert response.status_code == 429
    assert "15 minutes" in str(response.json()["detail"])


def test_lockout_matches_the_username_case_insensitively(employee):
    for _ in range(5):
        login("Admin1", "wrong")

    assert login("admin1", "rightpass").status_code == 429


def test_lockout_only_affects_that_username(employee):
    Employee.objects.create_user(
        username="staff1", password="staffpass", full_name="Staff One",
        hire_date=date(2025, 1, 1), role=Employee.Role.SALES_STAFF,
    )
    for _ in range(5):
        login("admin1", "wrong")

    assert login("staff1", "staffpass").status_code == 200


def test_successful_login_clears_earlier_failures(employee):
    for _ in range(4):
        login("admin1", "wrong")
    assert login("admin1", "rightpass").status_code == 200

    for _ in range(4):
        assert login("admin1", "wrong").status_code == 401
    assert login("admin1", "rightpass").status_code == 200


def test_failures_for_unknown_usernames_also_lock(employee):
    for _ in range(5):
        login("nobody", "wrong")

    assert login("nobody", "wrong").status_code == 429


def test_lock_and_counter_use_a_fifteen_minute_window(employee):
    with mock.patch.object(lockout.cache, "set", wraps=lockout.cache.set) as cache_set:
        for _ in range(5):
            login("admin1", "wrong")

    lock_calls = [c for c in cache_set.call_args_list if c.args[0] == lockout.lock_key("admin1")]
    assert lock_calls and lock_calls[-1].args[2] == 15 * 60
