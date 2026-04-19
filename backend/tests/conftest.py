import pytest
import asyncio
from unittest.mock import AsyncMock

@pytest.fixture
def mock_run_sql_async(monkeypatch):
    """Fixture to mock run_sql_async globally for a test."""
    mock = AsyncMock(return_value=[])
    # We will need to apply this monkeypatch in the actual test or a more specific fixture
    # as we don't know which module to patch here (it's often imported into the DAL)
    return mock

@pytest.fixture
def sample_spc_data():
    """Returns a sample set of SPC measurement data for testing calculations."""
    return [10.5, 10.2, 11.0, 10.8, 10.5, 10.3, 11.2, 10.9, 10.6, 10.4]

@pytest.fixture
def mock_oidc_token():
    """Returns a fake OIDC token for testing router dependencies."""
    return "fake-oidc-token-123"

@pytest.fixture
def subgrouped_sample_data():
    """Returns sample data grouped into subgroups of size 2."""
    return [
        [10.5, 10.2],
        [11.0, 10.8],
        [10.5, 10.3],
        [11.2, 10.9],
        [10.6, 10.4]
    ]
