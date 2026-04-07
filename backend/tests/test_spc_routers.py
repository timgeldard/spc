from fastapi.testclient import TestClient

from backend import main
from backend.main import app
from backend.routers import spc_charts, trace


client = TestClient(app)


def test_chart_data_returns_401_when_token_missing():
    response = client.post(
        "/api/spc/chart-data",
        json={"material_id": "MAT-1", "mic_id": "MIC-1"},
    )

    assert response.status_code == 401


def test_chart_data_rejects_invalid_cursor(monkeypatch):
    monkeypatch.setattr(spc_charts, "resolve_token", lambda *_args, **_kwargs: "token")
    monkeypatch.setattr(spc_charts, "check_warehouse_config", lambda: None)

    response = client.post(
        "/api/spc/chart-data?cursor=bad-cursor",
        headers={"x-forwarded-access-token": "token"},
        json={"material_id": "MAT-1", "mic_id": "MIC-1"},
    )

    assert response.status_code == 422
    assert "cursor must be formatted as" in response.json()["detail"]


def test_chart_data_rejects_invalid_stratify_by():
    response = client.post(
        "/api/spc/chart-data",
        headers={"x-forwarded-access-token": "token"},
        json={"material_id": "MAT-1", "mic_id": "MIC-1", "stratify_by": "bad_column"},
    )

    assert response.status_code == 422


def test_chart_data_response_shape(monkeypatch):
    async def fake_fetch_chart_data_page(*_args, **_kwargs):
        return {
            "data": [{"batch_id": "B1", "batch_seq": 1, "sample_seq": 1, "value": 10.0}],
            "next_cursor": None,
            "has_more": False,
        }

    async def fake_attach_data_freshness(payload, *_args, **_kwargs):
        return payload

    monkeypatch.setattr(spc_charts, "resolve_token", lambda *_args, **_kwargs: "token")
    monkeypatch.setattr(spc_charts, "check_warehouse_config", lambda: None)
    monkeypatch.setattr(spc_charts, "fetch_chart_data_page", fake_fetch_chart_data_page)
    monkeypatch.setattr(spc_charts, "attach_data_freshness", fake_attach_data_freshness)

    response = client.post(
        "/api/spc/chart-data",
        headers={"x-forwarded-access-token": "token"},
        json={"material_id": "MAT-1", "mic_id": "MIC-1"},
    )

    assert response.status_code == 200
    body = response.json()
    assert sorted(body.keys()) == ["count", "data", "data_truncated", "has_more", "limit", "next_cursor", "normality", "stratified", "stratify_by"]
    assert body["count"] == 1
    assert body["data"][0]["batch_id"] == "B1"


def test_trace_rejects_oversized_material_id():
    response = client.post(
        "/api/trace",
        headers={"x-forwarded-access-token": "token"},
        json={"material_id": "M" * 41, "batch_id": "BATCH-1"},
    )

    assert response.status_code == 422


def test_trace_summary_survives_freshness_failure(monkeypatch):
    async def fake_fetch_summary(*_args, **_kwargs):
        return {"batch_id": "BATCH-1", "summary": {"actual_stock": 10}}

    async def fake_attach_payload_freshness(payload, *_args, **_kwargs):
        return {**payload, "data_freshness": None, "data_freshness_warning": {"message": "Data freshness lookup failed"}}

    monkeypatch.setattr(trace, "resolve_token", lambda *_args, **_kwargs: "token")
    monkeypatch.setattr(trace, "check_warehouse_config", lambda: None)
    monkeypatch.setattr(trace, "fetch_summary", fake_fetch_summary)
    monkeypatch.setattr(trace, "attach_payload_freshness", fake_attach_payload_freshness)

    response = client.post(
        "/api/summary",
        headers={"x-forwarded-access-token": "token"},
        json={"batch_id": "BATCH-1"},
    )

    assert response.status_code == 200
    body = response.json()
    assert body["batch_id"] == "BATCH-1"
    assert body["data_freshness"] is None
    assert body["data_freshness_warning"]["message"] == "Data freshness lookup failed"


def test_ready_returns_503_when_readiness_token_missing(monkeypatch):
    monkeypatch.setattr(main, "check_warehouse_config", lambda: "/sql/1.0/warehouses/test")
    monkeypatch.delenv("DATABRICKS_READINESS_TOKEN", raising=False)

    response = client.get("/api/ready")

    assert response.status_code == 503
    assert response.json()["detail"]["reason"] == "readiness_token_missing"


def test_ready_returns_200_when_sql_probe_succeeds(monkeypatch):
    async def fake_run_sql_async(_token, _statement):
        return [{"ok": 1}]

    monkeypatch.setattr(main, "check_warehouse_config", lambda: "/sql/1.0/warehouses/test")
    monkeypatch.setattr(main, "run_sql_async", fake_run_sql_async)
    monkeypatch.setenv("DATABRICKS_READINESS_TOKEN", "ready-token")

    response = client.get("/api/ready")

    assert response.status_code == 200
    assert response.json()["status"] == "ready"
    assert response.json()["checks"]["sql_warehouse"] == "ok"
