import pytest
from fastapi.testclient import TestClient
from backend.main import app
import backend.routers.trace as trace_router
from unittest.mock import AsyncMock

client = TestClient(app)

@pytest.fixture
def mock_trace_dal(monkeypatch):
    monkeypatch.setattr(trace_router, "fetch_trace_tree", AsyncMock(return_value=[]))
    monkeypatch.setattr(trace_router, "fetch_summary", AsyncMock(return_value=None))
    monkeypatch.setattr(trace_router, "fetch_batch_details", AsyncMock(return_value={}))
    monkeypatch.setattr(trace_router, "fetch_impact", AsyncMock(return_value={}))
    monkeypatch.setattr(trace_router, "resolve_token", lambda *args: "token")
    monkeypatch.setattr(trace_router, "check_warehouse_config", lambda: None)
    monkeypatch.setattr(trace_router, "attach_payload_freshness", AsyncMock(side_effect=lambda data, *args, **kwargs: data))
    return {}

def test_trace_endpoint_returns_404_when_no_data(mock_trace_dal):
    response = client.post(
        "/api/trace",
        json={"material_id": "MAT1", "batch_id": "B1"}
    )
    assert response.status_code == 404
    assert "No traceability data found" in response.json()["detail"]

def test_trace_endpoint_returns_200_with_data(monkeypatch, mock_trace_dal):
    rows = [{"material_id": "MAT1", "batch_id": "B1", "parent_material_id": None, "parent_batch_id": None, "depth": 0}]
    monkeypatch.setattr(trace_router, "fetch_trace_tree", AsyncMock(return_value=rows))
    
    response = client.post(
        "/api/trace",
        json={"material_id": "MAT1", "batch_id": "B1"}
    )
    assert response.status_code == 200
    assert "tree" in response.json()
    assert response.json()["total_nodes"] == 1

def test_summary_endpoint_returns_404_when_no_data(mock_trace_dal):
    response = client.post(
        "/api/summary",
        json={"batch_id": "B1"}
    )
    assert response.status_code == 404

def test_summary_endpoint_returns_200_with_data(monkeypatch, mock_trace_dal):
    monkeypatch.setattr(trace_router, "fetch_summary", AsyncMock(return_value={"test": "data"}))
    response = client.post(
        "/api/summary",
        json={"batch_id": "B1"}
    )
    assert response.status_code == 200
    assert response.json() == {"test": "data"}

def test_batch_details_endpoint_returns_404_when_no_summary(mock_trace_dal):
    response = client.post(
        "/api/batch-details",
        json={"material_id": "MAT1", "batch_id": "B1"}
    )
    assert response.status_code == 404

def test_batch_details_endpoint_returns_200_with_data(monkeypatch, mock_trace_dal):
    monkeypatch.setattr(trace_router, "fetch_batch_details", AsyncMock(return_value={"summary": {"id": "B1"}}))
    response = client.post(
        "/api/batch-details",
        json={"material_id": "MAT1", "batch_id": "B1"}
    )
    assert response.status_code == 200
    assert "summary" in response.json()

def test_impact_endpoint_returns_200(mock_trace_dal):
    response = client.post(
        "/api/impact",
        json={"batch_id": "B1"}
    )
    assert response.status_code == 200

def test_trace_endpoint_sql_error(monkeypatch, mock_trace_dal):
    monkeypatch.setattr(trace_router, "fetch_trace_tree", AsyncMock(side_effect=RuntimeError("SQL Error")))
    response = client.post(
        "/api/trace",
        json={"material_id": "MAT1", "batch_id": "B1"}
    )
    assert response.status_code == 500

def test_summary_endpoint_sql_error(monkeypatch, mock_trace_dal):
    monkeypatch.setattr(trace_router, "fetch_summary", AsyncMock(side_effect=RuntimeError("SQL Error")))
    response = client.post(
        "/api/summary",
        json={"batch_id": "B1"}
    )
    assert response.status_code == 500

def test_batch_details_endpoint_sql_error(monkeypatch, mock_trace_dal):
    monkeypatch.setattr(trace_router, "fetch_batch_details", AsyncMock(side_effect=RuntimeError("SQL Error")))
    response = client.post(
        "/api/batch-details",
        json={"material_id": "MAT1", "batch_id": "B1"}
    )
    assert response.status_code == 500

def test_impact_endpoint_sql_error(monkeypatch, mock_trace_dal):
    monkeypatch.setattr(trace_router, "fetch_impact", AsyncMock(side_effect=RuntimeError("SQL Error")))
    response = client.post(
        "/api/impact",
        json={"batch_id": "B1"}
    )
    assert response.status_code == 500
