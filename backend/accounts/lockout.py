"""Failed-attempt lockout keyed by username, kept in the shared cache.

After MAX_FAILURES failed attempts inside WINDOW_SECONDS the username is locked
for LOCK_SECONDS, whatever password comes next. Used by the login endpoint;
Module C reuses it for manager-PIN attempts.
"""
from django.core.cache import cache

MAX_FAILURES = 5
WINDOW_SECONDS = 15 * 60
LOCK_SECONDS = 15 * 60
LOCKED_MESSAGE = "Too many failed attempts. Try again in 15 minutes."


def _normalise(username):
    return str(username or "").strip().lower()


def failures_key(username):
    return f"lockout:failures:{_normalise(username)}"


def lock_key(username):
    return f"lockout:locked:{_normalise(username)}"


def is_locked(username):
    return cache.get(lock_key(username)) is not None


def record_failure(username):
    key = failures_key(username)
    # add() only sets when absent, so the window starts at the first failure.
    cache.add(key, 0, WINDOW_SECONDS)
    try:
        failures = cache.incr(key)
    except ValueError:  # expired between add() and incr()
        cache.set(key, 1, WINDOW_SECONDS)
        failures = 1
    if failures >= MAX_FAILURES:
        cache.set(lock_key(username), True, LOCK_SECONDS)
        cache.delete(key)


def clear_failures(username):
    cache.delete(failures_key(username))
