"""
SPC exclusions audit router.

Persists immutable exclusion snapshots for quantitative control charts so
manual and auto-cleaned point removals survive refreshes and leave an auditable
trail of who changed what, when, and with which before/after limits.
"""

import json
import logging
import uuid
from typing import Optional

from fastapi import APIRouter, Header, HTTPException, Request
from pydantic import BaseModel, ValidationError, field_validator

from backend.utils.db import (
    check_warehouse_config,
    classify_sql_runtime_error,
    insert_spc_exclusion_snapshot,
    resolve_token,
    run_sql_async,
    sql_param,
    tbl,
)
from backend.utils.rate_limit import limiter

router = APIRouter()
logger = logging.getLogger(__name__)

_CHART_TYPES = {"imr", "xbar_r", "p_chart"}


def _handle_sql_error(exc: Exception) -> None:
    mapped_error = classify_sql_runtime_error(
        exc,
        missing_table_detail=(
            "Exclusions audit table not initialised. "
            "Run the exclusions migration before using manual point exclusions."
        ),
    )
    if mapped_error is not None:
        raise mapped_error

    error_id = str(uuid.uuid4())
    logger.exception("exclusions.sql_error error_id=%s", error_id, exc_info=exc)
    raise HTTPException(
        status_code=500,
        detail=f"Internal server error; reference id: {error_id}",
    )


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
    stratify_all: bool = False
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

    @field_validator("mic_name", "plant_id", "date_from", "date_to", "rule_set", mode="before")
    @classmethod
    def normalize_optional_text(cls, value: Optional[str]) -> Optional[str]:
        if value is None:
            return None
        value = value.strip()
        return value or None

    @field_validator("justification")
    @classmethod
    def validate_justification(cls, value: str) -> str:
        value = value.strip()
        if len(value) < 3:
            raise ValueError("justification must be at least 3 characters")
        return value


class ChartTypeRequest(BaseModel):
    stratify_all: bool = False
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
        "stratify_all": body.stratify_all,
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
    except RuntimeError as exc:
        logger.warning("exclusions.actor_metadata_lookup_failed: %s", exc)
        actor_rows = [{"user_id": None, "event_ts": None}]
    actor = actor_rows[0] if actor_rows else {"user_id": None, "event_ts": None}

    return {
        "saved": True,
        "event_id": payload["event_id"],
        "user_id": actor.get("user_id"),
        "event_ts": actor.get("event_ts"),
    }


@router.get("/exclusions")
@limiter.limit("120/minute")
async def get_exclusions(
    request: Request,
    material_id: str,
    mic_id: str,
    chart_type: str = "imr",
    plant_id: Optional[str] = None,
    stratify_all: bool = False,
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
            stratify_all=stratify_all,
            chart_type=chart_type,
        )
    except ValidationError as exc:
        raise HTTPException(status_code=422, detail=exc.errors()) from exc

    plant_id = (plant_id or "").strip() or None
    date_from = (date_from or "").strip() or None
    date_to = (date_to or "").strip() or None

    params = [
        sql_param("material_id", material_id),
        sql_param("mic_id", mic_id),
        sql_param("plant_id", plant_id),
        sql_param("stratify_all", stratify_all),
        sql_param("chart_type", chart_type),
        sql_param("date_from", date_from),
        sql_param("date_to", date_to),
    ]

    query = f"""
        SELECT
            event_id,
            material_id,
            mic_id,
            mic_name,
            plant_id,
            stratify_all,
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
          AND plant_id <=> :plant_id
          AND COALESCE(stratify_all, false) = CAST(:stratify_all AS BOOLEAN)
          AND date_from <=> :date_from
          AND date_to <=> :date_to
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
