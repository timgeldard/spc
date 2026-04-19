import pytest
from fastapi.testclient import TestClient
from backend.main import app
import backend.routers.spc_analysis as spc_router
from unittest.mock import AsyncMock

client = TestClient(app)

@pytest.fixture
def mock_spc_dal(monkeypatch):
    mock_payload = {"test": "data"}
    monkeypatch.setattr(spc_router, "fetch_process_flow", AsyncMock(return_value=mock_payload))
    monkeypatch.setattr(spc_router, "fetch_scorecard", AsyncMock(return_value=[]))
    monkeypatch.setattr(spc_router, "fetch_correlation", AsyncMock(return_value=mock_payload))
    monkeypatch.setattr(spc_router, "fetch_correlation_scatter", AsyncMock(return_value=[]))
    monkeypatch.setattr(spc_router, "fetch_multivariate", AsyncMock(return_value=mock_payload))
    monkeypatch.setattr(spc_router, "resolve_token", lambda *args: "token")
    monkeypatch.setattr(spc_router, "check_warehouse_config", lambda: None)
    # Mock attach_data_freshness to just return the data
    monkeypatch.setattr(spc_router, "attach_data_freshness", AsyncMock(side_effect=lambda data, *args, **kwargs: data))
    return mock_payload

def test_scorecard_endpoint(mock_spc_dal):
    response = client.post(
        "/api/spc/scorecard",
        json={"material_id": "MAT1", "plant_id": "P1"}
    )
    assert response.status_code == 200
    assert "scorecard" in response.json()

def test_process_flow_endpoint(mock_spc_dal):
    response = client.post(
        "/api/spc/process-flow",
        json={"material_id": "MAT1"}
    )
    assert response.status_code == 200
    assert response.json() == mock_spc_dal

def test_correlation_endpoint(mock_spc_dal):
    response = client.post(
        "/api/spc/correlation",
        json={"material_id": "MAT1"}
    )
    assert response.status_code == 200
    assert response.json() == mock_spc_dal

def test_multivariate_endpoint(mock_spc_dal):
    response = client.post(
        "/api/spc/multivariate",
        json={"material_id": "MAT1", "mic_ids": ["M1", "M2"]}
    )
    assert response.status_code == 200
    assert response.json() == mock_spc_dal

def test_msa_calculate_endpoint():
    # Test average_range
    response = client.post(
        "/api/spc/msa/calculate",
        headers={"x-forwarded-access-token": "token"},
        json={
            "measurement_data": [[[1, 1.1], [2, 2.1]], [[1.1, 1.2], [2.1, 2.2]]],
            "tolerance": 1.0,
            "method": "average_range"
        }
    )
    assert response.status_code == 200
    assert response.json()["method"] == "average_range"

    # Test anova
    response = client.post(
        "/api/spc/msa/calculate",
        headers={"x-forwarded-access-token": "token"},
        json={
            "measurement_data": [[[1, 1.1], [2, 2.1]], [[1.1, 1.2], [2.1, 2.2]]],
            "tolerance": 1.0,
            "method": "anova"
        }
    )
    assert response.status_code == 200
    assert response.json()["method"] == "anova"

def test_msa_save_endpoint(mock_spc_dal, monkeypatch):
    monkeypatch.setattr(spc_router, "save_msa_session", AsyncMock(return_value={"saved": True}))
    response = client.post(
        "/api/spc/msa/save",
        headers={"x-forwarded-access-token": "token"},
        json={
            "material_id": "MAT1",
            "mic_id": "MIC1",
            "n_operators": 2,
            "n_parts": 2,
            "n_replicates": 2,
            "grr_pct": 10.0,
            "repeatability": 0.1,
            "reproducibility": 0.1,
            "ndc": 5.0,
            "results_json": "{}"
        }
    )
    assert response.status_code == 200
    assert response.json()["saved"] is True

def test_compare_scorecard_endpoint(mock_spc_dal, monkeypatch):
    monkeypatch.setattr(spc_router, "fetch_compare_scorecard", AsyncMock(return_value=[]))
    response = client.post(
        "/api/spc/compare-scorecard",
        headers={"x-forwarded-access-token": "token"},
        json={
            "material_ids": ["MAT1", "MAT2"],
            "plant_id": "P1"
        }
    )
    assert response.status_code == 200
    assert response.json() == []
