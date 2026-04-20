import logging
import uuid

import numpy as np
from fastapi import HTTPException

from backend.utils.db import attach_data_freshness, classify_sql_runtime_error

logger = logging.getLogger(__name__)


async def attach_validation_freshness(payload: dict, token: str, request_path: str) -> dict:
    """Best-effort freshness for material validation."""
    try:
        return await attach_data_freshness(
            payload,
            token,
            ["gold_batch_quality_result_v", "gold_material"],
            request_path=request_path,
        )
    except HTTPException as exc:
        detail = exc.detail if isinstance(exc.detail, dict) else {}
        if exc.status_code == 503 and detail.get("message") == "Data freshness lookup failed":
            return {
                **payload,
                "data_freshness": None,
                "data_freshness_warning": detail,
            }
        raise


async def attach_payload_freshness(
    payload: dict,
    token: str,
    request_path: str,
    source_views: list[str],
) -> dict:
    """Attach freshness metadata for a generic response payload."""
    try:
        return await attach_data_freshness(
            payload,
            token,
            source_views,
            request_path=request_path,
        )
    except HTTPException as exc:
        detail = exc.detail if isinstance(exc.detail, dict) else {}
        if exc.status_code == 503 and detail.get("message") == "Data freshness lookup failed":
            return {
                **payload,
                "data_freshness": None,
                "data_freshness_warning": detail,
            }
        raise


def handle_sql_error(exc: Exception) -> None:
    """Convert common SQL errors to appropriate HTTP status codes."""
    mapped_error = classify_sql_runtime_error(exc)
    if mapped_error is not None:
        raise mapped_error

    error_id = str(uuid.uuid4())
    logger.exception("spc.sql_error error_id=%s", error_id, exc_info=exc)
    raise HTTPException(
        status_code=500,
        detail=f"Internal server error; reference id: {error_id}",
    )


def handle_analysis_error(exc: Exception) -> None:
    """Handle errors from analysis endpoints, surfacing user-facing validation messages.

    LinAlgError → 422 with a user-friendly explanation of the degenerate matrix case.
    ValueError  → 422 with the exception message passed through to the client.
    Anything else falls through to handle_sql_error for standard SQL / 500 handling.
    """
    if isinstance(exc, np.linalg.LinAlgError):
        raise HTTPException(
            status_code=422,
            detail=(
                "The selected characteristics produce a degenerate covariance matrix. "
                "Try removing highly correlated or zero-variance variables."
            ),
        )
    if isinstance(exc, ValueError):
        raise HTTPException(status_code=422, detail=str(exc))
    handle_sql_error(exc)


def handle_locked_limits_error(exc: Exception) -> None:
    """Handle errors from locked-limits endpoints, with a clear 503 for missing table."""
    msg = str(exc).lower()
    if "table or view not found" in msg or "doesn't exist" in msg or "does not exist" in msg:
        raise HTTPException(
            status_code=503,
            detail=(
                "Locked limits table not initialised in this workspace. "
                "Apply migration scripts/migrations/000_setup_locked_limits.sql "
                "through the deploy pipeline before using locked limits."
            ),
        )
    handle_sql_error(exc)
