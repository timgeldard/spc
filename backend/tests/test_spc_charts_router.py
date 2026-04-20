import pytest
from fastapi.testclient import TestClient
from backend.main import app
import backend.routers.spc_charts as charts_router
from unittest.mock import AsyncMock

client = TestClient(app)

@pytest.fixture
def mock_charts_dal(monkeypatch):
    monkeypatch.setattr(charts_router, "fetch_chart_data_page", AsyncMock(return_value={"data": [], "next_cursor": None, "has_more": False}))
    monkeypatch.setattr(charts_router, "fetch_data_quality_summary", AsyncMock(return_value={}))
    monkeypatch.setattr(charts_router, "fetch_control_limits", AsyncMock(return_value={}))
    monkeypatch.setattr(charts_router, "fetch_p_chart_data", AsyncMock(return_value=[]))
    monkeypatch.setattr(charts_router, "fetch_count_chart_data", AsyncMock(return_value=[]))
    monkeypatch.setattr(charts_router, "fetch_locked_limits", AsyncMock(return_value=None))
    monkeypatch.setattr(charts_router, "save_locked_limits", AsyncMock(return_value={"saved": True}))
    monkeypatch.setattr(charts_router, "delete_locked_limits", AsyncMock(return_value={"deleted": True}))
    monkeypatch.setattr(charts_router, "resolve_token", lambda *args: "token")
    monkeypatch.setattr(charts_router, "check_warehouse_config", lambda: None)
    monkeypatch.setattr(charts_router, "attach_data_freshness", AsyncMock(side_effect=lambda data, *args, **kwargs: data))
    return {}

def test_chart_data_endpoint(mock_charts_dal):
    response = client.post(
        "/api/spc/chart-data",
        json={"material_id": "MAT1", "mic_id": "MIC1"}
    )
    assert response.status_code == 200
    assert "data" in response.json()

def test_data_quality_endpoint(mock_charts_dal):
    response = client.post(
        "/api/spc/data-quality",
        json={"material_id": "MAT1", "mic_id": "MIC1"}
    )
    assert response.status_code == 200

def test_control_limits_endpoint(mock_charts_dal):
    response = client.post(
        "/api/spc/control-limits",
        json={"material_id": "MAT1", "mic_id": "MIC1", "plant_id": "P1", "chart_type": "imr"}
    )
    assert response.status_code == 200

def test_p_chart_data_endpoint(mock_charts_dal):
    response = client.post(
        "/api/spc/p-chart-data",
        json={"material_id": "MAT1", "mic_id": "MIC1"}
    )
    assert response.status_code == 200

def test_count_chart_data_endpoint(mock_charts_dal):
    response = client.post(
        "/api/spc/count-chart-data",
        json={"material_id": "MAT1", "mic_id": "MIC1", "chart_subtype": "u"}
    )
    assert response.status_code == 200

def test_locked_limits_endpoints(mock_charts_dal):
    # GET
    response = client.get("/api/spc/locked-limits?material_id=MAT1&mic_id=MIC1")
    assert response.status_code == 200
    
    # POST
    response = client.post(
        "/api/spc/locked-limits",
        json={
            "material_id": "MAT1", "mic_id": "MIC1", "chart_type": "imr",
            "cl": 10, "ucl": 12, "lcl": 8
        }
    )
    assert response.status_code == 200
    
    # DELETE
    response = client.request(
        "DELETE", "/api/spc/locked-limits",
        json={"material_id": "MAT1", "mic_id": "MIC1", "chart_type": "imr"}
    )
    assert response.status_code == 200
