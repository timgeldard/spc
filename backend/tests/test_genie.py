import asyncio

import httpx
import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient

from backend.main import app
import backend.routers.genie as genie


client = TestClient(app)


def test_genie_missing_space_id(monkeypatch):
    monkeypatch.setattr(genie, "_GENIE_SPACE_ID", "")

    response = client.post(
        "/api/spc/genie/message",
        headers={"x-forwarded-access-token": "token"},
        json={"message": "hello"},
    )

    assert response.status_code == 503


def test_genie_no_token(monkeypatch):
    monkeypatch.setattr(genie, "_GENIE_SPACE_ID", "space-1")

    response = client.post("/api/spc/genie/message", json={"message": "hello"})

    assert response.status_code == 401


def test_genie_new_conversation_returns_answer(monkeypatch):
    monkeypatch.setattr(genie, "_GENIE_SPACE_ID", "space-1")

    calls = []

    async def fake_api(_token, method, path, body=None, *, timeout_s=None):
        calls.append((method, path, body))
        if path.endswith("/start-conversation"):
            return {"conversation_id": "conv-1", "message_id": "msg-1"}
        return {"status": "COMPLETED", "attachments": [{"text": {"content": "hello from genie"}}]}

    monkeypatch.setattr(genie, "_api", fake_api)

    response = client.post(
        "/api/spc/genie/message",
        headers={"x-forwarded-access-token": "token"},
        json={"message": "hello"},
    )

    assert response.status_code == 200
    assert response.json() == {"answer": "hello from genie", "conversation_id": "conv-1"}
    assert calls[0][1].endswith("/start-conversation")


def test_genie_existing_conversation_uses_correct_path(monkeypatch):
    monkeypatch.setattr(genie, "_GENIE_SPACE_ID", "space-1")

    calls = []

    async def fake_api(_token, method, path, body=None, *, timeout_s=None):
        calls.append((method, path, body))
        if method == "POST":
            return {"id": "msg-2"}
        return {"status": "COMPLETED", "attachments": [{"text": {"content": "ok"}}]}

    monkeypatch.setattr(genie, "_api", fake_api)

    response = client.post(
        "/api/spc/genie/message",
        headers={"x-forwarded-access-token": "token"},
        json={"message": "hello", "conversation_id": "conv-2"},
    )

    assert response.status_code == 200
    assert "/conversations/conv-2/messages" in calls[0][1]


def test_genie_does_not_leak_api_error_body(monkeypatch):
    monkeypatch.setattr(genie, "_GENIE_SPACE_ID", "space-1")

    async def fake_api(*_args, **_kwargs):
        raise HTTPException(status_code=400, detail="Genie API request failed.")

    monkeypatch.setattr(genie, "_api", fake_api)

    response = client.post(
        "/api/spc/genie/message",
        headers={"x-forwarded-access-token": "token"},
        json={"message": "hello"},
    )

    assert response.status_code == 400
    assert "SECRET_TOKEN" not in response.text
    assert "Genie API:" not in response.text


def test_genie_does_not_leak_failed_error_field(monkeypatch):
    monkeypatch.setattr(genie, "_GENIE_SPACE_ID", "space-1")

    async def fake_api(_token, method, path, body=None, *, timeout_s=None):
        if method == "POST":
            return {"conversation_id": "conv-1", "message_id": "msg-1"}
        return {"status": "FAILED", "error": "internal secret detail"}

    monkeypatch.setattr(genie, "_api", fake_api)

    response = client.post(
        "/api/spc/genie/message",
        headers={"x-forwarded-access-token": "token"},
        json={"message": "hello"},
    )

    assert response.status_code == 500
    assert "internal secret detail" not in response.text


def test_genie_timeout_returns_504(monkeypatch):
    monkeypatch.setattr(genie, "_GENIE_SPACE_ID", "space-1")
    monkeypatch.setattr(genie, "_POLL_MAX_ATTEMPTS", 1)
    monkeypatch.setattr(genie, "_POLL_INTERVAL_S", 0)

    async def fake_api(_token, method, path, body=None, *, timeout_s=None):
        if method == "POST":
            return {"conversation_id": "conv-1", "message_id": "msg-1"}
        return {"status": "RUNNING"}

    monkeypatch.setattr(genie, "_api", fake_api)

    response = client.post(
        "/api/spc/genie/message",
        headers={"x-forwarded-access-token": "token"},
        json={"message": "hello"},
    )

    assert response.status_code == 504


