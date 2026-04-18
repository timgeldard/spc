from fastapi import FastAPI
from fastapi.testclient import TestClient

from backend.utils.security import SameOriginMiddleware


def _make_app() -> FastAPI:
    app = FastAPI()
    app.add_middleware(SameOriginMiddleware)

    @app.get("/read")
    def read():
        return {"ok": True}

    @app.post("/write")
    def write():
        return {"ok": True}

    @app.delete("/delete")
    def delete():
        return {"ok": True}

    return app


def test_get_requests_never_blocked_regardless_of_origin():
    app = _make_app()
    client = TestClient(app)
    r = client.get("/read", headers={"Origin": "https://evil.example.com"})
    assert r.status_code == 200


def test_same_origin_post_allowed():
    app = _make_app()
    client = TestClient(app, base_url="http://testserver")
    r = client.post("/write", headers={"Origin": "http://testserver"})
    assert r.status_code == 200


def test_cross_origin_post_blocked():
    app = _make_app()
    client = TestClient(app, base_url="http://testserver")
    r = client.post("/write", headers={"Origin": "https://evil.example.com"})
    assert r.status_code == 403
    body = r.json()
    assert body["detail"] == "Cross-origin mutation blocked"
    assert body["origin"] == "evil.example.com"


def test_cross_origin_delete_blocked():
    app = _make_app()
    client = TestClient(app, base_url="http://testserver")
    r = client.delete("/delete", headers={"Origin": "https://evil.example.com"})
    assert r.status_code == 403


def test_missing_origin_and_referer_is_allowed_for_non_browser_clients():
    # Backend-to-backend clients (no browser in the loop) don't send Origin;
    # they authenticate via Bearer token, so CSRF is not the right control.
    app = _make_app()
    client = TestClient(app, base_url="http://testserver")
    r = client.post("/write")
    assert r.status_code == 200


def test_env_allowed_origins_override(monkeypatch):
    monkeypatch.setenv("SPC_ALLOWED_ORIGINS", "https://trusted.example.com,https://also-trusted.com")
    app = _make_app()
    client = TestClient(app, base_url="http://testserver")

    r_trusted = client.post("/write", headers={"Origin": "https://trusted.example.com"})
    assert r_trusted.status_code == 200

    r_bad = client.post("/write", headers={"Origin": "https://evil.example.com"})
    assert r_bad.status_code == 403


def test_x_forwarded_host_is_trusted_when_origin_matches():
    """Databricks Apps / ALB / nginx reverse proxies: the browser sees the
    external hostname (in Origin) while the backend sees an internal Host.
    The middleware must accept the request when Origin matches X-Forwarded-Host."""
    app = _make_app()
    client = TestClient(app, base_url="http://internal.service.local")
    r = client.post(
        "/write",
        headers={
            "Origin": "https://spc-abc123.azure.databricksapps.com",
            "X-Forwarded-Host": "spc-abc123.azure.databricksapps.com",
        },
    )
    assert r.status_code == 200


def test_x_forwarded_host_chain_uses_first_hop():
    app = _make_app()
    client = TestClient(app, base_url="http://internal.service.local")
    r = client.post(
        "/write",
        headers={
            "Origin": "https://spc-abc123.azure.databricksapps.com",
            # Chained proxies — only the first entry is the client-facing host.
            "X-Forwarded-Host": "spc-abc123.azure.databricksapps.com, lb.internal",
        },
    )
    assert r.status_code == 200


def test_origin_mismatching_both_host_and_forwarded_still_blocked():
    app = _make_app()
    client = TestClient(app, base_url="http://internal.service.local")
    r = client.post(
        "/write",
        headers={
            "Origin": "https://evil.example.com",
            "X-Forwarded-Host": "spc-abc123.azure.databricksapps.com",
        },
    )
    assert r.status_code == 403


def test_referer_fallback_when_no_origin_header():
    app = _make_app()
    client = TestClient(app, base_url="http://testserver")

    # Referer contains a full URL; same-origin case.
    r_same = client.post("/write", headers={"Referer": "http://testserver/some/path"})
    assert r_same.status_code == 200

    # Cross-origin via Referer.
    r_cross = client.post("/write", headers={"Referer": "https://evil.example.com/"})
    assert r_cross.status_code == 403
