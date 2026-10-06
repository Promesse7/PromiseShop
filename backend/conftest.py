import pytest
from django.core.cache import cache


@pytest.fixture(autouse=True)
def isolated_cache(settings):
    """Keep the cache (login lockout counters) per-test and out of the dev Redis."""
    settings.CACHES = {"default": {"BACKEND": "django.core.cache.backends.locmem.LocMemCache"}}
    cache.clear()
    yield
    cache.clear()
