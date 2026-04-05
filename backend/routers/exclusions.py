"""
SPC exclusions audit router.

Persists immutable exclusion snapshots for quantitative control charts so
manual and auto-cleaned point removals survive refreshes and leave an auditable
trail of who changed what, when, and with which before/after limits.
"""

import json
import uuid
from typing import Optional

from fastapi import APIRouter, Header, HTTPException, Request
from pydantic import BaseModel, ValidationError, field_validator

from backend.utils.db import (
    check_warehouse_config,
    insert_spc_exclusion_snapshot,
    resolve_token,
    run_sql_async,
    sql_param,
    tbl,
)
from backend.utils.rate_limit import limiter

router = APIRouter()

_CHART_TYPES = {"imr", "xbar_r", "p_chart"}


def _handle_sql_error(exc: Exception) -> None:
    msg = str(exc).lower()
    if "permission denied" in msg or "no access" in msg or "403" in msg:
        raise HTTPException(status_code=403, detail="Access denied by Unity Catalog policy.")
    if "401" in msg or "unauthorized" in msg:
        raise HTTPException(status_code=401, detail="Token rejected by Databricks.")
    if "table or view not found" in msg or "does not exist" in msg or "doesn't exist" in msg:
        raise HTTPException(
            status_code=503,
            detail=(
                "Exclusions audit table not initialised. "
                "Run the exclusions migration before using manual point exclusions."
            ),
        )
    raise HTTPException(status_code=500, detail=str(exc))


class LimitSnapshot(BaseModel):
    cl: Optional[float] = None
    ucl: Optional[float] = None
    lcl: Optional[float] = None
    ucl_r: Optional[float] = None
    lcl_r: Optional[float] = None
    sigma_within: Optional[float] = None
    point_count: Optional[int] = None


class ExcludedPoint(BaseModel):
    batch_id: str
    sample_seq: int
    batch_seq: Optional[int] = None
    batch_date: Optional[str] = None
    plant_id: Optional[str] = None
    value: Optional[float] = None
    original_index: Optional[int] = None


class SaveExclusionsRequest(BaseModel):
    material_id: str
    mic_id: str
    mic_name: Optional[str] = None
    plant_id: Optional[str] = None
    chart_type: str = "imr"
    date_from: Optional[str] = None
    date_to: Optional[str] = None
    rule_set: Optional[str] = None
    justification: str
    action: str = "manual_toggle"
    excluded_points: list[ExcludedPoint]
    before_limits: Optional[LimitSnapshot] = None
    after_limits: Optional[LimitSnapshot] = None

    @field_validator("chart_type")
    @classmethod
    def validate_chart_type(cls, value: str) -> str:
        if value not in _CHART_TYPES:
            raise ValueError(f"chart_type must be one of {sorted(_CHART_TYPES)}")
        return value

    @field_validator("justification")
    @classmethod
    def validate_justification(cls, value: str) -> str:
        value = value.strip()
        if len(value) < 3:
            raise ValueError("justification must be at least 3 characters")
        return value


class ChartTypeRequest(BaseModel):
    chart_type: str = "imr"

    @field_validator("chart_type")
    @classmethod
    def validate_chart_type(cls, value: str) -> str:
        return SaveExclusionsRequest.validate_chart_type(value)


@router.post("/exclusions")
@limiter.limit("30/minute")
async def save_exclusions(
    request: Request,
    body: SaveExclusionsRequest,
    x_forwarded_access_token: Optional[str] = Header(default=None),
    authorization: Optional[str] = Header(default=None),
):
    """Persist an immutable exclusions snapshot for the active SPC chart scope."""
    token = resolve_token(x_forwarded_access_token, authorization)
    check_warehouse_config()

    payload = {
        "event_id": str(uuid.uuid4()),
        "material_id": body.material_id,
        "mic_id": body.mic_id,
        "mic_name": body.mic_name,
        "plant_id": body.plant_id,
        "chart_type": body.chart_type,
        "date_from": body.date_from,
        "date_to": body.date_to,
        "rule_set": body.rule_set,
        "justification": body.justification,
        "action": body.action,
        "excluded_count": len(body.excluded_points),
        "excluded_points": [point.model_dump() for point in body.excluded_points],
        "before_limits": body.before_limits.model_dump() if body.before_limits else None,
        "after_limits": body.after_limits.model_dump() if body.after_limits else None,
    }

    try:
        await insert_spc_exclusion_snapshot(token, payload)
    except RuntimeError as exc:
        _handle_sql_error(exc)

    try:
        actor_rows = await run_sql_async(
            token,
            "SELECT CURRENT_USER() AS user_id, CAST(CURRENT_TIMESTAMP() AS STRING) AS event_ts",
        )
    except RuntimeError:
        actor_rows = [{"user_id": None, "event_ts": None}]

    return {
        "saved": True,
        "event_id": payload["event_id"],
        "user_id": actor_rows[0].get("user_id"),
        "event_ts": actor_rows[0].get("event_ts"),
    }


@router.get("/exclusions")
@limiter.limit("120/minute")
async def get_exclusions(
    request: Request,
    material_id: str,
    mic_id: str,
    chart_type: str = "imr",
    plant_id: Optional[str] = None,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    x_forwarded_access_token: Optional[str] = Header(default=None),
    authorization: Optional[str] = Header(default=None),
):
    """Return the latest exclusions snapshot for the active SPC chart scope."""
    token = resolve_token(x_forwarded_access_token, authorization)
    check_warehouse_config()

    try:
        ChartTypeRequest(
            chart_type=chart_type,
        )
    except ValidationError as exc:
        raise HTTPException(status_code=422, detail=exc.errors()) from exc

    params = [
        sql_param("material_id", material_id),
        sql_param("mic_id", mic_id),
        sql_param("chart_type", chart_type),
    ]
    if plant_id:
        plant_clause = "AND plant_id = :plant_id"
        params.append(sql_param("plant_id", plant_id))
    else:
        plant_clause = "AND plant_id IS NULL"

    if date_from:
        date_from_clause = "AND COALESCE(date_from, '') = :date_from"
        params.append(sql_param("date_from", date_from))
    else:
        date_from_clause = "AND date_from IS NULL"

    if date_to:
        date_to_clause = "AND COALESCE(date_to, '') = :date_to"
        params.append(sql_param("date_to", date_to))
    else:
        date_to_clause = "AND date_to IS NULL"

    query = f"""
        SELECT
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
            CAST(event_ts AS STRING) AS event_ts
        FROM {tbl('spc_exclusions')}
        WHERE material_id = :material_id
          AND mic_id = :mic_id
          AND chart_type = :chart_type
          {plant_clause}
          {date_from_clause}
          {date_to_clause}
        ORDER BY event_ts DESC
        LIMIT 1
    """

    try:
        rows = await run_sql_async(token, query, params)
    except RuntimeError as exc:
        _handle_sql_error(exc)

    if not rows:
        return {"exclusions": None}

    row = rows[0]
    row["excluded_count"] = int(float(row["excluded_count"])) if row.get("excluded_count") is not None else 0
    row["excluded_points"] = json.loads(row.pop("excluded_points_json") or "[]")
    row["before_limits"] = json.loads(row.pop("before_limits_json") or "null")
    row["after_limits"] = json.loads(row.pop("after_limits_json") or "null")
    return {"exclusions": row}
