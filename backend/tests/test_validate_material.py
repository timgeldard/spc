from fastapi import HTTPException
from fastapi.testclient import TestClient

import backend.main as main_module
import backend.routers.spc as spc_module


client = TestClient(main_module.app)


def test_validate_material_returns_valid_when_freshness_temporarily_unavailable(monkeypatch):
    monkeypatch.setattr(spc_module, "resolve_token", lambda *_args, **_kwargs: "token")
    monkeypatch.setattr(spc_module, "check_warehouse_config", lambda: "/sql/1.0/warehouses/test")

    async def fake_run_sql_async(_token, _query, _params):
        return [{"material_id": "MAT-1", "material_name": "Material 1"}]

    async def failing_attach(_payload, _token, _source_views, *, request_path=None):
        raise HTTPException(
            status_code=503,
            detail={"message": "Data freshness lookup failed", "error_id": "fresh-123"},
        )

    monkeypatch.setattr(spc_module, "run_sql_async", fake_run_sql_async)
    monkeypatch.setattr(spc_module, "attach_data_freshness", failing_attach)

    response = client.post(
        "/api/spc/validate-material",
        headers={"x-forwarded-access-token": "not-a-real-jwt"},
        json={"material_id": "MAT-1"},
    )

    assert response.status_code == 200
    body = response.json()
    assert body["valid"] is True
    assert body["material_id"] == "MAT-1"
    assert body["material_name"] == "Material 1"
    assert body["data_freshness"] is None
    assert body["data_freshness_warning"]["message"] == "Data freshness lookup failed"