def test_genie_applies_absolute_deadline(monkeypatch):
    monkeypatch.setattr(genie, "_GENIE_SPACE_ID", "space-1")
    monkeypatch.setattr(genie, "_POLL_MAX_ATTEMPTS", 2)
    monkeypatch.setattr(genie, "_POLL_INTERVAL_S", 1.5)
    monkeypatch.setattr(genie, "_MAX_TOTAL_WAIT_S", 3.0)

    clock = {"now": 100.0}

    def fake_monotonic():
        return clock["now"]

    async def fake_api(_token, method, path, body=None, *, timeout_s=None):
        if method == "POST":
            clock["now"] += 2.5
            return {"conversation_id": "conv-1", "message_id": "msg-1"}
        clock["now"] += 0.6
        return {"status": "RUNNING"}

    async def fake_sleep(seconds):
        clock["now"] += seconds

    monkeypatch.setattr(genie.time, "monotonic", fake_monotonic)
    monkeypatch.setattr(genie, "_api", fake_api)
    monkeypatch.setattr(genie.asyncio, "sleep", fake_sleep)

    response = client.post(
        "/api/spc/genie/message",
        headers={"x-forwarded-access-token": "token"},
        json={"message": "hello"},
    )

    assert response.status_code == 504


def test_extract_text_current_format():
    assert genie._extract_text({"attachments": [{"text": {"content": "hello"}}]}) == "hello"


def test_extract_text_legacy_format():
    assert genie._extract_text({"attachments": [{"content": {"text": "hi"}}]}) == "hi"


def test_extract_text_falls_back_to_error_field():
    assert genie._extract_text({"attachments": [], "error": "fallback"}) == "fallback"


def test_api_uses_async_httpx_client(monkeypatch):
    captured = {}

    class FakeResponse:
        content = b'{"ok":true}'

        def raise_for_status(self):
            return None

        def json(self):
            return {"ok": True}

    class FakeAsyncClient:
        def __init__(self, *args, **kwargs):
            captured["timeout"] = kwargs.get("timeout")

        async def __aenter__(self):
            return self

        async def __aexit__(self, exc_type, exc, tb):
            return False

        async def request(self, method, url, headers=None, json=None):
            captured["method"] = method
            captured["url"] = url
            captured["headers"] = headers
            captured["json"] = json
            return FakeResponse()

    monkeypatch.setattr(genie, "hostname", lambda: "workspace.example.com")
    monkeypatch.setattr(genie.httpx, "AsyncClient", FakeAsyncClient)

    result = asyncio.run(genie._api("token-1", "POST", "/api/demo", {"hello": "world"}))

    assert result == {"ok": True}
    assert isinstance(captured["timeout"], httpx.Timeout)
    assert captured["method"] == "POST"
    assert captured["url"] == "https://workspace.example.com/api/demo"
    assert captured["headers"]["Authorization"] == "Bearer token-1"
    assert captured["json"] == {"hello": "world"}


def test_api_sanitizes_http_status_failures(monkeypatch):
    class FakeAsyncClient:
        async def __aenter__(self):
            return self

        async def __aexit__(self, exc_type, exc, tb):
            return False

        async def request(self, method, url, headers=None, json=None):
            return httpx.Response(
                403,
                request=httpx.Request(method, url, headers=headers, json=json),
                text="SECRET_TOKEN should not leak",
            )

    monkeypatch.setattr(genie, "hostname", lambda: "workspace.example.com")
    monkeypatch.setattr(genie.httpx, "AsyncClient", lambda *args, **kwargs: FakeAsyncClient())

    with pytest.raises(HTTPException) as exc_info:
        asyncio.run(genie._api("token-1", "GET", "/api/demo"))

    assert exc_info.value.status_code == 403
    assert exc_info.value.detail == "Genie API request failed."


def test_api_maps_upstream_5xx_to_gateway_errors(monkeypatch):
    class FakeAsyncClient:
        async def __aenter__(self):
            return self

        async def __aexit__(self, exc_type, exc, tb):
            return False

        async def request(self, method, url, headers=None, json=None):
            return httpx.Response(
                503,
                request=httpx.Request(method, url, headers=headers, json=json),
                text="upstream unavailable",
            )

    monkeypatch.setattr(genie, "hostname", lambda: "workspace.example.com")
    monkeypatch.setattr(genie.httpx, "AsyncClient", lambda *args, **kwargs: FakeAsyncClient())

    with pytest.raises(HTTPException) as exc_info:
        asyncio.run(genie._api("token-1", "GET", "/api/demo"))

    assert exc_info.value.status_code == 502
    assert exc_info.value.detail == "Genie API request failed."


def test_genie_rejects_malformed_start_conversation_payload(monkeypatch):
    monkeypatch.setattr(genie, "_GENIE_SPACE_ID", "space-1")

    async def fake_api(_token, method, path, body=None, *, timeout_s=None):
        if method == "POST":
            return {"conversation_id": "conv-1"}
        return {"status": "COMPLETED", "attachments": [{"text": {"content": "ok"}}]}

    monkeypatch.setattr(genie, "_api", fake_api)

    response = client.post(
        "/api/spc/genie/message",
        headers={"x-forwarded-access-token": "token"},
        json={"message": "hello"},
    )

    assert response.status_code == 502
    assert "unexpected empty or malformed response" in response.text
