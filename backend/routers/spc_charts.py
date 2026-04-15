import logging
from typing import Optional

from fastapi import APIRouter, Header, HTTPException, Query, Request
from pydantic import ValidationError

from backend.dal.spc_charts_dal import (
    decode_chart_cursor,
    delete_locked_limits,
    fetch_chart_data_page,
    fetch_chart_data_values,
    fetch_count_chart_data,
    fetch_locked_limits,
    fetch_p_chart_data,
    fetch_spec_drift_summary,
    save_locked_limits,
)
from backend.dal.spc_shared import compute_normality_result
from backend.routers.spc_common import handle_locked_limits_error, handle_sql_error
from backend.schemas.spc_schemas import (
    ChartDataRequest,
    CountChartDataRequest,
    DeleteLockedLimitsRequest,
    GetLockedLimitsRequest,
    LockLimitsRequest,
    PChartDataRequest,
)
from backend.utils.db import attach_data_freshness, check_warehouse_config, resolve_token
from backend.utils.rate_limit import limiter

router = APIRouter()
_NORMALITY_MAX_POINTS = 5000
logger = logging.getLogger(__name__)


@router.post("/chart-data")
@limiter.limit("60/minute")
async def spc_chart_data(
    request: Request,
    body: ChartDataRequest,
    cursor: Optional[str] = Query(default=None),
    limit: int = Query(default=1000, ge=1, le=5000),
    include_summary: bool = Query(default=False),
    x_forwarded_access_token: Optional[str] = Header(default=None),
    authorization: Optional[str] = Header(default=None),
):
    token = resolve_token(x_forwarded_access_token, authorization)
    check_warehouse_config()
    if cursor is not None:
        try:
            decode_chart_cursor(cursor)
        except ValueError as exc:
            raise HTTPException(status_code=422, detail=str(exc)) from exc
    try:
        page = await fetch_chart_data_page(
            token,
            body.material_id,
            body.mic_id,
            body.mic_name,
            body.plant_id,
            body.date_from,
            body.date_to,
            body.stratify_by,
            cursor=cursor,
            limit=limit,
            operation_id=body.operation_id,
        )
    except Exception as exc:
        handle_sql_error(exc)
    normality = None
    spec_drift = None
    if include_summary and cursor is None:
        try:
            normality = compute_normality_result(
                await fetch_chart_data_values(
                    token,
                    body.material_id,
                    body.mic_id,
                    body.mic_name,
                    body.plant_id,
                    body.date_from,
                    body.date_to,
                    body.stratify_by,
                    max_points=_NORMALITY_MAX_POINTS,
                    operation_id=body.operation_id,
                )
            )
        except Exception as exc:
            handle_sql_error(exc)
        try:
            drift_raw = await fetch_spec_drift_summary(
                token,
                body.material_id,
                body.mic_id,
                body.plant_id,
                body.date_from,
                body.date_to,
                body.operation_id,
            )
            if drift_raw["detected"]:
                n = drift_raw["distinct_signatures"]
                b = drift_raw["total_batches"]
                spec_drift = {
                    "detected": True,
                    "distinct_signatures": n,
                    "total_batches": b,
                    "signature_set": drift_raw["signature_set"],
                    "message": (
                        f"Specification limits changed {n} time(s) across {b} batch(es) "
                        "in this date range. Control limits computed over the full range "
                        "may be invalid. Consider narrowing the date range to a single "
                        "spec regime."
                    ),
                }
        except Exception as exc:
            logger.warning(
                "spc.spec_drift_summary_failed material_id=%s mic_id=%s operation_id=%s",
                body.material_id,
                body.mic_id,
                body.operation_id,
                exc_info=exc,
            )

    return await attach_data_freshness(
        {
            "data": page["data"],
            "next_cursor": page["next_cursor"],
            "has_more": page["has_more"],
            "count": len(page["data"]),
            "limit": limit,
            "stratified": body.stratify_by is not None,
            "stratify_by": body.stratify_by,
            "data_truncated": False,
            "normality": normality,
            "spec_drift": spec_drift,
        },
        token,
        ["gold_batch_quality_result_v", "gold_batch_mass_balance_v"],
        request_path=request.url.path,
    )


