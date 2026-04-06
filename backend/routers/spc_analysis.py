from typing import Optional

from fastapi import APIRouter, Header, Request

from backend.dal.spc_analysis_dal import (
    fetch_compare_scorecard,
    fetch_correlation,
    fetch_correlation_scatter,
    fetch_process_flow,
    fetch_scorecard,
    save_msa_session,
)
from backend.routers.spc_common import handle_sql_error
from backend.schemas.spc_schemas import (
    CompareScorecardsRequest,
    CorrelationRequest,
    CorrelationScatterRequest,
    ProcessFlowRequest,
    SaveMSARequest,
    ScorecardRequest,
)
from backend.utils.db import attach_data_freshness, check_warehouse_config, resolve_token
from backend.utils.rate_limit import limiter

router = APIRouter()


@router.post("/process-flow")
@limiter.limit("30/minute")
async def spc_process_flow(
    request: Request,
    body: ProcessFlowRequest,
    x_forwarded_access_token: Optional[str] = Header(default=None),
    authorization: Optional[str] = Header(default=None),
):
    token = resolve_token(x_forwarded_access_token, authorization)
    check_warehouse_config()
    try:
        payload = await fetch_process_flow(token, body.material_id, body.date_from, body.date_to)
    except Exception as exc:
        handle_sql_error(exc)

    return await attach_data_freshness(
        payload,
        token,
        ["gold_batch_lineage", "gold_material", "gold_plant", "gold_batch_quality_result_v", "gold_batch_mass_balance_v"],
        request_path=request.url.path,
    )


@router.post("/scorecard")
@limiter.limit("45/minute")
async def spc_scorecard(
    request: Request,
    body: ScorecardRequest,
    x_forwarded_access_token: Optional[str] = Header(default=None),
    authorization: Optional[str] = Header(default=None),
):
    token = resolve_token(x_forwarded_access_token, authorization)
    check_warehouse_config()
    try:
        rows = await fetch_scorecard(token, body.material_id, body.plant_id, body.date_from, body.date_to)
    except Exception as exc:
        handle_sql_error(exc)

    return await attach_data_freshness(
        {"scorecard": rows, "material_id": body.material_id},
        token,
        ["gold_batch_quality_result_v", "gold_batch_mass_balance_v"],
        request_path=request.url.path,
    )


@router.post("/compare-scorecard")
@limiter.limit("10/minute")
async def compare_scorecard(
    request: Request,
    body: CompareScorecardsRequest,
    x_forwarded_access_token: Optional[str] = Header(default=None),
    authorization: Optional[str] = Header(default=None),
):
    token = resolve_token(x_forwarded_access_token, authorization)
    check_warehouse_config()
    try:
        return await fetch_compare_scorecard(token, body.material_ids, body.plant_id, body.date_from, body.date_to)
    except Exception as exc:
        handle_sql_error(exc)


@router.post("/msa/save")
@limiter.limit("10/minute")
async def msa_save(
    request: Request,
    body: SaveMSARequest,
    x_forwarded_access_token: Optional[str] = Header(default=None),
    authorization: Optional[str] = Header(default=None),
):
    token = resolve_token(x_forwarded_access_token, authorization)
    check_warehouse_config()
    try:
        return await save_msa_session(
            token,
            body.material_id,
            body.mic_id,
            body.n_operators,
            body.n_parts,
            body.n_replicates,
            body.grr_pct,
            body.repeatability,
            body.reproducibility,
            body.ndc,
            body.results_json,
        )
    except Exception as exc:
        handle_sql_error(exc)


@router.post("/correlation")
@limiter.limit("5/minute")
async def spc_correlation(
    request: Request,
    body: CorrelationRequest,
    x_forwarded_access_token: Optional[str] = Header(default=None),
    authorization: Optional[str] = Header(default=None),
):
    token = resolve_token(x_forwarded_access_token, authorization)
    check_warehouse_config()
    try:
        payload = await fetch_correlation(
            token,
            body.material_id,
            body.plant_id,
            body.date_from,
            body.date_to,
            body.min_batches,
        )
    except Exception as exc:
        handle_sql_error(exc)

    return await attach_data_freshness(
        payload,
        token,
        ["gold_batch_quality_result_v", "gold_batch_mass_balance_v"],
        request_path=request.url.path,
    )


@router.post("/correlation-scatter")
@limiter.limit("20/minute")
async def spc_correlation_scatter(
    request: Request,
    body: CorrelationScatterRequest,
    x_forwarded_access_token: Optional[str] = Header(default=None),
    authorization: Optional[str] = Header(default=None),
):
    token = resolve_token(x_forwarded_access_token, authorization)
    check_warehouse_config()
    try:
        return await fetch_correlation_scatter(
            token,
            body.material_id,
            body.mic_a_id,
            body.mic_b_id,
            body.plant_id,
            body.date_from,
            body.date_to,
        )
    except Exception as exc:
        handle_sql_error(exc)
