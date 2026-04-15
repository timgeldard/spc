"""
Shared database utilities for the SPC App backend.

Provides the single implementation of:
  - run_sql()              — parameterized SQL via Databricks REST API
  - resolve_token()        — x-forwarded-access-token / Bearer fallback
  - check_warehouse_config() — validate DATABRICKS_WAREHOUSE_HTTP_PATH is set
  - tbl()                  — fully-qualified backtick-quoted table reference
  - sql_param()            — build a named STRING parameter dict

Both backend/main.py and backend/routers/spc.py import from here so that
security fixes (e.g. parameterization) only need to be applied once.
"""

import asyncio
import hashlib
import json
import logging
import os
import re
import threading
import time
import uuid
import urllib.error
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from copy import deepcopy
from typing import Optional, Protocol

from fastapi import HTTPException
try:
    from databricks import sql as databricks_sql
except ImportError:  # pragma: no cover - optional until connector is installed
    databricks_sql = None
try:
    from cachetools import TTLCache
except ImportError:  # pragma: no cover - local-dev fallback until deps are installed
    class TTLCache(dict):
        """Minimal TTL cache fallback matching the small API surface we use."""

        def __init__(self, maxsize: int, ttl: int):
            super().__init__()
            self.maxsize = maxsize
            self.ttl = ttl
            self._expires: dict[str, float] = {}

        def get(self, key, default=None):
            expires_at = self._expires.get(key)
            if expires_at is not None and expires_at <= time.monotonic():
                self.pop(key, None)
                self._expires.pop(key, None)
                return default
            return super().get(key, default)

        def __setitem__(self, key, value):
            if key not in self and len(self) >= self.maxsize:
                oldest_key = min(self._expires, key=self._expires.get, default=None)
                if oldest_key is not None:
                    self.pop(oldest_key, None)
                    self._expires.pop(oldest_key, None)
            super().__setitem__(key, value)
            self._expires[key] = time.monotonic() + self.ttl

_SQL_MAX_WORKERS = max(1, int(os.environ.get("SPC_SQL_MAX_WORKERS", "20")))
_SQL_POLL_MAX_ATTEMPTS = max(1, int(os.environ.get("SPC_SQL_POLL_MAX_ATTEMPTS", "60")))
_SQL_POLL_INITIAL_DELAY_S = max(1, int(os.environ.get("SPC_SQL_POLL_INITIAL_DELAY_S", "2")))
_SQL_POLL_MAX_DELAY_S = max(_SQL_POLL_INITIAL_DELAY_S, int(os.environ.get("SPC_SQL_POLL_MAX_DELAY_S", "30")))

_sql_executor = ThreadPoolExecutor(max_workers=_SQL_MAX_WORKERS, thread_name_prefix="sql")
_sql_cache = TTLCache(maxsize=100, ttl=300)
_sql_cache_lock = threading.Lock()
_freshness_cache: TTLCache = TTLCache(maxsize=50, ttl=300)
_freshness_cache_lock = threading.Lock()
_SQL_CACHE_ROW_LIMIT = 1000
_WRITE_SQL_PREFIXES = ("INSERT", "MERGE", "UPDATE", "DELETE", "ALTER", "CREATE", "DROP", "TRUNCATE", "OPTIMIZE", "VACUUM")
_READ_SQL_PREFIXES = ("SELECT", "WITH", "SHOW", "DESCRIBE")
_SQL_CONNECTOR_PARAM_RE = re.compile(r":([A-Za-z_][A-Za-z0-9_]*)")

logger = logging.getLogger(__name__)
_VIEW_NAME_RE = re.compile(r"^[A-Za-z0-9_]+$")

# ---------------------------------------------------------------------------
# Configuration — read once at import from environment
# ---------------------------------------------------------------------------
DATABRICKS_HOST: str = os.environ.get("DATABRICKS_HOST", "")
WAREHOUSE_HTTP_PATH: str = os.environ.get("DATABRICKS_WAREHOUSE_HTTP_PATH", "")
TRACE_CATALOG: str = os.environ.get("TRACE_CATALOG", "connected_plant_uat")
TRACE_SCHEMA: str = os.environ.get("TRACE_SCHEMA", "gold")


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def hostname() -> str:
    """Return the bare Databricks workspace hostname (no scheme, no trailing slash)."""
    return DATABRICKS_HOST.removeprefix("https://").removeprefix("http://").rstrip("/")


