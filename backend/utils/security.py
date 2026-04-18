"""Origin-header enforcement for state-mutating requests.

The app is served behind the Databricks Apps proxy as a single same-origin
surface: the React SPA and the FastAPI routes share a host. Token passthrough
via `x-forwarded-access-token` already defeats most CSRF attacks (browsers
cannot set that header cross-origin), but a defence-in-depth Origin check on
mutating methods is cheap and catches misrouting, proxy misconfiguration, or a
future deployment that accidentally disables token passthrough.

Behaviour:
- GET/HEAD/OPTIONS are never checked — they are safe by HTTP semantics.
- Other methods require `Origin` (or `Referer`) to match the request's host.
- `SPC_ALLOWED_ORIGINS` (comma-separated) extends the allowlist — intended for
  integration tests that hit the API from a different host.
- Missing Origin/Referer is allowed for backend-to-backend clients (no browser
  in the loop), which are already authenticated via Bearer token.
"""

from __future__ import annotations

import logging
import os
from typing import Iterable
from urllib.parse import urlparse

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse
from starlette.types import ASGIApp

_SAFE_METHODS = {"GET", "HEAD", "OPTIONS"}
_log = logging.getLogger(__name__)


def _parse_env_allowed_origins() -> set[str]:
    raw = os.environ.get("SPC_ALLOWED_ORIGINS", "").strip()
    if not raw:
        return set()
    return {o.strip().rstrip("/") for o in raw.split(",") if o.strip()}


def _origin_host(origin_header: str) -> str | None:
    if not origin_header:
        return None
    try:
        parsed = urlparse(origin_header)
    except ValueError:
        return None
    if not parsed.netloc:
        return None
    return parsed.netloc.lower()


class SameOriginMiddleware(BaseHTTPMiddleware):
    """Reject mutating requests whose Origin/Referer does not match Host."""

    def __init__(self, app: ASGIApp, extra_allowed: Iterable[str] | None = None) -> None:
        super().__init__(app)
        self._static_allowed: set[str] = set()
        for origin in extra_allowed or ():
            host = _origin_host(origin) or origin.strip().lower().rstrip("/")
            if host:
                self._static_allowed.add(host)

    async def dispatch(self, request: Request, call_next):
        if request.method.upper() in _SAFE_METHODS:
            return await call_next(request)

        host = request.headers.get("host", "").lower().strip()
        origin_header = request.headers.get("origin") or ""
        referer_header = request.headers.get("referer") or ""

        origin_host = _origin_host(origin_header) or _origin_host(referer_header)
        if origin_host is None:
            # Non-browser client (CLI, backend-to-backend) — authenticated via
            # Bearer token, not by a browser session, so CSRF isn't in scope.
            return await call_next(request)

        allowed = self._static_allowed | _parse_env_allowed_origins()
        if origin_host == host or origin_host in allowed:
            return await call_next(request)

        _log.warning(
            "cross_origin_mutation_blocked method=%s path=%s host=%s origin=%s",
            request.method,
            request.url.path,
            host,
            origin_host,
        )
        return JSONResponse(
            status_code=403,
            content={
                "detail": "Cross-origin mutation blocked",
                "origin": origin_host,
            },
        )
