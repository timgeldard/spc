from typing import Optional

from fastapi import APIRouter, Header, Request

from backend.dal.spc_metadata_dal import (
    fetch_attribute_characteristics,
    fetch_characteristics,
    fetch_materials,
    fetch_plants,
    validate_material,
)
from backend.routers.spc_common import attach_validation_freshness, handle_sql_error
from backend.schemas.spc_schemas import (
    AttributeCharacteristicsRequest,
    CharacteristicsRequest,
    ValidateMaterialRequest,
)
from backend.utils.db import attach_data_freshness, check_warehouse_config, resolve_token
from backend.utils.rate_limit import limiter

router = APIRouter()


@router.get("/plants")
@limiter.limit("120/minute")
async def spc_plants(
    request: Request,
    material_id: str,
    x_forwarded_access_token: Optional[str] = Header(default=None),
    authorization: Optional[str] = Header(default=None),
):
    token = resolve_token(x_forwarded_access_token, authorization)
    check_warehouse_config()
    try:
        rows = await fetch_plants(token, material_id)
    except Exception as exc:
        handle_sql_error(exc)

    return await attach_data_freshness(
        {"plants": rows},
        token,
        ["gold_batch_mass_balance_v", "gold_plant", "gold_batch_quality_result_v"],
        request_path=request.url.path,
    )


@router.post("/validate-material")
@limiter.limit("120/minute")
async def spc_validate_material(
    request: Request,
    body: ValidateMaterialRequest,
    x_forwarded_access_token: Optional[str] = Header(default=None),
    authorization: Optional[str] = Header(default=None),
):
    token = resolve_token(x_forwarded_access_token, authorization)
    check_warehouse_config()
    try:
        row = await validate_material(token, body.material_id)
    except Exception as exc:
        handle_sql_error(exc)

    if not row:
        return await attach_validation_freshness({"valid": False}, token, request.url.path)
    return await attach_validation_freshness(
        {
            "valid": True,
            "material_id": str(row["material_id"]),
            "material_name": str(row["material_name"]),
        },
        token,
        request.url.path,
    )


@router.get("/materials")
@limiter.limit("120/minute")
async def spc_materials(
    request: Request,
    x_forwarded_access_token: Optional[str] = Header(default=None),
    authorization: Optional[str] = Header(default=None),
):
    token = resolve_token(x_forwarded_access_token, authorization)
    check_warehouse_config()
    try:
        rows = await fetch_materials(token)
    except Exception as exc:
        handle_sql_error(exc)

    return await attach_data_freshness(
        {"materials": rows},
        token,
        ["gold_batch_quality_result_v", "gold_material"],
        request_path=request.url.path,
    )


@router.post("/characteristics")
@limiter.limit("60/minute")
async def spc_characteristics(
    request: Request,
    body: CharacteristicsRequest,
    x_forwarded_access_token: Optional[str] = Header(default=None),
    authorization: Optional[str] = Header(default=None),
):
    token = resolve_token(x_forwarded_access_token, authorization)
    check_warehouse_config()
    try:
        characteristics, attr_characteristics = await fetch_characteristics(token, body.material_id, body.plant_id)
    except Exception as exc:
        handle_sql_error(exc)

    return await attach_data_freshness(
        {"characteristics": characteristics, "attr_characteristics": attr_characteristics},
        token,
        ["gold_batch_quality_result_v"],
        request_path=request.url.path,
    )


@router.post("/attribute-characteristics")
@limiter.limit("60/minute")
async def spc_attribute_characteristics(
    request: Request,
    body: AttributeCharacteristicsRequest,
    x_forwarded_access_token: Optional[str] = Header(default=None),
    authorization: Optional[str] = Header(default=None),
):
    token = resolve_token(x_forwarded_access_token, authorization)
    check_warehouse_config()
    try:
        rows = await fetch_attribute_characteristics(token, body.material_id, body.plant_id)
    except Exception as exc:
        handle_sql_error(exc)

    return await attach_data_freshness(
        {"characteristics": rows},
        token,
        ["spc_attribute_quality_metrics"],
        request_path=request.url.path,
    )
