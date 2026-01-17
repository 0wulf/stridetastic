import os

import pytest


@pytest.fixture(autouse=True)
def _ninja_registry_isolation():
    """Prevent django-ninja global registry leakage between tests.

    Many tests create their own `TestClient(api)` instances. Ninja tracks APIs in a
    global registry and will raise `ConfigError` if it thinks multiple APIs are
    registered under the same namespace/version.
    """

    os.environ["NINJA_SKIP_REGISTRY"] = "1"

    try:
        from ninja.main import NinjaAPI

        NinjaAPI._registry.clear()
    except Exception:
        # If ninja isn't importable for some reason, don't block tests.
        pass

    yield

    try:
        from ninja.main import NinjaAPI

        NinjaAPI._registry.clear()
    except Exception:
        pass
