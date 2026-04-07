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

import hashlib
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
    def __init__(self, default_limit: str = "120/minute", max_buckets: int = 10_000) -> None:
        self.default_rule = _parse_limit(default_limit)
        self._events: dict[tuple[str, str], deque[float]] = defaultdict(deque)
        self._last_seen: dict[tuple[str, str], float] = {}
        self.max_buckets = max_buckets
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
            self._purge_inactive_buckets(window_start)
            if bucket_key not in self._events and len(self._events) >= self.max_buckets:
                self._evict_oldest_bucket()
            q = self._events[bucket_key]
            while q and q[0] <= window_start:
                q.popleft()
            if len(q) >= active_rule.requests:
                raise RateLimitExceeded(f"Rate limit exceeded for {route_key}")
            q.append(now)
            self._last_seen[bucket_key] = now

    def _purge_inactive_buckets(self, window_start: float) -> None:
        stale_keys: list[tuple[str, str]] = []
        for bucket_key, events in self._events.items():
            while events and events[0] <= window_start:
                events.popleft()
            if not events:
                stale_keys.append(bucket_key)
        for bucket_key in stale_keys:
            self._events.pop(bucket_key, None)
            self._last_seen.pop(bucket_key, None)

    def _evict_oldest_bucket(self) -> None:
        if not self._last_seen:
            return
        oldest_key = min(self._last_seen, key=self._last_seen.get)
        self._events.pop(oldest_key, None)
        self._last_seen.pop(oldest_key, None)


limiter = _Limiter(default_limit="120/minute")


def _extract_client_identity(request: Request) -> str:
    """Identify the rate-limit bucket for a request.

    Priority:
    1. Hash of the Databricks passthrough token — stable per user session
       without trusting unverifiable JWT claims.
    2. x-forwarded-for header — identifies the originating IP when the app
       sits behind a load-balancer.
    3. ASGI client host — the direct TCP peer (last-resort fallback).
    """
    token = request.headers.get("x-forwarded-access-token", "")
    if token:
        token_hash = hashlib.sha256(token.encode("utf-8")).hexdigest()[:24]
        return f"token:{token_hash}"

    forwarded_for = request.headers.get("x-forwarded-for", "")
    if forwarded_for:
        forwarded_chain = [entry.strip() for entry in forwarded_for.split(",") if entry.strip()]
        if forwarded_chain:
            return f"xff:{forwarded_chain[0]}"

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
