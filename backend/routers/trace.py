from typing import Optional

from fastapi import APIRouter, Header, HTTPException, Request

from backend.dal.trace_dal import (
    MAX_TRACE_LEVELS,
    _build_tree,
    fetch_batch_details,
    fetch_impact,
    fetch_summary,
    fetch_trace_tree,
)
from backend.routers.spc_common import attach_payload_freshness, handle_sql_error
from backend.schemas.trace_schemas import (
    BatchDetailsRequest,
    ImpactRequest,
    SummaryRequest,
    TraceRequest,
)
from backend.utils.db import check_warehouse_config, resolve_token
from backend.utils.rate_limit import limiter

router = APIRouter()


@router.post("/trace")
@limiter.limit("30/minute")
async def trace(
    request: Request,
    body: TraceRequest,
    x_forwarded_access_token: Optional[str] = Header(default=None),
    authorization: Optional[str] = Header(default=None),
):
    token = resolve_token(x_forwarded_access_token, authorization)
    check_warehouse_config()
    try:
        rows = await fetch_trace_tree(token, body.material_id, body.batch_id, MAX_TRACE_LEVELS)
    except Exception as exc:
        handle_sql_error(exc)

    if not rows:
        raise HTTPException(
            status_code=404,
            detail=f"No traceability data found for Material '{body.material_id}', Batch '{body.batch_id}'.",
        )

    return await attach_payload_freshness(
        {"tree": _build_tree(rows), "total_nodes": len(rows)},
        token,
        request.url.path,
        [
            "gold_batch_lineage",
            "gold_material",
            "gold_plant",
            "gold_batch_quality_summary_v",
            "gold_batch_stock_v",
        ],
    )


@router.post("/summary")
@limiter.limit("60/minute")
async def summary(
    request: Request,
    body: SummaryRequest,
    x_forwarded_access_token: Optional[str] = Header(default=None),
    authorization: Optional[str] = Header(default=None),
):
    token = resolve_token(x_forwarded_access_token, authorization)
    check_warehouse_config()
    try:
        payload = await fetch_summary(token, body.batch_id)
    except Exception as exc:
        handle_sql_error(exc)

    if not payload:
        raise HTTPException(status_code=404, detail=f"No summary data for Batch '{body.batch_id}'.")

    return await attach_payload_freshness(
        payload,
        token,
        request.url.path,
        ["gold_batch_stock_v", "gold_batch_mass_balance_v"],
    )


@router.post("/batch-details")
@limiter.limit("30/minute")
async def batch_details(
    request: Request,
    body: BatchDetailsRequest,
    x_forwarded_access_token: Optional[str] = Header(default=None),
    authorization: Optional[str] = Header(default=None),
):
    token = resolve_token(x_forwarded_access_token, authorization)
    check_warehouse_config()
    try:
        payload = await fetch_batch_details(token, body.material_id, body.batch_id)
    except Exception as exc:
        handle_sql_error(exc)

    if not payload.get("summary"):
        raise HTTPException(status_code=404, detail=f"No data for Batch '{body.batch_id}'.")

    return await attach_payload_freshness(
        payload,
        token,
        request.url.path,
        [
            "gold_batch_stock_v",
            "gold_batch_mass_balance_v",
            "gold_batch_quality_result_v",
            "gold_batch_quality_lot_v",
            "gold_batch_delivery_v",
            "gold_batch_lineage",
        ],
    )


@router.post("/impact")
@limiter.limit("60/minute")
async def impact(
    request: Request,
    body: ImpactRequest,
    x_forwarded_access_token: Optional[str] = Header(default=None),
    authorization: Optional[str] = Header(default=None),
):
    token = resolve_token(x_forwarded_access_token, authorization)
    check_warehouse_config()
    try:
        payload = await fetch_impact(token, body.batch_id)
    except Exception as exc:
        handle_sql_error(exc)

    return await attach_payload_freshness(
        payload,
        token,
        request.url.path,
        ["gold_batch_delivery_v", "gold_batch_lineage"],
    )
