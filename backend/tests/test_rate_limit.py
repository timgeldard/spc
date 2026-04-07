from fastapi import Request

from backend.utils.rate_limit import _extract_client_identity


def _request(headers: dict[str, str], client_host: str = "127.0.0.1") -> Request:
    scope = {
        "type": "http",
        "headers": [
            (key.lower().encode("latin-1"), value.encode("latin-1"))
            for key, value in headers.items()
        ],
        "client": (client_host, 12345),
    }
    return Request(scope)


def test_extract_client_identity_prefers_token_hash():
    request = _request({"x-forwarded-access-token": "header.payload.signature"})
    identity = _extract_client_identity(request)

    assert identity.startswith("token:")
    assert "payload" not in identity


def test_extract_client_identity_uses_leftmost_forwarded_ip():
    request = _request({"x-forwarded-for": "198.51.100.12, 10.0.0.9"})

    assert _extract_client_identity(request) == "xff:198.51.100.12"


def test_limiter_evicts_oldest_bucket_when_capacity_reached():
    from backend.utils.rate_limit import _Limiter

    limiter = _Limiter(default_limit="1/minute", max_buckets=2)
    limiter.check("/a", "client-1", None)
    limiter.check("/a", "client-2", None)
    limiter.check("/a", "client-3", None)

    assert len(limiter._events) <= 2
