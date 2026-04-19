import pytest
from fastapi.testclient import TestClient
from backend.main import app
import backend.routers.spc_metadata as meta_router
from unittest.mock import AsyncMock

client = TestClient(app)

@pytest.fixture
def mock_meta_dal(monkeypatch):
    monkeypatch.setattr(meta_router, "fetch_materials", AsyncMock(return_value=[]))
    monkeypatch.setattr(meta_router, "fetch_characteristics", AsyncMock(return_value=([], [])))
    monkeypatch.setattr(meta_router, "resolve_token", lambda *args: "token")
    monkeypatch.setattr(meta_router, "check_warehouse_config", lambda: None)
    monkeypatch.setattr(meta_router, "attach_data_freshness", AsyncMock(side_effect=lambda data, *args, **kwargs: data))
    return {}

def test_materials_endpoint(mock_meta_dal):
    # Prefix is /api/spc, route is /materials
    response = client.get("/api/spc/materials")
    assert response.status_code == 200
    assert response.json() == {"materials": []}

def test_characteristics_endpoint(mock_meta_dal):
    # Prefix is /api/spc, route is /characteristics (POST)
    response = client.post(
        "/api/spc/characteristics",
        json={"material_id": "MAT1", "plant_id": "P1"}
    )
    assert response.status_code == 200
    assert response.json() == {"characteristics": [], "attr_characteristics": []}

def test_plants_endpoint(mock_meta_dal, monkeypatch):
    monkeypatch.setattr(meta_router, "fetch_plants", AsyncMock(return_value=[]))
    response = client.get("/api/spc/plants?material_id=MAT1")
    assert response.status_code == 200
    assert "plants" in response.json()

def test_validate_material_endpoint(mock_meta_dal, monkeypatch):
    monkeypatch.setattr(meta_router, "validate_material", AsyncMock(return_value={"material_id": "MAT1", "material_name": "Name"}))
    monkeypatch.setattr(meta_router, "attach_validation_freshness", AsyncMock(side_effect=lambda data, *args, **kwargs: data))
    response = client.post("/api/spc/validate-material", json={"material_id": "MAT1"})
    assert response.status_code == 200
    assert response.json()["valid"] is True