@router.post("/p-chart-data")
@limiter.limit("60/minute")
async def spc_p_chart_data(
    request: Request,
    body: PChartDataRequest,
    x_forwarded_access_token: Optional[str] = Header(default=None),
    authorization: Optional[str] = Header(default=None),
):
    token = resolve_token(x_forwarded_access_token, authorization)
    check_warehouse_config()
    try:
        rows = await fetch_p_chart_data(
            token,
            body.material_id,
            body.mic_id,
            body.mic_name,
            body.plant_id,
            body.date_from,
            body.date_to,
            operation_id=body.operation_id,
        )
    except Exception as exc:
        handle_sql_error(exc)

    return await attach_data_freshness(
        {"points": rows, "count": len(rows)},
        token,
        ["gold_batch_quality_result_v", "gold_batch_mass_balance_v"],
        request_path=request.url.path,
    )


@router.post("/count-chart-data")
@limiter.limit("60/minute")
async def spc_count_chart_data(
    request: Request,
    body: CountChartDataRequest,
    x_forwarded_access_token: Optional[str] = Header(default=None),
    authorization: Optional[str] = Header(default=None),
):
    token = resolve_token(x_forwarded_access_token, authorization)
    check_warehouse_config()
    try:
        rows = await fetch_count_chart_data(
            token,
            body.material_id,
            body.mic_id,
            body.mic_name,
            body.plant_id,
            body.date_from,
            body.date_to,
            body.chart_subtype,
            operation_id=body.operation_id,
        )
    except Exception as exc:
        handle_sql_error(exc)

    return await attach_data_freshness(
        {"points": rows, "count": len(rows), "chart_subtype": body.chart_subtype},
        token,
        ["gold_batch_quality_result_v", "gold_batch_mass_balance_v"],
        request_path=request.url.path,
    )


@router.post("/locked-limits")
@limiter.limit("30/minute")
async def lock_limits(
    request: Request,
    body: LockLimitsRequest,
    x_forwarded_access_token: Optional[str] = Header(default=None),
    authorization: Optional[str] = Header(default=None),
):
    token = resolve_token(x_forwarded_access_token, authorization)
    check_warehouse_config()
    try:
        return await save_locked_limits(
            token,
            body.material_id,
            body.mic_id,
            body.plant_id,
            body.chart_type,
            body.cl,
            body.ucl,
            body.lcl,
            body.ucl_r,
            body.lcl_r,
            body.sigma_within,
            body.baseline_from,
            body.baseline_to,
            operation_id=body.operation_id,
            unified_mic_key=body.unified_mic_key,
            mic_origin=body.mic_origin,
            spec_signature=body.spec_signature,
            locking_note=body.locking_note,
        )
    except Exception as exc:
        handle_locked_limits_error(exc)


@router.get("/locked-limits")
@limiter.limit("120/minute")
async def get_locked_limits(
    request: Request,
    material_id: str,
    mic_id: str,
    unified_mic_key: Optional[str] = None,
    plant_id: Optional[str] = None,
    operation_id: Optional[str] = None,
    chart_type: str = "imr",
    x_forwarded_access_token: Optional[str] = Header(default=None),
    authorization: Optional[str] = Header(default=None),
):
    token = resolve_token(x_forwarded_access_token, authorization)
    check_warehouse_config()
    try:
        GetLockedLimitsRequest(
            material_id=material_id,
            mic_id=mic_id,
            unified_mic_key=unified_mic_key,
            plant_id=plant_id,
            operation_id=operation_id,
            chart_type=chart_type,
        )
    except ValidationError as exc:
        raise HTTPException(status_code=422, detail=exc.errors()) from exc

    try:
        row = await fetch_locked_limits(
            token,
            material_id,
            mic_id,
            plant_id,
            chart_type,
            operation_id=operation_id,
            unified_mic_key=unified_mic_key,
        )
    except Exception as exc:
        handle_locked_limits_error(exc)

    return {"locked_limits": row}


@router.delete("/locked-limits")
@limiter.limit("30/minute")
async def delete_locked_limits_route(
    request: Request,
    body: DeleteLockedLimitsRequest,
    x_forwarded_access_token: Optional[str] = Header(default=None),
    authorization: Optional[str] = Header(default=None),
):
    token = resolve_token(x_forwarded_access_token, authorization)
    check_warehouse_config()
    try:
        return await delete_locked_limits(
            token,
            body.material_id,
            body.mic_id,
            body.plant_id,
            body.chart_type,
            operation_id=body.operation_id,
            unified_mic_key=body.unified_mic_key,
        )
    except Exception as exc:
        handle_locked_limits_error(exc)