def tbl(name: str) -> str:
    """Return a fully-qualified backtick-quoted table reference."""
    return f"`{TRACE_CATALOG}`.`{TRACE_SCHEMA}`.`{name}`"


def check_warehouse_config() -> str:
    """Raise HTTP 500 if DATABRICKS_WAREHOUSE_HTTP_PATH is not set."""
    if not WAREHOUSE_HTTP_PATH:
        raise HTTPException(
            status_code=500,
            detail="DATABRICKS_WAREHOUSE_HTTP_PATH environment variable is not set.",
        )
    return WAREHOUSE_HTTP_PATH


def resolve_token(
    x_forwarded_access_token: Optional[str],
    authorization: Optional[str],
) -> str:
    """
    Resolve the access token from request headers (priority order):
      1. x-forwarded-access-token  — injected by the Databricks Apps proxy
      2. Authorization: Bearer     — for local development / direct API calls
    """
    token = x_forwarded_access_token
    if token is None and authorization and authorization.startswith("Bearer "):
        token = authorization[len("Bearer "):]
    if not token:
        raise HTTPException(
            status_code=401,
            detail=(
                "No access token present. Expected x-forwarded-access-token "
                "header (set by Databricks Apps proxy) or Authorization: Bearer."
            ),
        )
    return token


def sql_param(name: str, value: Optional[object]) -> dict:
    """
    Build a named STRING parameter dict for the Databricks SQL Statement API.

    `None` is preserved so the JSON payload carries a real null instead of the
    string literal "None".

    Usage:
        statement = "SELECT * FROM t WHERE id = :my_id"
        params    = [sql_param("my_id", some_value)]
    """
    return {"name": name, "value": str(value) if value is not None else None, "type": "STRING"}


def classify_sql_runtime_error(
    exc: Exception,
    *,
    missing_table_detail: Optional[str] = None,
) -> Optional[HTTPException]:
    """Map Databricks SQL runtime failures to client-facing HTTP errors."""
    msg = str(exc).lower()
    if "permission denied" in msg or "no access" in msg or "403" in msg:
        return HTTPException(status_code=403, detail="Access denied by Unity Catalog policy.")
    if "401" in msg or "unauthorized" in msg:
        return HTTPException(status_code=401, detail="Token rejected by Databricks.")
    if missing_table_detail and (
        "table or view not found" in msg
        or "does not exist" in msg
        or "doesn't exist" in msg
    ):
        return HTTPException(status_code=503, detail=missing_table_detail)
    return None


def increment_observability_counter(name: str, *, tags: Optional[dict[str, str]] = None) -> None:
    """Emit a structured counter event until a dedicated metrics sink is wired in."""
    logger.info(
        "metric.increment name=%s value=1 tags=%s",
        name,
        json.dumps(tags or {}, sort_keys=True, separators=(",", ":")),
    )


def send_operational_alert(*, subject: str, body: str, error_id: Optional[str] = None, request_path: Optional[str] = None) -> None:
    """Emit a structured operational alert log event.

    This is a lightweight working implementation that records alert context in
    application logs today and can be extended later to forward into a
    workspace-specific incident pipeline.
    """
    logger.warning(
        "operational_alert.pending issue=#9 subject=%s error_id=%s request_path=%s body=%s",
        subject,
        error_id or "unknown",
        request_path or "unknown",
        body,
    )


class _SqlExecutor(Protocol):
    def execute(
        self,
        token: str,
        statement: str,
        params: Optional[list[dict]] = None,
    ) -> list[dict]: ...


def _sql_stmt_hash(statement: str) -> str:
    return hashlib.sha256(statement.encode()).hexdigest()[:16]


def _warehouse_id() -> str:
    return WAREHOUSE_HTTP_PATH.rsplit("/", 1)[-1]


def _params_to_mapping(params: Optional[list[dict]]) -> dict[str, object | None]:
    return {str(param["name"]): param.get("value") for param in (params or [])}


