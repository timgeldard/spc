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

    async def fake_api(_token, method, path, body=None):
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

    async def fake_api(_token, method, path, body=None):
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

    async def fake_api(_token, method, path, body=None):
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

    async def fake_api(_token, method, path, body=None):
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


def test_extract_text_current_format():
    assert genie._extract_text({"attachments": [{"text": {"content": "hello"}}]}) == "hello"


def test_extract_text_legacy_format():
    assert genie._extract_text({"attachments": [{"content": {"text": "hi"}}]}) == "hi"


def test_extract_text_falls_back_to_error_field():
    assert genie._extract_text({"attachments": [], "error": "fallback"}) == "fallback"
