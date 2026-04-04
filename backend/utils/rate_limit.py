"""
Lightweight in-process rate limiting middleware for FastAPI/Starlette.

Design goals:
- No external dependency requirement at runtime.
- Similar ergonomics to SlowAPI for this project:
    * @limiter.limit("30/minute") decorators on routes
    * app.add_exception_handler(RateLimitExceeded, rate_limit_handler)
    * app.add_middleware(SlowAPIMiddleware)
- Sensible global fallback when route-specific limits are not set.
"""

from __future__ import annotations

import base64
import json
import time
from collections import defaultdict, deque
from dataclasses import dataclass
from threading import Lock
from typing import Callable

from fastapi import Request
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware


class RateLimitExceeded(Exception):
    """Raised when a request exceeds the configured rate limit."""


@dataclass(frozen=True)
class RateLimitRule:
    requests: int
    window_seconds: int


def _parse_limit(limit: str) -> RateLimitRule:
    raw = limit.strip().lower()
    if "/" not in raw:
        raise ValueError(f"Invalid rate limit format: {limit}")

    count_str, period = raw.split("/", 1)
    count = int(count_str)

    aliases = {
        "s": 1,
        "sec": 1,
        "second": 1,
        "seconds": 1,
        "m": 60,
        "min": 60,
        "minute": 60,
        "minutes": 60,
        "h": 3600,
        "hour": 3600,
        "hours": 3600,
    }

    if period not in aliases:
        raise ValueError(f"Unsupported rate limit period: {period}")

    return RateLimitRule(requests=count, window_seconds=aliases[period])


class _Limiter:
    def __init__(self, default_limit: str = "120/minute") -> None:
        self.default_rule = _parse_limit(default_limit)
        self._events: dict[tuple[str, str], deque[float]] = defaultdict(deque)
        self._lock = Lock()

    def limit(self, limit: str) -> Callable:
        rule = _parse_limit(limit)

        def decorator(func: Callable) -> Callable:
            setattr(func, "_rate_limit_rule", rule)
            return func

        return decorator

    def check(self, route_key: str, client_key: str, rule: RateLimitRule | None) -> None:
        active_rule = rule or self.default_rule
        now = time.time()
        window_start = now - active_rule.window_seconds
        bucket_key = (route_key, client_key)

        with self._lock:
            q = self._events[bucket_key]
            while q and q[0] <= window_start:
                q.popleft()
            if len(q) >= active_rule.requests:
                raise RateLimitExceeded(f"Rate limit exceeded for {route_key}")
            q.append(now)


limiter = _Limiter(default_limit="120/minute")


def _extract_client_identity(request: Request) -> str:
    """Identify the rate-limit bucket for a request.

    Priority:
    1. JWT ``sub`` claim from the x-forwarded-access-token header — uniquely
       identifies the Databricks user even behind a reverse proxy.
    2. x-forwarded-for header — identifies the originating IP when the app
       sits behind a load-balancer.
    3. ASGI client host — the direct TCP peer (last-resort fallback).
    """
    token = request.headers.get("x-forwarded-access-token", "")
    if token:
        try:
            # JWT structure: header.payload.signature — all base64url encoded
            payload_b64 = token.split(".")[1]
            # base64url padding
            padding = 4 - len(payload_b64) % 4
            if padding != 4:
                payload_b64 += "=" * padding
            payload = json.loads(base64.urlsafe_b64decode(payload_b64))
            sub = payload.get("sub")
            if sub:
                return f"jwt:{sub}"
        except Exception:
            pass

    forwarded_for = request.headers.get("x-forwarded-for", "")
    if forwarded_for:
        # Take the leftmost (originating) IP when multiple hops are present
        return f"xff:{forwarded_for.split(',')[0].strip()}"

    return request.client.host if request.client else "unknown"


async def rate_limit_handler(request: Request, exc: Exception):
    return JSONResponse(status_code=429, content={"detail": "Rate limit exceeded"})


class SlowAPIMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        endpoint = request.scope.get("endpoint")
        rule = getattr(endpoint, "_rate_limit_rule", None) if endpoint else None

        client = _extract_client_identity(request)
        route_key = request.scope.get("path", "unknown")
        limiter.check(route_key=route_key, client_key=client, rule=rule)

        return await call_next(request)


__all__ = ["limiter", "RateLimitExceeded", "SlowAPIMiddleware", "rate_limit_handler"]