def _normalize_statement_for_connector(
    statement: str,
    params: Optional[list[dict]] = None,
) -> tuple[str, list[object | None]]:
    mapping = _params_to_mapping(params)
    positional: list[object | None] = []

    def replace(match: re.Match[str]) -> str:
        name = match.group(1)
        if name not in mapping:
            raise RuntimeError(f"Missing SQL parameter '{name}' for Databricks connector execution")
        positional.append(mapping[name])
        return "?"

    normalized = _SQL_CONNECTOR_PARAM_RE.sub(replace, statement)
    return normalized, positional


class _RestStatementExecutor:
    def execute(
        self,
        token: str,
        statement: str,
        params: Optional[list[dict]] = None,
    ) -> list[dict]:
        host = hostname()
        url = f"https://{host}/api/2.0/sql/statements/"

        body: dict = {
            "warehouse_id": _warehouse_id(),
            "statement": statement,
            "wait_timeout": "50s",
        }
        if params:
            body["parameters"] = params

        payload = json.dumps(body).encode()
        auth_headers = {
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
        }

        stmt_hash = _sql_stmt_hash(statement)
        param_count = len(params) if params else 0
        logger.info("sql.execute executor=rest hash=%s params=%d", stmt_hash, param_count)
        body["query_tags"] = {"app": "spc", "stmt_hash": stmt_hash}

        req = urllib.request.Request(url, data=json.dumps(body).encode(), headers=auth_headers, method="POST")
        t0 = time.monotonic()
        try:
            with urllib.request.urlopen(req, timeout=180) as resp:
                result = json.loads(resp.read().decode())
        except urllib.error.HTTPError as exc:
            body_str = exc.read().decode() if exc.fp else ""
            raise RuntimeError(f"SQL API {exc.code} {exc.reason}: {body_str[:2000]}") from exc

        state = result.get("status", {}).get("state", "")
        statement_id = result.get("statement_id", "")
        poll_url = f"https://{host}/api/2.0/sql/statements/{statement_id}"

        poll_delay_s = _SQL_POLL_INITIAL_DELAY_S
        for _ in range(_SQL_POLL_MAX_ATTEMPTS):
            if state in ("SUCCEEDED", "FAILED", "CANCELED", "CLOSED"):
                break
            time.sleep(poll_delay_s)
            poll_req = urllib.request.Request(poll_url, headers=auth_headers)
            try:
                with urllib.request.urlopen(poll_req, timeout=30) as poll_resp:
                    result = json.loads(poll_resp.read().decode())
                    state = result.get("status", {}).get("state", "")
            except urllib.error.HTTPError as exc:
                body_str = exc.read().decode() if exc.fp else ""
                raise RuntimeError(f"SQL poll {exc.code}: {body_str[:1000]}") from exc
            poll_delay_s = min(_SQL_POLL_MAX_DELAY_S, poll_delay_s * 2)

        elapsed_ms = int((time.monotonic() - t0) * 1000)
        if state != "SUCCEEDED":
            error_info = result.get("status", {}).get("error", {})
            msg = error_info.get("message", f"Query ended with state: {state}")
            logger.warning("sql.failed executor=rest hash=%s state=%s duration_ms=%d", stmt_hash, state, elapsed_ms)
            raise RuntimeError(msg)

        columns = [c["name"] for c in result["manifest"]["schema"]["columns"]]
        all_rows: list[dict] = []
        chunk = result.get("result", {})
        while True:
            for row_data in chunk.get("data_array", []):
                all_rows.append(dict(zip(columns, row_data)))
            next_chunk_index = chunk.get("next_chunk_index")
            if next_chunk_index is None:
                break
            chunk_url = f"{poll_url}/result/chunks/{next_chunk_index}"
            chunk_req = urllib.request.Request(chunk_url, headers=auth_headers)
            try:
                with urllib.request.urlopen(chunk_req, timeout=60) as chunk_resp:
                    chunk = json.loads(chunk_resp.read().decode())
            except urllib.error.HTTPError as exc:
                body_str = exc.read().decode() if exc.fp else ""
                raise RuntimeError(f"SQL chunk fetch {exc.code}: {body_str[:1000]}") from exc

        logger.info("sql.done executor=rest hash=%s state=SUCCEEDED rows=%d duration_ms=%d", stmt_hash, len(all_rows), elapsed_ms)
        return all_rows


