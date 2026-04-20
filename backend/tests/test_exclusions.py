from fastapi import HTTPException
from fastapi.testclient import TestClient

from backend.main import app
import backend.routers.exclusions as exclusions


client = TestClient(app)


def test_save_exclusions_no_token():
    response = client.post(
        "/api/spc/exclusions",
        json={
            "material_id": "MAT-1",
            "mic_id": "MIC-1",
            "chart_type": "imr",
            "justification": "test justification",
            "excluded_points": [],
        },
    )

    assert response.status_code == 401


def test_save_exclusions_invalid_chart_type():
    response = client.post(
        "/api/spc/exclusions",
        headers={"x-forwarded-access-token": "token"},
        json={
            "material_id": "MAT-1",
            "mic_id": "MIC-1",
            "chart_type": "bad_chart",
            "justification": "test justification",
            "excluded_points": [],
        },
    )

    assert response.status_code == 422


def test_save_exclusions_blank_justification():
    response = client.post(
        "/api/spc/exclusions",
        headers={"x-forwarded-access-token": "token"},
        json={
            "material_id": "MAT-1",
            "mic_id": "MIC-1",
            "chart_type": "imr",
            "justification": "  ",
            "excluded_points": [],
        },
    )

    assert response.status_code == 422


def test_save_exclusions_persists_snapshot(monkeypatch):
    captured = {}

    async def fake_insert(_token, payload):
        captured["payload"] = payload

    async def fake_run_sql_async(*_args, **_kwargs):
        return [{"user_id": "qa@example.com", "event_ts": "2026-04-13 08:00:00"}]

    monkeypatch.setattr(exclusions, "resolve_token", lambda *_args, **_kwargs: "token")
    monkeypatch.setattr(exclusions, "check_warehouse_config", lambda: None)
    monkeypatch.setattr(exclusions, "insert_spc_exclusion_snapshot", fake_insert)
    monkeypatch.setattr(exclusions, "run_sql_async", fake_run_sql_async)

    response = client.post(
        "/api/spc/exclusions",
        headers={"x-forwarded-access-token": "token"},
        json={
            "material_id": "MAT-1",
            "mic_id": "MIC-1",
            "chart_type": "imr",
            "justification": "Operator removed obvious transposition error",
            "excluded_points": [{"batch_id": "B1", "sample_seq": 1}],
        },
    )

    assert response.status_code == 200
    body = response.json()
    assert body["saved"] is True
    assert body["event_id"]
    assert captured["payload"]["excluded_count"] == 1


def test_save_exclusions_actor_lookup_failure(monkeypatch):
    async def fake_insert(_token, payload):
        return None

    async def fake_run_sql_async(*_args, **_kwargs):
        raise RuntimeError("warehouse unavailable")

    monkeypatch.setattr(exclusions, "resolve_token", lambda *_args, **_kwargs: "token")
    monkeypatch.setattr(exclusions, "check_warehouse_config", lambda: None)
    monkeypatch.setattr(exclusions, "insert_spc_exclusion_snapshot", fake_insert)
    monkeypatch.setattr(exclusions, "run_sql_async", fake_run_sql_async)

    response = client.post(
        "/api/spc/exclusions",
        headers={"x-forwarded-access-token": "token"},
        json={
            "material_id": "MAT-1",
            "mic_id": "MIC-1",
            "chart_type": "imr",
            "justification": "Operator removed obvious transposition error",
            "excluded_points": [{"batch_id": "B1", "sample_seq": 1}],
        },
    )

    assert response.status_code == 200
    body = response.json()
    assert body["saved"] is True
    assert body["user_id"] is None


def test_handle_sql_error_permission_denied():
    with pytest_http_exception(403) as exc:
        exclusions._handle_sql_error(RuntimeError("permission denied"))
    assert "Access denied" in exc.detail


def test_handle_sql_error_table_not_found():
    with pytest_http_exception(503) as exc:
        exclusions._handle_sql_error(RuntimeError("table or view not found"))
    assert "exclusions audit table" in exc.detail.lower()


def test_handle_sql_error_unknown_masks_detail():
    with pytest_http_exception(500) as exc:
        exclusions._handle_sql_error(RuntimeError("connection string secret"))
    assert "secret" not in exc.detail


class pytest_http_exception:
    def __init__(self, expected_status: int):
        self.expected_status = expected_status
        self.detail = ""

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc, _tb):
        assert exc_type is HTTPException
        assert exc is not None
        assert exc.status_code == self.expected_status
        self.detail = str(exc.detail)
        return True

def test_get_exclusions_returns_none_when_empty(monkeypatch):
    monkeypatch.setattr(exclusions, "resolve_token", lambda *args: "token")
    monkeypatch.setattr(exclusions, "check_warehouse_config", lambda: None)
    
    async def fake_run_sql_async(*args, **kwargs):
        return []
    monkeypatch.setattr(exclusions, "run_sql_async", fake_run_sql_async)
    
    response = client.get(
        "/api/spc/exclusions?material_id=M1&mic_id=MIC1",
        headers={"x-forwarded-access-token": "token"}
    )
    assert response.status_code == 200
    assert response.json()["exclusions"] is None

def test_save_exclusions_sql_error(monkeypatch):
    monkeypatch.setattr(exclusions, "resolve_token", lambda *args: "token")
    monkeypatch.setattr(exclusions, "check_warehouse_config", lambda: None)
    
    async def fake_insert(*args, **kwargs):
        raise RuntimeError("SQL Error")
    monkeypatch.setattr(exclusions, "insert_spc_exclusion_snapshot", fake_insert)
    
    response = client.post(
        "/api/spc/exclusions",
        headers={"x-forwarded-access-token": "token"},
        json={
            "material_id": "M1", "mic_id": "MIC1", "justification": "Too low",
            "excluded_points": [{"batch_id": "B1", "sample_seq": 1}]
        }
    )
    assert response.status_code == 500
