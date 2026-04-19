"""Runtime schema-contract assertion for the gold views.

The SPC app reads from a small set of gold views it does not own. When the
upstream team adds, renames, or removes a column, the DAL currently fails at
query time with an unhelpful SQL error — and in some cases produces quietly
wrong numbers. This module compares the live warehouse schema to a frozen
contract in `backend/schema/gold_views.v1.json` and reports any diff, so the
readiness probe can fail fast with an actionable error.

The check queries Unity Catalog's `system.information_schema.columns`. It is
read-only, cheap (single query, three tables), and caches the result for 60
seconds so a flood of readiness pings does not thrash the warehouse.
"""

from __future__ import annotations

import json
import os
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Optional

_SCHEMA_FILE = Path(__file__).parent.parent / "schema" / "gold_views.v1.json"
_CACHE_TTL_SECONDS = 60.0

# Separate, longer-lived cache for optional-column probes. Optional columns
# change rarely (they're upstream ETL extensions); a 10-minute cache keeps the
# warehouse quiet without hiding new columns for long.
_OPTIONAL_CACHE_TTL_SECONDS = 600.0
_optional_cache: dict[tuple[str, str, str], tuple[float, set[str]]] = {}


@dataclass
class SchemaCheckResult:
    ok: bool
    version: str
    missing_columns: dict[str, list[str]] = field(default_factory=dict)
    missing_views: list[str] = field(default_factory=list)
    error: Optional[str] = None

    def as_dict(self) -> dict[str, Any]:
        return {
            "ok": self.ok,
            "version": self.version,
            "missing_views": self.missing_views,
            "missing_columns": self.missing_columns,
            "error": self.error,
        }


def _load_contract() -> dict[str, Any]:
    with _SCHEMA_FILE.open("r", encoding="utf-8") as handle:
        return json.load(handle)


_CACHED_RESULT: Optional[SchemaCheckResult] = None
_CACHED_AT: float = 0.0


def clear_cache() -> None:
    """Test seam — drop the in-process cache."""
    global _CACHED_RESULT, _CACHED_AT, _optional_cache
    _CACHED_RESULT = None
    _CACHED_AT = 0.0
    _optional_cache = {}


async def detect_optional_columns(
    token: str,
    catalog: str,
    schema: str,
    view_name: str,
    *,
    run_sql_async=None,
) -> set[str]:
    """Return the subset of the view's documented optional columns that
    actually exist on the live warehouse, uppercased.

    Intended for feature-flagging forward-compatible extensions (Phase 2.2
    usage_decision / inspection_phase, Phase 2.3 spec_change_reference) —
    features quietly activate when the upstream ETL team publishes the column,
    with no coordinated deploy required.

    Empty set if the view has no optional columns listed in the contract, or
    if the information_schema probe fails.
    """
    now = time.monotonic()
    cache_key = (catalog, schema, view_name)
    cached = _optional_cache.get(cache_key)
    if cached is not None and (now - cached[0]) < _OPTIONAL_CACHE_TTL_SECONDS:
        return cached[1]

    contract = _load_contract()
    view = contract["views"].get(view_name, {})
    optional = view.get("optional_columns", {}) or {}
    if not optional:
        _optional_cache[cache_key] = (now, set())
        return set()

    if run_sql_async is None:
        from backend.utils.db import run_sql_async as _real_run_sql_async
        run_sql_async = _real_run_sql_async

    in_clause = ", ".join(f"'{c.upper()}'" for c in optional.keys())
    query = f"""
        SELECT UPPER(column_name) AS column_name
        FROM system.information_schema.columns
        WHERE table_catalog = '{catalog}'
          AND table_schema = '{schema}'
          AND table_name = '{view_name}'
          AND UPPER(column_name) IN ({in_clause})
    """
    try:
        rows = await run_sql_async(token, query, endpoint_hint="schema.gold-contract")
    except Exception:
        _optional_cache[cache_key] = (now, set())
        return set()

    present = {str(row.get("column_name") or "").strip().upper() for row in rows}
    present.discard("")
    _optional_cache[cache_key] = (now, present)
    return present


async def assert_gold_view_schema(
    token: str,
    catalog: str,
    schema: str,
    *,
    run_sql_async=None,
) -> SchemaCheckResult:
    """Compare live warehouse columns to the frozen contract.

    `run_sql_async` is injected so the caller keeps the existing SQL executor
    adapter (and tests can stub it) — the default loads the lazy binding from
    `backend.utils.db`.
    """
    global _CACHED_RESULT, _CACHED_AT

    now = time.monotonic()
    if _CACHED_RESULT is not None and (now - _CACHED_AT) < _CACHE_TTL_SECONDS:
        return _CACHED_RESULT

    if run_sql_async is None:
        from backend.utils.db import run_sql_async as _real_run_sql_async
        run_sql_async = _real_run_sql_async

    contract = _load_contract()
    version = str(contract.get("version", "unknown"))
    view_names = list(contract["views"].keys())

    # Parameterised per-table in-clause. Catalog/schema are validated
    # against env vars at the DAL layer and never accept user input, so
    # their inclusion as literals here is safe.
    in_clause = ", ".join([f"'{name}'" for name in view_names])
    query = f"""
        SELECT table_name, column_name
        FROM system.information_schema.columns
        WHERE table_catalog = '{catalog}'
          AND table_schema = '{schema}'
          AND table_name IN ({in_clause})
    """

    try:
        rows = await run_sql_async(token, query, endpoint_hint="schema.gold-contract")
    except Exception as exc:  # pragma: no cover - defensive
        result = SchemaCheckResult(
            ok=False,
            version=version,
            error=f"information_schema query failed: {type(exc).__name__}",
        )
        _CACHED_RESULT = result
        _CACHED_AT = now
        return result

    live_columns: dict[str, set[str]] = {name: set() for name in view_names}
    for row in rows:
        table_name = str(row.get("table_name") or "").strip()
        column_name = str(row.get("column_name") or "").strip().upper()
        if table_name in live_columns and column_name:
            live_columns[table_name].add(column_name)

    missing_views: list[str] = []
    missing_columns: dict[str, list[str]] = {}
    for view_name, view_contract in contract["views"].items():
        if not live_columns[view_name]:
            missing_views.append(view_name)
            continue
        required = {c.upper() for c in view_contract["required_columns"].keys()}
        gap = required - live_columns[view_name]
        if gap:
            missing_columns[view_name] = sorted(gap)

    ok = not missing_views and not missing_columns
    result = SchemaCheckResult(
        ok=ok,
        version=version,
        missing_columns=missing_columns,
        missing_views=missing_views,
    )

    _CACHED_RESULT = result
    _CACHED_AT = now
    return result
