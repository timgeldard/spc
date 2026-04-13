import asyncio
import json

from starlette.requests import Request

from fastapi.testclient import TestClient

from backend.main import app
import backend.main as main_module


client = TestClient(app)


def test_health_returns_200():
    response = client.get("/api/health")

    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_health_debug_hidden_in_production(monkeypatch):
    monkeypatch.setattr(main_module, "ENABLE_DEBUG_ENDPOINTS", False)

    response = client.get("/api/health/debug")

    assert response.status_code == 404


def test_health_debug_visible_in_development(monkeypatch):
    monkeypatch.setattr(main_module, "ENABLE_DEBUG_ENDPOINTS", True)
    monkeypatch.setattr(main_module, "resolve_token", lambda *_args, **_kwargs: "token")

    response = client.get("/api/health/debug", headers={"x-forwarded-access-token": "token"})

    assert response.status_code == 200
    body = response.json()
    assert "databricks_host" in body
    assert "warehouse_http_path" in body
    assert "trace_catalog" in body
    assert "trace_schema" in body
    assert "static_dir_exists" in body


def test_test_query_hidden_in_production(monkeypatch):
    monkeypatch.setattr(main_module, "ENABLE_DEBUG_ENDPOINTS", False)

    response = client.get("/api/test-query")

    assert response.status_code == 404


def test_global_exception_handler_returns_safe_500():
    request = Request({"type": "http", "method": "GET", "path": "/api/test", "headers": []})

    response = asyncio.run(main_module.global_exception_handler(request, RuntimeError("secret details")))

    assert response.status_code == 500
    body = response.body
    assert b"secret details" not in body
    assert b"error_id" in body
    body_json = json.loads(body)
    assert body_json["detail"] == "Internal server error"
    assert body_json.get("error_id")