class _ConnectorStatementExecutor:
    def execute(
        self,
        token: str,
        statement: str,
        params: Optional[list[dict]] = None,
    ) -> list[dict]:
        if databricks_sql is None:
            raise RuntimeError("databricks-sql-connector is not installed")

        normalized_statement, positional_params = _normalize_statement_for_connector(statement, params)
        stmt_hash = _sql_stmt_hash(statement)
        param_count = len(positional_params)
        logger.info("sql.execute executor=connector hash=%s params=%d", stmt_hash, param_count)
        t0 = time.monotonic()

        try:
            with databricks_sql.connect(
                server_hostname=hostname(),
                http_path=WAREHOUSE_HTTP_PATH,
                access_token=token,
            ) as connection:
                with connection.cursor() as cursor:
                    if positional_params:
                        cursor.execute(normalized_statement, positional_params)
                    else:
                        cursor.execute(normalized_statement)
                    description = cursor.description or []
                    columns = [column[0] for column in description]
                    raw_rows = cursor.fetchall() or []
        except Exception as exc:
            raise RuntimeError(str(exc)) from exc

        rows: list[dict] = []
        for raw_row in raw_rows:
            if isinstance(raw_row, dict):
                rows.append(dict(raw_row))
                continue
            rows.append(dict(zip(columns, list(raw_row))))

        elapsed_ms = int((time.monotonic() - t0) * 1000)
        logger.info("sql.done executor=connector hash=%s state=SUCCEEDED rows=%d duration_ms=%d", stmt_hash, len(rows), elapsed_ms)
        return rows


_REST_EXECUTOR: _SqlExecutor = _RestStatementExecutor()
_CONNECTOR_EXECUTOR: _SqlExecutor = _ConnectorStatementExecutor()


def _configured_sql_executor_name() -> str:
    configured = os.environ.get("SPC_SQL_EXECUTOR", "connector").strip().lower()
    return configured if configured in {"rest", "connector"} else "rest"


def _get_sql_executor() -> _SqlExecutor:
    configured = _configured_sql_executor_name()
    if configured == "connector":
        if databricks_sql is None:
            logger.warning("sql.executor connector requested but databricks-sql-connector is unavailable; falling back to rest")
            return _REST_EXECUTOR
        return _CONNECTOR_EXECUTOR
    return _REST_EXECUTOR


def run_sql(
    token: str,
    statement: str,
    params: Optional[list[dict]] = None,
) -> list[dict]:
    """
    Execute a SQL statement via the configured Databricks SQL executor.

    The default executor remains the Statement Execution REST path for parity,
    while `SPC_SQL_EXECUTOR=connector` enables the official Databricks SQL
    connector path using the same `run_sql` / `run_sql_async` call sites.
    """
    return _get_sql_executor().execute(token, statement, params)


def _sql_cache_key(
    token: str,
    statement: str,
    params: Optional[list[dict]] = None,
) -> str:
    """Return a user-scoped cache key for SQL result reuse.

    The key includes a hash of the user token, statement text, and serialized
    parameters so cached results remain isolated per authenticated user.
    """
    payload = json.dumps(params or [], sort_keys=True, default=str, separators=(",", ":"))
    token_hash = hashlib.sha256(token.encode()).hexdigest()
    stmt_hash = hashlib.sha256(statement.encode()).hexdigest()
    param_hash = hashlib.sha256(payload.encode()).hexdigest()
    return f"{token_hash}:{stmt_hash}:{param_hash}"


def _should_cache_rows(rows: list[dict]) -> bool:
    """Keep the in-process cache bounded by skipping large result sets."""
    return len(rows) <= _SQL_CACHE_ROW_LIMIT


def _statement_prefix(statement: str) -> str:
    stripped = statement.lstrip()
    if not stripped:
        return ""
    return stripped.split(None, 1)[0].upper()


def _is_read_only_statement(statement: str) -> bool:
    return _statement_prefix(statement) in _READ_SQL_PREFIXES


def _is_write_statement(statement: str) -> bool:
    return _statement_prefix(statement) in _WRITE_SQL_PREFIXES


def _clear_sql_cache() -> None:
    with _sql_cache_lock:
        _sql_cache.clear()
        expires = getattr(_sql_cache, "_expires", None)
        if isinstance(expires, dict):
            expires.clear()


