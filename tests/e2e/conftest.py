import os

import pytest


DEFAULT_E2E_BASE_URL = "http://127.0.0.1:5010"

os.environ.setdefault("E2E_BASE_URL", DEFAULT_E2E_BASE_URL)


@pytest.fixture(scope="session")
def base_url() -> str:
    return DEFAULT_E2E_BASE_URL