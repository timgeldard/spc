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
import time
import re
import uuid
import urllib.error
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from typing import Optional

from fastapi import HTTPException

_sql_executor = ThreadPoolExecutor(max_workers=20, thread_name_prefix="sql")

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


def increment_observability_counter(name: str, *, tags: Optional[dict[str, str]] = None) -> None:
    """Emit a structured counter event until a dedicated metrics sink is wired in."""
    logger.info(
        "metric.increment name=%s value=1 tags=%s",
        name,
        json.dumps(tags or {}, sort_keys=True, separators=(",", ":")),
    )


def send_operational_alert(*, subject: str, body: str, error_id: Optional[str] = None, request_path: Optional[str] = None) -> None:
    """Stub hook for workspace-specific alerting integrations.

    See GitHub issue #9 for wiring this into Databricks SQL alerts or a webhook-
    based incident pipeline once environment-specific routing is available.
    """
    logger.warning(
        "operational_alert.pending issue=#9 subject=%s error_id=%s request_path=%s body=%s",
        subject,
        error_id or "unknown",
        request_path or "unknown",
        body,
    )


def run_sql(
    token: str,
    statement: str,
    params: Optional[list[dict]] = None,
) -> list[dict]:
    """
    Execute a SQL statement via the Databricks SQL Statement Execution REST API.

    Supports named parameters (:name syntax) to prevent SQL injection:

        rows = run_sql(token, "SELECT * FROM t WHERE col = :val",
                       [sql_param("val", user_input)])

    Falls back to polling when the warehouse returns PENDING/RUNNING status.
    Raises RuntimeError on SQL failures.
    """
    host = hostname()
    wh_id = WAREHOUSE_HTTP_PATH.rsplit("/", 1)[-1]
    url = f"https://{host}/api/2.0/sql/statements/"

    body: dict = {
        "warehouse_id": wh_id,
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

    stmt_hash = hashlib.sha256(statement.encode()).hexdigest()[:16]
    param_count = len(params) if params else 0
    logger.info("sql.execute hash=%s params=%d", stmt_hash, param_count)

    req = urllib.request.Request(url, data=payload, headers=auth_headers, method="POST")
    t0 = time.monotonic()
    try:
        with urllib.request.urlopen(req, timeout=180) as resp:
            result = json.loads(resp.read().decode())
    except urllib.error.HTTPError as exc:
        body_str = exc.read().decode() if exc.fp else ""
        raise RuntimeError(f"SQL API {exc.code} {exc.reason}: {body_str[:2000]}") from exc

    # Poll until terminal state
    state = result.get("status", {}).get("state", "")
    statement_id = result.get("statement_id", "")
    poll_url = f"https://{host}/api/2.0/sql/statements/{statement_id}"

    for _ in range(60):  # up to ~2 minutes
        if state in ("SUCCEEDED", "FAILED", "CANCELED", "CLOSED"):
            break
        time.sleep(2)
        poll_req = urllib.request.Request(poll_url, headers=auth_headers)
        try:
            with urllib.request.urlopen(poll_req, timeout=30) as poll_resp:
                result = json.loads(poll_resp.read().decode())
                state = result.get("status", {}).get("state", "")
        except urllib.error.HTTPError as exc:
            body_str = exc.read().decode() if exc.fp else ""
            raise RuntimeError(f"SQL poll {exc.code}: {body_str[:1000]}") from exc

    elapsed_ms = int((time.monotonic() - t0) * 1000)

    if state != "SUCCEEDED":
        error_info = result.get("status", {}).get("error", {})
        msg = error_info.get("message", f"Query ended with state: {state}")
        logger.warning("sql.failed hash=%s state=%s duration_ms=%d", stmt_hash, state, elapsed_ms)
        raise RuntimeError(msg)

    columns = [c["name"] for c in result["manifest"]["schema"]["columns"]]
    rows = [
        dict(zip(columns, row_data))
        for row_data in result.get("result", {}).get("data_array", [])
    ]
    logger.info("sql.done hash=%s state=SUCCEEDED rows=%d duration_ms=%d", stmt_hash, len(rows), elapsed_ms)
    return rows


async def run_sql_async(
    token: str,
    statement: str,
    params: Optional[list[dict]] = None,
) -> list[dict]:
    """Non-blocking wrapper — runs run_sql in a thread pool so the async event
    loop is never blocked waiting for Databricks SQL responses."""
    loop = asyncio.get_running_loop()
    return await loop.run_in_executor(_sql_executor, lambda: run_sql(token, statement, params))


def get_data_freshness(token: str, source_views: list[str]) -> dict:
    """
    Return per-view freshness metadata from information_schema.tables.last_altered.

    `source_views` must contain unqualified table/view names in TRACE_SCHEMA.
    """
    safe_views: list[str] = []
    for view in source_views:
        if _VIEW_NAME_RE.match(view):
            safe_views.append(view)
    safe_views = sorted(set(safe_views))

    if not safe_views:
        return {"generated_at_utc": int(time.time()), "sources": []}

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
    return {
        "generated_at_utc": int(time.time()),
        "catalog": TRACE_CATALOG,
        "schema": TRACE_SCHEMA,
        "sources": rows,
    }


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
        raise RuntimeError(
            f"Data freshness lookup failed (error_id={error_id}). "
            "See spc_query_audit for details."
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