async def run_sql_async(
    token: str,
    statement: str,
    params: Optional[list[dict]] = None,
) -> list[dict]:
    """Non-blocking wrapper — runs run_sql in a thread pool so the async event
    loop is never blocked waiting for Databricks SQL responses."""
    if not _is_read_only_statement(statement):
        loop = asyncio.get_running_loop()
        rows = await loop.run_in_executor(_sql_executor, lambda: run_sql(token, statement, params))
        if _is_write_statement(statement):
            _clear_sql_cache()
        return rows

    cache_key = _sql_cache_key(token, statement, params)
    with _sql_cache_lock:
        cached_rows = _sql_cache.get(cache_key)
    if cached_rows is not None:
        return deepcopy(cached_rows)

    loop = asyncio.get_running_loop()
    rows = await loop.run_in_executor(_sql_executor, lambda: run_sql(token, statement, params))
    if _should_cache_rows(rows):
        with _sql_cache_lock:
            _sql_cache[cache_key] = deepcopy(rows)
    return rows


def get_data_freshness(token: str, source_views: list[str]) -> dict:
    """
    Return per-view freshness metadata from information_schema.tables.last_altered.

    `source_views` must contain unqualified table/view names in TRACE_SCHEMA.
    Results are cached for 5 minutes (TTL=300 s) because table metadata changes
    only on DDL events, and the freshness query would otherwise double warehouse
    calls on every hot-path endpoint invocation.
    """
    safe_views: list[str] = []
    for view in source_views:
        if _VIEW_NAME_RE.match(view):
            safe_views.append(view)
    safe_views = sorted(set(safe_views))

    if not safe_views:
        return {"generated_at_utc": int(time.time()), "sources": []}

    token_hash = hashlib.sha256(token.encode()).hexdigest()
    cache_key = (token_hash, tuple(safe_views))
    with _freshness_cache_lock:
        cached = _freshness_cache.get(cache_key)
    if cached is not None:
        return deepcopy(cached)

    params = [
        sql_param("catalog_name", TRACE_CATALOG),
        sql_param("schema_name", TRACE_SCHEMA),
    ]
    view_clauses: list[str] = []
    for idx, view in enumerate(safe_views):
        param_name = f"view_{idx}"
        view_clauses.append(f"table_name = :{param_name}")
        params.append(sql_param(param_name, view))

    query = f"""
        SELECT
            table_name AS source_view,
            CAST(last_altered AS STRING) AS last_altered_utc
        FROM system.information_schema.tables
        WHERE table_catalog = :catalog_name
          AND table_schema = :schema_name
          AND ({' OR '.join(view_clauses)})
        ORDER BY table_name
    """
    rows = run_sql(token, query, params)
    result = {
        "generated_at_utc": int(time.time()),
        "catalog": TRACE_CATALOG,
        "schema": TRACE_SCHEMA,
        "sources": rows,
    }
    with _freshness_cache_lock:
        _freshness_cache[cache_key] = deepcopy(result)
    return result


async def insert_spc_audit_event(
    token: str,
    *,
    event_type: str,
    detail: dict,
    sql_hash: Optional[str] = None,
    error_id: Optional[str] = None,
    request_path: Optional[str] = None,
) -> None:
    """Persist an app audit event for operational/compliance investigations."""
    params = [
        sql_param("audit_id", str(uuid.uuid4())),
        sql_param("event_type", event_type),
        sql_param("sql_hash", sql_hash),
        sql_param("error_id", error_id),
        sql_param("request_path", request_path),
        sql_param("detail_json", json.dumps(detail, separators=(",", ":"))),
    ]
    statement = f"""
        INSERT INTO {tbl('spc_query_audit')} (
            audit_id,
            event_type,
            sql_hash,
            error_id,
            request_path,
            detail_json,
            user_id,
            created_at
        )
        SELECT
            :audit_id,
            :event_type,
            :sql_hash,
            :error_id,
            :request_path,
            :detail_json,
            CURRENT_USER(),
            CURRENT_TIMESTAMP()
    """
    await run_sql_async(token, statement, params)


