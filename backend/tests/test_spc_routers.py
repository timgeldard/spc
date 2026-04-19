import asyncio
from types import SimpleNamespace

from fastapi.testclient import TestClient
from fastapi.responses import JSONResponse
from starlette.requests import Request as StarletteRequest

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
    assert sorted(body.keys()) == ["count", "data", "data_truncated", "has_more", "limit", "next_cursor", "normality", "spec_drift", "stratified", "stratify_by"]
    assert body["count"] == 1
    assert body["data"][0]["batch_id"] == "B1"


def test_control_limits_response_shape(monkeypatch):
    async def fake_fetch_control_limits(*_args, **_kwargs):
        return {
            "cl": 10.5,
            "ucl": 12.1,
            "lcl": 8.9,
            "sigma_within": 0.4,
            "cpk": 1.33,
            "ppk": 1.21,
        }

    async def fake_attach_data_freshness(payload, *_args, **_kwargs):
        return payload

    monkeypatch.setattr(spc_charts, "resolve_token", lambda *_args, **_kwargs: "token")
    monkeypatch.setattr(spc_charts, "check_warehouse_config", lambda: None)
    monkeypatch.setattr(spc_charts, "fetch_control_limits", fake_fetch_control_limits)
    monkeypatch.setattr(spc_charts, "attach_data_freshness", fake_attach_data_freshness)

    response = client.post(
        "/api/spc/control-limits",
        headers={"x-forwarded-access-token": "token"},
        json={"material_id": "MAT-1", "mic_id": "MIC-1"},
    )

    assert response.status_code == 200
    assert response.json()["control_limits"]["cl"] == 10.5


def test_p_chart_data_uses_attribute_subgroup_freshness(monkeypatch):
    captured = {}

    async def fake_fetch_p_chart_data(*_args, **_kwargs):
        return [{"batch_id": "B1", "batch_seq": 1, "p_value": 0.2}]

    async def fake_attach_data_freshness(payload, _token, sources, **_kwargs):
        captured["payload"] = payload
        captured["sources"] = sources
        return payload

    monkeypatch.setattr(spc_charts, "resolve_token", lambda *_args, **_kwargs: "token")
    monkeypatch.setattr(spc_charts, "check_warehouse_config", lambda: None)
    monkeypatch.setattr(spc_charts, "fetch_p_chart_data", fake_fetch_p_chart_data)
    monkeypatch.setattr(spc_charts, "attach_data_freshness", fake_attach_data_freshness)

    response = client.post(
        "/api/spc/p-chart-data",
        headers={"x-forwarded-access-token": "token"},
        json={"material_id": "MAT-1", "mic_id": "MIC-1"},
    )

    assert response.status_code == 200
    assert captured["sources"] == ["spc_attribute_subgroup_mv"]


def test_count_chart_data_uses_attribute_subgroup_freshness(monkeypatch):
    captured = {}

    async def fake_fetch_count_chart_data(*_args, **_kwargs):
        return [{"batch_id": "B1", "batch_seq": 1, "defect_count": 2}]

    async def fake_attach_data_freshness(payload, _token, sources, **_kwargs):
        captured["payload"] = payload
        captured["sources"] = sources
        return payload

    monkeypatch.setattr(spc_charts, "resolve_token", lambda *_args, **_kwargs: "token")
    monkeypatch.setattr(spc_charts, "check_warehouse_config", lambda: None)
    monkeypatch.setattr(spc_charts, "fetch_count_chart_data", fake_fetch_count_chart_data)
    monkeypatch.setattr(spc_charts, "attach_data_freshness", fake_attach_data_freshness)

    response = client.post(
        "/api/spc/count-chart-data",
        headers={"x-forwarded-access-token": "token"},
        json={"material_id": "MAT-1", "mic_id": "MIC-1", "chart_subtype": "c"},
    )

    assert response.status_code == 200
    assert captured["sources"] == ["spc_attribute_subgroup_mv"]


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
    async def fake_run_sql_async(_token, _statement, **_kwargs):
        return [{"ok": 1}]

    async def fake_assert_gold_view_schema(*_args, **_kwargs):
        return SimpleNamespace(ok=True, version="v1", as_dict=lambda: {"ok": True})

    monkeypatch.setattr(main, "check_warehouse_config", lambda: "/sql/1.0/warehouses/test")
    monkeypatch.setattr(main, "run_sql_async", fake_run_sql_async)
    monkeypatch.setattr(main, "assert_gold_view_schema", fake_assert_gold_view_schema)
    monkeypatch.setenv("DATABRICKS_READINESS_TOKEN", "ready-token")

    response = client.get("/api/ready")

    assert response.status_code == 200
    assert response.json()["status"] == "ready"
    assert response.json()["checks"]["sql_warehouse"] == "ok"


def test_ready_sanitizes_sql_probe_failures(monkeypatch):
    async def fake_run_sql_async(_token, _statement, **_kwargs):
        raise RuntimeError("sensitive warehouse host detail")

    monkeypatch.setattr(main, "check_warehouse_config", lambda: "/sql/1.0/warehouses/test")
    monkeypatch.setattr(main, "run_sql_async", fake_run_sql_async)
    monkeypatch.setenv("DATABRICKS_READINESS_TOKEN", "ready-token")

    response = client.get("/api/ready")

    assert response.status_code == 503
    body = response.json()["detail"]
    assert body["reason"] == "sql_warehouse_unreachable"
    assert body["message"] == "An internal error occurred while reaching the SQL warehouse."


def test_latency_middleware_alerts_when_budget_exceeded(monkeypatch):
    request = StarletteRequest(
        {
            "type": "http",
            "http_version": "1.1",
            "method": "GET",
            "path": "/api/spc/scorecard",
            "headers": [],
            "query_string": b"",
            "scheme": "http",
            "server": ("testserver", 80),
            "client": ("testclient", 12345),
            "root_path": "",
        }
    )
    alerts = []
    logs = []

    async def fake_call_next(_request):
        return JSONResponse({"ok": True}, status_code=200)

    monkeypatch.setattr(main, "send_operational_alert", lambda **kwargs: alerts.append(kwargs))
    monkeypatch.setitem(main._LATENCY_BUDGETS_MS, "/api/spc/scorecard", -1)
    monkeypatch.setattr(main.logger, "info", lambda *args, **kwargs: logs.append((args, kwargs)))

    response = asyncio.run(main.latency_middleware(request, fake_call_next))

    assert response.status_code == 200
    assert alerts
    assert alerts[0]["request_path"] == "/api/spc/scorecard"
    assert alerts[0]["subject"] == "Latency budget exceeded"
    assert logs


def test_latency_budget_defaults_for_non_hot_paths():
    assert main._latency_budget_ms_for_path("/api/health") == 10_000
