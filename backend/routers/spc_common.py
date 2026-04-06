from fastapi import HTTPException

from backend.utils.db import attach_data_freshness


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


def handle_sql_error(exc: Exception) -> None:
    """Convert common SQL errors to appropriate HTTP status codes."""
    msg = str(exc).lower()
    if "permission denied" in msg or "no access" in msg or "403" in msg:
        raise HTTPException(status_code=403, detail="Access denied by Unity Catalog policy.")
    if "401" in msg or "unauthorized" in msg:
        raise HTTPException(status_code=401, detail="Token rejected by Databricks.")
    raise HTTPException(status_code=500, detail=str(exc))


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
