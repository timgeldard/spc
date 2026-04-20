import pytest
from fastapi.testclient import TestClient
from backend.main import app
import backend.routers.spc_charts as charts_router
from unittest.mock import AsyncMock

client = TestClient(app)

@pytest.fixture
def mock_charts_dal(monkeypatch):
    mocks = {
        "fetch_chart_data_page": AsyncMock(return_value={"data": [], "next_cursor": None, "has_more": False}),
        "fetch_data_quality_summary": AsyncMock(return_value={}),
        "fetch_control_limits": AsyncMock(return_value={"cl": 10, "ucl": 12, "lcl": 8}),
        "fetch_p_chart_data": AsyncMock(return_value={"data": []}),
        "fetch_count_chart_data": AsyncMock(return_value={"data": []}),
        "fetch_locked_limits": AsyncMock(return_value=None),
        "save_locked_limits": AsyncMock(return_value={"id": "LOCKED-1"}),
        "delete_locked_limits": AsyncMock(return_value={"deleted": True}),
    }
    for name, m in mocks.items():
        monkeypatch.setattr(charts_router, name, m)
    
    monkeypatch.setattr(charts_router, "resolve_token", lambda *args: "token")
    monkeypatch.setattr(charts_router, "check_warehouse_config", lambda: None)
    monkeypatch.setattr(charts_router, "attach_data_freshness", AsyncMock(side_effect=lambda data, *args, **kwargs: data))
    return type("Mocks", (), mocks)


def test_chart_data_endpoint(mock_charts_dal):
    response = client.post(
        "/api/spc/chart-data",
        json={"material_id": "MAT1", "mic_id": "MIC1"}
    )
    assert response.status_code == 200
    assert "data" in response.json()
    mock_charts_dal.fetch_chart_data_page.assert_called_once()
    args, kwargs = mock_charts_dal.fetch_chart_data_page.call_args
    # token, material_id, mic_id, ...
    assert args[1] == "MAT1"
    assert args[2] == "MIC1"

def test_chart_data_endpoint_negative():
    response = client.post(
        "/api/spc/chart-data",
        json={"mic_id": "MIC1"}
    )
    assert response.status_code == 422

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
    mock_charts_dal.fetch_control_limits.assert_called_once()
    args, kwargs = mock_charts_dal.fetch_control_limits.call_args
    assert args[1] == "MAT1"
    assert args[2] == "MIC1"
    assert args[3] == "P1"
    resp_data = response.json()
    assert "control_limits" in resp_data
    assert "cl" in resp_data["control_limits"]

def test_p_chart_data_endpoint(mock_charts_dal):
    response = client.post(
        "/api/spc/p-chart-data",
        json={"material_id": "MAT1", "mic_id": "MIC1"}
    )
    assert response.status_code == 200
    mock_charts_dal.fetch_p_chart_data.assert_called_once()
    args, kwargs = mock_charts_dal.fetch_p_chart_data.call_args
    assert args[1] == "MAT1"
    assert args[2] == "MIC1"
    resp_data = response.json()
    assert "points" in resp_data
    assert "data" in resp_data["points"]

def test_count_chart_data_endpoint(mock_charts_dal):
    response = client.post(
        "/api/spc/count-chart-data",
        json={"material_id": "MAT1", "mic_id": "MIC1", "chart_subtype": "u"}
    )
    assert response.status_code == 200
    mock_charts_dal.fetch_count_chart_data.assert_called_once()

def test_locked_limits_endpoints(mock_charts_dal):
    # GET
    response = client.get("/api/spc/locked-limits?material_id=MAT1&mic_id=MIC1")
    assert response.status_code == 200
    mock_charts_dal.fetch_locked_limits.assert_called_once()
    
    # POST
    payload = {
        "material_id": "MAT1", "mic_id": "MIC1", "chart_type": "imr",
        "cl": 10, "ucl": 12, "lcl": 8
    }
    response = client.post("/api/spc/locked-limits", json=payload)
    assert response.status_code == 200
    mock_charts_dal.save_locked_limits.assert_called_once()
    assert response.json()["id"] == "LOCKED-1" or "id" in response.json()
    
    # DELETE
    response = client.request(
        "DELETE", "/api/spc/locked-limits",
        json={"material_id": "MAT1", "mic_id": "MIC1", "chart_type": "imr"}
    )
    assert response.status_code == 200
    mock_charts_dal.delete_locked_limits.assert_called_once()