async def attach_data_freshness(
    payload: dict,
    token: str,
    source_views: list[str],
    *,
    request_path: Optional[str] = None,
) -> dict:
    """Attach freshness metadata or raise an auditable failure.

    Freshness is treated as an explicit contract: if it cannot be computed, the
    caller gets a hard failure with an error id rather than a silent partial
    success that hides the monitoring gap.
    """
    try:
        loop = asyncio.get_running_loop()
        payload["data_freshness"] = await loop.run_in_executor(
            _sql_executor, lambda: get_data_freshness(token, source_views)
        )
        return payload
    except Exception as exc:
        if isinstance(exc, HTTPException):
            raise
        mapped_error = classify_sql_runtime_error(exc)
        if mapped_error is not None:
            raise mapped_error from exc

        error_id = str(uuid.uuid4())
        logger.exception(
            "data_freshness.failed error_id=%s request_path=%s source_views=%s",
            error_id,
            request_path or "unknown",
            ",".join(sorted(set(source_views))),
        )
        try:
            await insert_spc_audit_event(
                token,
                event_type="freshness_error",
                error_id=error_id,
                request_path=request_path or "unknown",
                detail={
                    "message": str(exc)[:500],
                    "source_views": sorted(set(source_views)),
                },
            )
        except Exception:
            increment_observability_counter(
                "data_freshness.audit_insert_failed_total",
                tags={
                    "error_id": error_id,
                    "request_path": request_path or "unknown",
                },
            )
            logger.exception(
                "data_freshness.audit_insert_failed error_id=%s request_path=%s",
                error_id,
                request_path or "unknown",
            )
        send_operational_alert(
            subject="SPC data freshness lookup failed",
            body=(
                "Freshness metadata could not be attached. "
                "Check spc_query_audit and Databricks SQL connectivity."
            ),
            error_id=error_id,
            request_path=request_path or "unknown",
        )
        raise HTTPException(
            status_code=503,
            detail={
                "message": "Data freshness lookup failed",
                "error_id": error_id,
            },
        ) from exc


async def insert_spc_exclusion_snapshot(
    token: str,
    payload: dict,
) -> None:
    """Persist an immutable exclusion snapshot event to the Delta audit table.

    The target table is expected to have Change Data Feed enabled so downstream
    audit/reporting consumers can replay the full event history without relying
    on in-place updates.
    """
    params = [
        sql_param("event_id", payload["event_id"]),
        sql_param("material_id", payload["material_id"]),
        sql_param("mic_id", payload["mic_id"]),
        sql_param("mic_name", payload.get("mic_name")),
        sql_param("plant_id", payload.get("plant_id")),
        sql_param("stratify_all", payload.get("stratify_all", False)),
        sql_param("stratify_by", payload.get("stratify_by")),
        sql_param("chart_type", payload["chart_type"]),
        sql_param("date_from", payload.get("date_from")),
        sql_param("date_to", payload.get("date_to")),
        sql_param("rule_set", payload.get("rule_set")),
        sql_param("justification", payload["justification"]),
        sql_param("action", payload.get("action")),
        sql_param("excluded_count", payload["excluded_count"]),
        sql_param("excluded_points_json", json.dumps(payload["excluded_points"], separators=(",", ":"))),
        sql_param("before_limits_json", json.dumps(payload.get("before_limits"), separators=(",", ":"))),
        sql_param("after_limits_json", json.dumps(payload.get("after_limits"), separators=(",", ":"))),
    ]
    insert_sql = f"""
        INSERT INTO {tbl('spc_exclusions')} (
            event_id,
            material_id,
            mic_id,
            mic_name,
            plant_id,
            stratify_all,
            stratify_by,
            chart_type,
            date_from,
            date_to,
            rule_set,
            justification,
            action,
            excluded_count,
            excluded_points_json,
            before_limits_json,
            after_limits_json,
            user_id,
            event_ts
        )
        SELECT
            :event_id,
            :material_id,
            :mic_id,
            :mic_name,
            :plant_id,
            CAST(:stratify_all AS BOOLEAN),
            :stratify_by,
            :chart_type,
            :date_from,
            :date_to,
            :rule_set,
            :justification,
            :action,
            CAST(:excluded_count AS INT),
            :excluded_points_json,
            :before_limits_json,
            :after_limits_json,
            CURRENT_USER(),
            CURRENT_TIMESTAMP()
    """
    await run_sql_async(token, insert_sql, params)
