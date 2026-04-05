"""
SPC (Statistical Process Control) API router.

Endpoints:
  GET  /api/spc/plants            — plants with quality data for a material
  POST /api/spc/validate-material — check material exists with quant results
  GET  /api/spc/materials         — all materials with quantitative data
  POST /api/spc/characteristics   — MIC list for a material (+ optional plant)
  POST /api/spc/chart-data        — time-ordered raw measurements for charts
  POST /api/spc/process-flow      — DAG of material process flow + SPC health
  POST /api/spc/scorecard         — Cp/Cpk summary per material + MIC

All SQL uses named parameters (:name syntax) — no string escaping or inline
user values. Queries execute as the authenticated user via token passthrough
so Unity Catalog row/column-level permissions are enforced automatically.
"""

import asyncio
import math
import re
from typing import Optional

from fastapi import APIRouter, Header, HTTPException, Request
from pydantic import BaseModel, ValidationError, field_validator, model_validator

from backend.utils.db import (
    attach_data_freshness,
    check_warehouse_config,
    resolve_token,
    run_sql,
    run_sql_async,
    sql_param,
    tbl,
)
from backend.utils.spc_thresholds import CPK_CAPABLE, CPK_HIGHLY_CAPABLE, CPK_MARGINAL
from backend.utils.rate_limit import limiter

router = APIRouter()

# In-process caching of process-flow results was removed.
# Rationale: the cache was keyed only by material_id + date range, so results
# from one user (with broad Unity Catalog access) could be served to another
# user (with restricted access), bypassing row-level security policies.
# The Databricks SQL Warehouse result cache handles repeated identical queries
# per authenticated user, making an app-level cache unnecessary.

# ---------------------------------------------------------------------------
# Error handler
# ---------------------------------------------------------------------------

def _handle_sql_error(exc: Exception) -> None:
    """Convert common SQL errors to appropriate HTTP status codes."""
    msg = str(exc).lower()
    if "permission denied" in msg or "no access" in msg or "403" in msg:
        raise HTTPException(status_code=403, detail="Access denied by Unity Catalog policy.")
    if "401" in msg or "unauthorized" in msg:
        raise HTTPException(status_code=401, detail="Token rejected by Databricks.")
    raise HTTPException(status_code=500, detail=str(exc))


def _handle_locked_limits_error(exc: Exception) -> None:
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
    _handle_sql_error(exc)


# ---------------------------------------------------------------------------
# Statistical helpers
# ---------------------------------------------------------------------------

def _normal_cdf(z: float) -> float:
    """Abramowitz & Stegun 26.2.17 approximation, max error 7.5e-8."""
    t    = 1 / (1 + 0.2316419 * abs(z))
    poly = t * (0.319381530 + t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))))
    base = 1 - (1 / math.sqrt(2 * math.pi)) * math.exp(-0.5 * z * z) * poly
    return base if z >= 0 else 1 - base


def _cpk_ci(cpk: float, n: int) -> tuple[Optional[float], Optional[float]]:
    """95% confidence interval on Cpk (Montgomery 2009). Valid for n >= 25."""
    if n < 25:
        return None, None
    se    = math.sqrt(1 / (9 * n) + cpk ** 2 / (2 * (n - 1)))
    lower = round(cpk - 1.96 * se, 3)
    upper = round(cpk + 1.96 * se, 3)
    return lower, upper


def _infer_spec_type(usl: Optional[float], lsl: Optional[float]) -> str:
    """Infer spec type from resolved USL/LSL values.
    One-sided specs are common in ingredient QM (e.g. max moisture, min protein).
    """
    if usl is not None and lsl is not None:
        return "bilateral_symmetric"
    if usl is not None:
        return "unilateral_upper"
    if lsl is not None:
        return "unilateral_lower"
    return "bilateral_symmetric"


# ---------------------------------------------------------------------------
# Pydantic models
# ---------------------------------------------------------------------------

_DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")
_MATERIAL_ID_MAX_LEN = 40


def _validate_date(v: Optional[str], field_name: str) -> Optional[str]:
    if v is not None and not _DATE_RE.match(v):
        raise ValueError(f"{field_name} must be in YYYY-MM-DD format")
    return v


class _DateRangeMixin(BaseModel):
    date_from: Optional[str] = None
    date_to: Optional[str] = None

    @field_validator("date_from")
    @classmethod
    def check_date_from(cls, v: Optional[str]) -> Optional[str]:
        return _validate_date(v, "date_from")

    @field_validator("date_to")
    @classmethod
    def check_date_to(cls, v: Optional[str]) -> Optional[str]:
        return _validate_date(v, "date_to")

    @model_validator(mode="after")
    def check_date_range(self) -> "_DateRangeMixin":
        if self.date_from and self.date_to and self.date_from > self.date_to:
            raise ValueError("date_from must not be after date_to")
        return self


class ValidateMaterialRequest(BaseModel):
    material_id: str

    @field_validator("material_id")
    @classmethod
    def check_material_id(cls, v: str) -> str:
        if len(v) > _MATERIAL_ID_MAX_LEN:
            raise ValueError(f"material_id must be at most {_MATERIAL_ID_MAX_LEN} characters")
        return v


class CharacteristicsRequest(BaseModel):
    material_id: str
    plant_id: Optional[str] = None

    @field_validator("material_id")
    @classmethod
    def check_material_id(cls, v: str) -> str:
        if len(v) > _MATERIAL_ID_MAX_LEN:
            raise ValueError(f"material_id must be at most {_MATERIAL_ID_MAX_LEN} characters")
        return v


class ChartDataRequest(_DateRangeMixin):
    material_id: str
    mic_id: str
    mic_name: Optional[str] = None
    plant_id: Optional[str] = None
    stratify_all: bool = False

    @field_validator("material_id")
    @classmethod
    def check_material_id(cls, v: str) -> str:
        if len(v) > _MATERIAL_ID_MAX_LEN:
            raise ValueError(f"material_id must be at most {_MATERIAL_ID_MAX_LEN} characters")
        return v


class ProcessFlowRequest(_DateRangeMixin):
    material_id: str

    @field_validator("material_id")
    @classmethod
    def check_material_id(cls, v: str) -> str:
        if len(v) > _MATERIAL_ID_MAX_LEN:
            raise ValueError(f"material_id must be at most {_MATERIAL_ID_MAX_LEN} characters")
        return v


class ScorecardRequest(_DateRangeMixin):
    material_id: str
    plant_id: Optional[str] = None

    @field_validator("material_id")
    @classmethod
    def check_material_id(cls, v: str) -> str:
        if len(v) > _MATERIAL_ID_MAX_LEN:
            raise ValueError(f"material_id must be at most {_MATERIAL_ID_MAX_LEN} characters")
        return v


class AttributeCharacteristicsRequest(BaseModel):
    material_id: str
    plant_id: Optional[str] = None

    @field_validator("material_id")
    @classmethod
    def check_material_id(cls, v: str) -> str:
        if len(v) > _MATERIAL_ID_MAX_LEN:
            raise ValueError(f"material_id must be at most {_MATERIAL_ID_MAX_LEN} characters")
        return v


class PChartDataRequest(_DateRangeMixin):
    material_id: str
    mic_id: str
    mic_name: Optional[str] = None
    plant_id: Optional[str] = None

    @field_validator("material_id")
    @classmethod
    def check_material_id(cls, v: str) -> str:
        if len(v) > _MATERIAL_ID_MAX_LEN:
            raise ValueError(f"material_id must be at most {_MATERIAL_ID_MAX_LEN} characters")
        return v


_CHART_TYPES = {"imr", "xbar_r", "p_chart"}
_MIC_ID_MAX_LEN = 40


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@router.get("/plants")
@limiter.limit("120/minute")
async def spc_plants(
    request: Request,
    material_id: str,
    x_forwarded_access_token: Optional[str] = Header(default=None),
    authorization: Optional[str] = Header(default=None),
):
    """Return distinct plants that have produced batches of a material with quality data."""
    token = resolve_token(x_forwarded_access_token, authorization)
    check_warehouse_config()

    query = f"""
        SELECT DISTINCT
            mb.PLANT_ID AS plant_id,
            COALESCE(p.PLANT_NAME, mb.PLANT_ID) AS plant_name
        FROM {tbl('gold_batch_mass_balance_v')} mb
        LEFT JOIN {tbl('gold_plant')} p
            ON p.PLANT_ID = mb.PLANT_ID
        INNER JOIN {tbl('gold_batch_quality_result_v')} r
            ON r.MATERIAL_ID = mb.MATERIAL_ID
           AND r.BATCH_ID    = mb.BATCH_ID
           AND r.QUANTITATIVE_RESULT IS NOT NULL
        WHERE mb.MATERIAL_ID = :material_id
          AND mb.MOVEMENT_CATEGORY = 'Production'
        ORDER BY plant_name
    """
    try:
        rows = await run_sql_async(token, query, [sql_param("material_id", material_id)])
    except Exception as exc:
        _handle_sql_error(exc)

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
    """Check whether a material ID exists and has any quality data (quant or attribute)."""
    token = resolve_token(x_forwarded_access_token, authorization)
    check_warehouse_config()

    query = f"""
        SELECT
            r.MATERIAL_ID AS material_id,
            COALESCE(m.MATERIAL_NAME, r.MATERIAL_ID) AS material_name
        FROM {tbl('gold_batch_quality_result_v')} r
        LEFT JOIN {tbl('gold_material')} m
            ON m.MATERIAL_ID = r.MATERIAL_ID
            AND m.LANGUAGE_ID = 'E'
        WHERE r.MATERIAL_ID = :material_id
          AND (r.QUANTITATIVE_RESULT IS NOT NULL
               OR (r.QUALITATIVE_RESULT IS NOT NULL AND r.QUALITATIVE_RESULT != ''))
        LIMIT 1
    """
    try:
        rows = await run_sql_async(token, query, [sql_param("material_id", body.material_id)])
    except Exception as exc:
        _handle_sql_error(exc)

    if not rows:
        return await attach_data_freshness(
            {"valid": False},
            token,
            ["gold_batch_quality_result_v", "gold_material"],
            request_path=request.url.path,
        )
    row = rows[0]
    return await attach_data_freshness({
        "valid": True,
        "material_id": str(row["material_id"]),
        "material_name": str(row["material_name"]),
    }, token, ["gold_batch_quality_result_v", "gold_material"], request_path=request.url.path)


@router.get("/materials")
@limiter.limit("120/minute")
async def spc_materials(
    request: Request,
    x_forwarded_access_token: Optional[str] = Header(default=None),
    authorization: Optional[str] = Header(default=None),
):
    """Return all materials that have quantitative quality test results."""
    token = resolve_token(x_forwarded_access_token, authorization)
    check_warehouse_config()

    query = f"""
        SELECT DISTINCT
            r.MATERIAL_ID   AS material_id,
            COALESCE(m.MATERIAL_NAME, r.MATERIAL_ID) AS material_name
        FROM {tbl('gold_batch_quality_result_v')} r
        LEFT JOIN {tbl('gold_material')} m
            ON m.MATERIAL_ID = r.MATERIAL_ID
            AND m.LANGUAGE_ID = 'E'
        WHERE r.QUANTITATIVE_RESULT IS NOT NULL
          AND (r.QUALITATIVE_RESULT IS NULL OR r.QUALITATIVE_RESULT = '')
        ORDER BY material_name
    """
    try:
        rows = await run_sql_async(token, query)
    except Exception as exc:
        _handle_sql_error(exc)

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
    """Return all MIC characteristics (quantitative and attribute) in a single scan."""
    token = resolve_token(x_forwarded_access_token, authorization)
    check_warehouse_config()

    params = [sql_param("material_id", body.material_id)]
    # Plant filter intentionally omitted from the MIC list — the characteristics
    # dropdown shows what exists for the material overall. Plant selection filters
    # the chart data, not which MICs are available to choose from.
    # (Most quality-result batches have no matching mass-balance record, so the
    # IN-subquery approach would incorrectly suppress valid MICs.)
    plant_filter = ""

    # Lightweight query — only fields needed to populate the dropdown.
    # Expensive aggregations (STDDEV_POP, AVG, MIN/MAX, TRY_CAST DISTINCT) are
    # omitted because no frontend code reads them from selectedMIC.
    # For quantitative MICs (is_attribute=0) all rows are quantitative, so
    # total_samples / batch_count gives the correct avg_samples_per_batch.
    query = f"""
        SELECT
            MIC_ID                                                       AS mic_id,
            MIC_NAME                                                     AS mic_name,
            INSPECTION_METHOD                                            AS inspection_method,
            MAX(CASE WHEN QUALITATIVE_RESULT IS NOT NULL
                          AND QUALITATIVE_RESULT != ''
                     THEN 1 ELSE 0 END)                                 AS is_attribute,
            COUNT(DISTINCT BATCH_ID)                                     AS batch_count,
            COUNT(*)                                                     AS total_samples
        FROM {tbl('gold_batch_quality_result_v')}
        WHERE MATERIAL_ID = :material_id
          AND (QUANTITATIVE_RESULT IS NOT NULL
               OR (QUALITATIVE_RESULT IS NOT NULL AND QUALITATIVE_RESULT != ''))
          {plant_filter}
        GROUP BY MIC_ID, MIC_NAME, INSPECTION_METHOD
        HAVING COUNT(DISTINCT BATCH_ID) >= 3
        ORDER BY mic_name
    """
    try:
        rows = await run_sql_async(token, query, params)
    except Exception as exc:
        _handle_sql_error(exc)

    characteristics = []
    attr_characteristics = []

    for row in rows:
        is_attr = int(float(row.get("is_attribute") or 0)) == 1
        v = row.get("inspection_method")
        row["inspection_method"] = str(v) if v is not None else None
        row["batch_count"] = int(float(row.get("batch_count") or 0))

        if is_attr:
            row["chart_type"] = "p_chart"
            attr_characteristics.append(row)
        else:
            total_samples = float(row.get("total_samples") or 0)
            batch_count = row["batch_count"] or 1
            avg_spb = total_samples / batch_count
            row["avg_samples_per_batch"] = avg_spb
            row["chart_type"] = "xbar_r" if avg_spb > 1.5 else "imr"
            characteristics.append(row)

    return await attach_data_freshness(
        {"characteristics": characteristics, "attr_characteristics": attr_characteristics},
        token,
        ["gold_batch_quality_result_v", "gold_batch_mass_balance_v"],
        request_path=request.url.path,
    )


@router.post("/chart-data")
@limiter.limit("60/minute")
async def spc_chart_data(
    request: Request,
    body: ChartDataRequest,
    x_forwarded_access_token: Optional[str] = Header(default=None),
    authorization: Optional[str] = Header(default=None),
):
    """
    Return time-ordered raw measurement points for a material + MIC combination.
    Used by the frontend to compute control limits and render control charts.
    """
    token = resolve_token(x_forwarded_access_token, authorization)
    check_warehouse_config()

    rows = await _chart_data_rows(
        token,
        body.material_id,
        body.mic_id,
        body.mic_name,
        body.plant_id,
        body.date_from,
        body.date_to,
        body.stratify_all,
    )

    return await attach_data_freshness(
        {"points": rows, "count": len(rows), "stratified": body.stratify_all},
        token,
        ["gold_batch_quality_result_v", "gold_batch_mass_balance_v"],
        request_path=request.url.path,
    )


async def _chart_data_rows(
    token: str,
    material_id: str,
    mic_id: str,
    mic_name: Optional[str],
    plant_id: Optional[str],
    date_from: Optional[str],
    date_to: Optional[str],
    stratify_all: bool = False,
) -> list[dict]:
    """Shared chart-data fetcher used by both the API endpoint and export flow."""
    params = [
        sql_param("material_id", material_id),
        sql_param("mic_id", mic_id),
    ]
    if mic_name:
        params.append(sql_param("mic_name", mic_name))

    date_clauses = []
    if date_from:
        date_clauses.append("POSTING_DATE >= :date_from")
        params.append(sql_param("date_from", date_from))
    if date_to:
        date_clauses.append("POSTING_DATE <= :date_to")
        params.append(sql_param("date_to", date_to))
    date_filter = ("AND " + " AND ".join(date_clauses)) if date_clauses else ""

    plant_filter = ""
    if plant_id and not stratify_all:
        plant_filter = "AND (bd.plant_id = :plant_id OR bd.plant_id IS NULL)"
        params.append(sql_param("plant_id", plant_id))

    mic_name_filter = "AND r.MIC_NAME = :mic_name" if mic_name else ""
    plant_select = ", plant_id" if stratify_all else ""

    query = f"""
        WITH batch_dates AS (
            SELECT
                MATERIAL_ID,
                BATCH_ID,
                MIN(POSTING_DATE) AS batch_date,
                MAX(PLANT_ID) AS plant_id
            FROM {tbl('gold_batch_mass_balance_v')}
            WHERE MATERIAL_ID = :material_id
              AND MOVEMENT_CATEGORY = 'Production'
              {date_filter}
            GROUP BY MATERIAL_ID, BATCH_ID
        ),
        quality_data AS (
            SELECT
                r.BATCH_ID,
                r.INSPECTION_LOT_ID,
                r.OPERATION_ID,
                r.SAMPLE_ID,
                r.attribute                              AS attribut,
                CAST(r.QUANTITATIVE_RESULT AS DOUBLE)    AS value,
                TRY_CAST(r.TARGET_VALUE AS DOUBLE)       AS nominal,
                TRY_CAST(
                    CASE WHEN LOCATE('...', r.TOLERANCE) > 0
                         THEN SUBSTRING(r.TOLERANCE, 1, LOCATE('...', r.TOLERANCE) - 1)
                    END AS DOUBLE)                        AS lsl,
                TRY_CAST(
                    CASE WHEN LOCATE('...', r.TOLERANCE) > 0
                         THEN SUBSTRING(r.TOLERANCE, LOCATE('...', r.TOLERANCE) + 3)
                    END AS DOUBLE)                        AS usl,
                CASE WHEN LOCATE('...', r.TOLERANCE) = 0
                     THEN TRY_CAST(r.TOLERANCE AS DOUBLE) END AS tolerance,
                r.INSPECTION_RESULT_VALUATION            AS valuation,
                bd.batch_date,
                bd.plant_id,
                ROW_NUMBER() OVER (
                    PARTITION BY r.BATCH_ID
                    ORDER BY r.SAMPLE_ID, r.INSPECTION_LOT_ID
                ) AS sample_seq
            FROM {tbl('gold_batch_quality_result_v')} r
            LEFT JOIN batch_dates bd
                ON bd.MATERIAL_ID = r.MATERIAL_ID
               AND bd.BATCH_ID    = r.BATCH_ID
            WHERE r.MATERIAL_ID = :material_id
              AND r.MIC_ID       = :mic_id
              {mic_name_filter}
              AND r.QUANTITATIVE_RESULT IS NOT NULL
              AND (r.QUALITATIVE_RESULT IS NULL OR r.QUALITATIVE_RESULT = '')
              {plant_filter}
        ),
        ranked AS (
            SELECT *,
                DENSE_RANK() OVER (
                    ORDER BY COALESCE(batch_date, '9999-12-31'), BATCH_ID
                ) AS batch_seq
            FROM quality_data
        )
        SELECT
            BATCH_ID       AS batch_id,
            CAST(batch_date AS STRING) AS batch_date,
            batch_seq,
            sample_seq,
            attribut,
            value,
            nominal,
            tolerance,
            lsl,
            usl,
            valuation
            {plant_select}
        FROM ranked
        ORDER BY batch_seq, sample_seq
    """
    try:
        rows = await run_sql_async(token, query, params)
    except Exception as exc:
        _handle_sql_error(exc)

    numeric_fields = ["value", "nominal", "tolerance", "lsl", "usl", "batch_seq", "sample_seq"]
    for row in rows:
        for field in numeric_fields:
            v = row.get(field)
            if v is not None:
                try:
                    row[field] = float(v) if field not in ("batch_seq", "sample_seq") else int(float(v))
                except (ValueError, TypeError):
                    row[field] = None
        row["is_outlier"] = row.get("attribut") == "*"
        usl = row.get("usl")
        lsl = row.get("lsl")
        if usl is None or lsl is None:
            nominal = row.get("nominal")
            tol = row.get("tolerance")
            if nominal is not None and tol is not None:
                usl = nominal + tol
                lsl = nominal - tol
        row["usl"] = round(usl, 6) if usl is not None else None
        row["lsl"] = round(lsl, 6) if lsl is not None else None
        row["spec_type"] = _infer_spec_type(row["usl"], row["lsl"])
        if "plant_id" not in row:
            row["plant_id"] = None

    return rows


@router.post("/process-flow")
@limiter.limit("30/minute")
async def spc_process_flow(
    request: Request,
    body: ProcessFlowRequest,
    x_forwarded_access_token: Optional[str] = Header(default=None),
    authorization: Optional[str] = Header(default=None),
):
    """
    Return the material process flow graph (nodes + edges) derived from
    gold_batch_lineage, enriched with rejection-rate health colouring per node.
    """
    token = resolve_token(x_forwarded_access_token, authorization)
    check_warehouse_config()

    # Step 1: Walk up to 4 levels upstream and 3 levels downstream
    edges_query = f"""
        WITH RECURSIVE
        upstream AS (
            SELECT DISTINCT
                PARENT_MATERIAL_ID AS material_id,
                0 AS depth
            FROM {tbl('gold_batch_lineage')}
            WHERE CHILD_MATERIAL_ID = :material_id
              AND LINK_TYPE = 'PRODUCTION'
              AND PARENT_MATERIAL_ID IS NOT NULL
            UNION ALL
            SELECT DISTINCT
                bl.PARENT_MATERIAL_ID,
                u.depth + 1
            FROM {tbl('gold_batch_lineage')} bl
            JOIN upstream u ON bl.CHILD_MATERIAL_ID = u.material_id
            WHERE bl.LINK_TYPE = 'PRODUCTION'
              AND bl.PARENT_MATERIAL_ID IS NOT NULL
              AND u.depth < 4
        ),
        downstream AS (
            SELECT DISTINCT
                CHILD_MATERIAL_ID AS material_id,
                0 AS depth
            FROM {tbl('gold_batch_lineage')}
            WHERE PARENT_MATERIAL_ID = :material_id
              AND LINK_TYPE = 'PRODUCTION'
              AND CHILD_MATERIAL_ID IS NOT NULL
            UNION ALL
            SELECT DISTINCT
                bl.CHILD_MATERIAL_ID,
                d.depth + 1
            FROM {tbl('gold_batch_lineage')} bl
            JOIN downstream d ON bl.PARENT_MATERIAL_ID = d.material_id
            WHERE bl.LINK_TYPE = 'PRODUCTION'
              AND bl.CHILD_MATERIAL_ID IS NOT NULL
              AND d.depth < 3
        ),
        all_materials AS (
            SELECT material_id FROM upstream
            UNION
            SELECT material_id FROM downstream
            UNION
            SELECT :material_id AS material_id
        )
        SELECT DISTINCT
            bl.PARENT_MATERIAL_ID AS source,
            bl.CHILD_MATERIAL_ID  AS target
        FROM {tbl('gold_batch_lineage')} bl
        WHERE bl.LINK_TYPE = 'PRODUCTION'
          AND bl.PARENT_MATERIAL_ID IN (SELECT material_id FROM all_materials)
          AND bl.CHILD_MATERIAL_ID  IN (SELECT material_id FROM all_materials)
          AND bl.PARENT_MATERIAL_ID IS NOT NULL
          AND bl.CHILD_MATERIAL_ID  IS NOT NULL
    """
    try:
        edge_rows = await run_sql_async(token, edges_query, [sql_param("material_id", body.material_id)])
    except Exception as exc:
        _handle_sql_error(exc)

    material_ids = {body.material_id}
    for e in edge_rows:
        if e.get("source"):
            material_ids.add(str(e["source"]))
        if e.get("target"):
            material_ids.add(str(e["target"]))

    if not material_ids:
        return await attach_data_freshness(
            {"nodes": [], "edges": []},
            token,
            ["gold_batch_lineage", "gold_material", "gold_plant", "gold_batch_quality_result_v", "gold_batch_mass_balance_v"],
            request_path=request.url.path,
        )

    # Step 2: SPC health per node — use named params for all material IDs
    sorted_mids = sorted(material_ids)
    mat_params = [sql_param(f"m{i}", mid) for i, mid in enumerate(sorted_mids)]
    in_clause = ", ".join(f":m{i}" for i in range(len(sorted_mids)))

    date_params: list[dict] = []
    date_clauses: list[str] = []
    if body.date_from:
        date_clauses.append("mb.POSTING_DATE >= :date_from")
        date_params.append(sql_param("date_from", body.date_from))
    if body.date_to:
        date_clauses.append("mb.POSTING_DATE <= :date_to")
        date_params.append(sql_param("date_to", body.date_to))
    date_filter_mb = ("AND " + " AND ".join(date_clauses)) if date_clauses else ""

    health_query = f"""
        SELECT
            r.MATERIAL_ID                                               AS material_id,
            COALESCE(m.MATERIAL_NAME, r.MATERIAL_ID)                    AS material_name,
            p.PLANT_NAME                                                AS plant_name,
            COUNT(DISTINCT r.BATCH_ID)                                  AS total_batches,
            COUNT(DISTINCT CASE
                WHEN r.INSPECTION_RESULT_VALUATION = 'R' THEN r.BATCH_ID
            END)                                                        AS rejected_batches,
            COUNT(DISTINCT r.MIC_ID)                                    AS mic_count
        FROM {tbl('gold_batch_quality_result_v')} r
        LEFT JOIN {tbl('gold_material')} m
            ON m.MATERIAL_ID = r.MATERIAL_ID AND m.LANGUAGE_ID = 'E'
        LEFT JOIN {tbl('gold_batch_mass_balance_v')} mb
            ON mb.MATERIAL_ID = r.MATERIAL_ID
           AND mb.BATCH_ID    = r.BATCH_ID
           AND mb.MOVEMENT_CATEGORY = 'Production'
        LEFT JOIN {tbl('gold_plant')} p
            ON p.PLANT_ID = mb.PLANT_ID
        WHERE r.MATERIAL_ID IN ({in_clause})
          {date_filter_mb}
        GROUP BY r.MATERIAL_ID, m.MATERIAL_NAME, p.PLANT_NAME
    """
    try:
        health_rows = await run_sql_async(token, health_query, mat_params + date_params)
    except Exception as exc:
        _handle_sql_error(exc)

    health_by_mat: dict = {}
    for row in health_rows:
        mid = str(row.get("material_id", ""))
        for field in ["total_batches", "rejected_batches", "mic_count"]:
            v = row.get(field)
            row[field] = int(float(v)) if v is not None else 0

        rejected = row.get("rejected_batches", 0)
        total = row.get("total_batches", 1) or 1
        rejection_rate = rejected / total

        if total < 5:
            row["status"] = "grey"
        elif rejection_rate < 0.02:
            row["status"] = "green"
        elif rejection_rate < 0.10:
            row["status"] = "amber"
        else:
            row["status"] = "red"

        # Cpk is meaningless when aggregated across all MICs — omit it
        row["estimated_cpk"] = None
        row["mean_value"] = None
        row["stddev_value"] = None

        health_by_mat[mid] = row

    nodes = []
    for mid in material_ids:
        health = health_by_mat.get(mid, {})
        nodes.append({
            "id": mid,
            "material_id": mid,
            "material_name": health.get("material_name") or mid,
            "plant_name": health.get("plant_name"),
            "total_batches": health.get("total_batches", 0),
            "rejected_batches": health.get("rejected_batches", 0),
            "mic_count": health.get("mic_count", 0),
            "mean_value": health.get("mean_value"),
            "stddev_value": health.get("stddev_value"),
            "estimated_cpk": health.get("estimated_cpk"),
            "status": health.get("status", "grey"),
            "is_root": mid == body.material_id,
        })

    seen_edges: set = set()
    edges = []
    for e in edge_rows:
        src = str(e.get("source", ""))
        tgt = str(e.get("target", ""))
        if src and tgt and (src, tgt) not in seen_edges:
            seen_edges.add((src, tgt))
            edges.append({"source": src, "target": tgt})

    return await attach_data_freshness(
        {"nodes": nodes, "edges": edges},
        token,
        ["gold_batch_lineage", "gold_material", "gold_plant", "gold_batch_quality_result_v", "gold_batch_mass_balance_v"],
        request_path=request.url.path,
    )


# ---------------------------------------------------------------------------
# Shared scorecard data helper (used by scorecard endpoint + export router)
# ---------------------------------------------------------------------------

async def _scorecard_rows(
    token: str,
    material_id: str,
    plant_id: Optional[str],
    date_from: Optional[str],
    date_to: Optional[str],
) -> list[dict]:
    """
    Execute the scorecard SQL and post-process rows into capability metrics.

    Returns Pp/Ppk (overall process performance) using STDDEV_SAMP (N−1 denominator)
    per AIAG SPC 4th Edition. Cp/Cpk (within-subgroup) are NOT included — they require
    within-subgroup sigma estimated from R̄/d2, which is not available from a SQL aggregate.

    Spec type is inferred from resolved USL/LSL to handle unilateral specs correctly.
    """
    params = [sql_param("material_id", material_id)]
    sc_clauses: list[str] = []
    if date_from:
        sc_clauses.append("mb.POSTING_DATE >= :date_from")
        params.append(sql_param("date_from", date_from))
    if date_to:
        sc_clauses.append("mb.POSTING_DATE <= :date_to")
        params.append(sql_param("date_to", date_to))
    if plant_id:
        sc_clauses.append("mb.PLANT_ID = :plant_id")
        params.append(sql_param("plant_id", plant_id))
    date_filter = ("AND " + " AND ".join(sc_clauses)) if sc_clauses else ""

    query = f"""
        SELECT
            r.MIC_ID                                                AS mic_id,
            r.MIC_NAME                                              AS mic_name,
            COUNT(DISTINCT r.BATCH_ID)                              AS batch_count,
            COUNT(*)                                                AS sample_count,
            ROUND(AVG(CAST(r.QUANTITATIVE_RESULT AS DOUBLE)), 4)    AS mean_value,
            ROUND(STDDEV_SAMP(CAST(r.QUANTITATIVE_RESULT AS DOUBLE)), 4) AS stddev_overall,
            ROUND(MIN(CAST(r.QUANTITATIVE_RESULT AS DOUBLE)), 4)   AS min_value,
            ROUND(MAX(CAST(r.QUANTITATIVE_RESULT AS DOUBLE)), 4)   AS max_value,
            MAX(TRY_CAST(r.TARGET_VALUE AS DOUBLE))                 AS nominal_target,
            -- Parse 'LSL...USL' range format (e.g. '0.816...0.836')
            MAX(TRY_CAST(
                CASE WHEN LOCATE('...', r.TOLERANCE) > 0
                     THEN SUBSTRING(r.TOLERANCE, 1, LOCATE('...', r.TOLERANCE) - 1)
                END AS DOUBLE))                                      AS lsl_spec,
            MAX(TRY_CAST(
                CASE WHEN LOCATE('...', r.TOLERANCE) > 0
                     THEN SUBSTRING(r.TOLERANCE, LOCATE('...', r.TOLERANCE) + 3)
                END AS DOUBLE))                                      AS usl_spec,
            -- Fallback: plain numeric half-width format
            MAX(CASE WHEN LOCATE('...', r.TOLERANCE) = 0
                     THEN TRY_CAST(r.TOLERANCE AS DOUBLE) END)      AS tolerance_half_width,
            COUNT(DISTINCT r.TARGET_VALUE)                           AS distinct_nominal_count,
            COUNT(DISTINCT r.TOLERANCE)                              AS distinct_tolerance_count,
            COUNT(DISTINCT CASE
                WHEN r.INSPECTION_RESULT_VALUATION = 'R' THEN r.BATCH_ID
            END)                                                    AS ooc_batches,
            COUNT(DISTINCT CASE
                WHEN r.INSPECTION_RESULT_VALUATION = 'A' THEN r.BATCH_ID
            END)                                                    AS accepted_batches
        FROM {tbl('gold_batch_quality_result_v')} r
        LEFT JOIN {tbl('gold_batch_mass_balance_v')} mb
            ON mb.MATERIAL_ID = r.MATERIAL_ID
           AND mb.BATCH_ID    = r.BATCH_ID
           AND mb.MOVEMENT_CATEGORY = 'Production'
        WHERE r.MATERIAL_ID = :material_id
          AND r.QUANTITATIVE_RESULT IS NOT NULL
          AND (r.QUALITATIVE_RESULT IS NULL OR r.QUALITATIVE_RESULT = '')
          {date_filter}
        GROUP BY r.MIC_ID, r.MIC_NAME
        HAVING COUNT(DISTINCT r.BATCH_ID) >= 3
        ORDER BY r.MIC_NAME
    """
    try:
        rows = await run_sql_async(token, query, params)
    except Exception as exc:
        _handle_sql_error(exc)

    numeric_fields = [
        "batch_count", "sample_count", "mean_value", "stddev_overall",
        "min_value", "max_value", "nominal_target", "tolerance_half_width",
        "lsl_spec", "usl_spec", "ooc_batches", "accepted_batches",
    ]
    for row in rows:
        for field in numeric_fields:
            v = row.get(field)
            if v is not None:
                try:
                    row[field] = float(v)
                except (ValueError, TypeError):
                    row[field] = None

        stddev = row.get("stddev_overall") or 0
        mean_v = row.get("mean_value")
        nominal = row.get("nominal_target")

        # Resolve spec limits: prefer parsed range, fall back to nominal ± half-width
        usl = row.get("usl_spec")
        lsl = row.get("lsl_spec")
        if usl is None or lsl is None:
            tol_val = row.get("tolerance_half_width")
            if nominal is not None and tol_val is not None and tol_val > 0:
                usl = nominal + tol_val
                lsl = nominal - tol_val

        spec_type = _infer_spec_type(usl, lsl)
        row["spec_type"] = spec_type
        row["usl"] = round(usl, 6) if usl is not None else None
        row["lsl"] = round(lsl, 6) if lsl is not None else None

        # Pp/Ppk — overall process performance using sample stddev (STDDEV_SAMP, N−1)
        # Cp/Cpk are not included: they require within-subgroup sigma (R̄/d2) which
        # cannot be computed from a single SQL aggregate across all batches.
        pp = ppk = None
        if stddev > 0 and mean_v is not None:
            if usl is not None and lsl is not None:
                spec_width = usl - lsl
                pp = round(spec_width / (6 * stddev), 3)
                ppk = round(min((usl - mean_v) / (3 * stddev), (mean_v - lsl) / (3 * stddev)), 3)
            elif usl is not None:
                ppk = round((usl - mean_v) / (3 * stddev), 3)
            elif lsl is not None:
                ppk = round((mean_v - lsl) / (3 * stddev), 3)

        row["pp"] = pp
        row["ppk"] = ppk

        # Z-score and DPMO derived from Ppk (Motorola 1.5σ long-term shift convention)
        if ppk is not None:
            z_score = round(ppk * 3, 3)
            dpmo    = round(_normal_cdf(-(z_score - 1.5)) * 1_000_000)
        else:
            z_score, dpmo = None, None
        row["z_score"] = z_score
        row["dpmo"]    = dpmo
        row["dpmo_convention"] = "motorola_1.5sigma_shift"

        nom_count = int(row.get("distinct_nominal_count") or 0)
        tol_count = int(row.get("distinct_tolerance_count") or 0)
        row["has_mixed_spec"] = nom_count > 1 or tol_count > 1
        row["spec_warning"] = (
            "Capability computed from mixed specification values in selected range."
            if row["has_mixed_spec"] else None
        )

        # Status based on Ppk (overall performance, the honest metric available here)
        if ppk is None:
            row["capability_status"] = "grey"
        elif ppk >= CPK_HIGHLY_CAPABLE:
            row["capability_status"] = "excellent"
        elif ppk >= CPK_CAPABLE:
            row["capability_status"] = "good"
        elif ppk >= CPK_MARGINAL:
            row["capability_status"] = "marginal"
        else:
            row["capability_status"] = "poor"

        total = row.get("batch_count") or 1
        ooc = row.get("ooc_batches") or 0
        row["ooc_rate"] = round(ooc / total, 4)

    # Sort by Ppk ascending so the least capable characteristics appear first
    rows.sort(key=lambda r: (r.get("ppk") is None, r.get("ppk") or 0))
    return rows


@router.post("/scorecard")
@limiter.limit("45/minute")
async def spc_scorecard(
    request: Request,
    body: ScorecardRequest,
    x_forwarded_access_token: Optional[str] = Header(default=None),
    authorization: Optional[str] = Header(default=None),
):
    """Return Pp/Ppk scorecard — one row per MIC characteristic for the material."""
    token = resolve_token(x_forwarded_access_token, authorization)
    check_warehouse_config()
    rows = await _scorecard_rows(token, body.material_id, body.plant_id, body.date_from, body.date_to)
    return await attach_data_freshness(
        {"scorecard": rows, "material_id": body.material_id},
        token,
        ["gold_batch_quality_result_v", "gold_batch_mass_balance_v"],
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
    """Return MICs with attribute (accept/reject) data — candidates for P-charts."""
    token = resolve_token(x_forwarded_access_token, authorization)
    check_warehouse_config()

    params = [sql_param("material_id", body.material_id)]
    plant_filter = ""
    if body.plant_id:
        plant_filter = f"""
              AND BATCH_ID IN (
                  SELECT DISTINCT BATCH_ID
                  FROM {tbl('gold_batch_mass_balance_v')}
                  WHERE PLANT_ID = :plant_id
                    AND MOVEMENT_CATEGORY = 'Production'
              )"""
        params.append(sql_param("plant_id", body.plant_id))

    query = f"""
        SELECT
            MIC_ID                              AS mic_id,
            MIC_NAME                            AS mic_name,
            COUNT(DISTINCT BATCH_ID)            AS batch_count,
            COUNT(*)                            AS total_inspected,
            SUM(CASE WHEN INSPECTION_RESULT_VALUATION = 'R' THEN 1 ELSE 0 END)
                                                AS total_nonconforming
        FROM {tbl('gold_batch_quality_result_v')}
        WHERE MATERIAL_ID = :material_id
          AND QUALITATIVE_RESULT IS NOT NULL
          AND QUALITATIVE_RESULT != ''
          AND INSPECTION_RESULT_VALUATION IN ('A', 'R')
          {plant_filter}
        GROUP BY MIC_ID, MIC_NAME
        HAVING COUNT(DISTINCT BATCH_ID) >= 3
        ORDER BY mic_name
    """
    try:
        rows = await run_sql_async(token, query, params)
    except Exception as exc:
        _handle_sql_error(exc)

    for row in rows:
        for field in ("batch_count", "total_inspected", "total_nonconforming"):
            v = row.get(field)
            row[field] = int(float(v)) if v is not None else 0
        total = row["total_inspected"] or 1
        row["p_bar"] = round(row["total_nonconforming"] / total, 4)
        row["chart_type"] = "p_chart"

    return await attach_data_freshness(
        {"characteristics": rows},
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
    """Return per-batch proportion nonconforming for a P-chart."""
    token = resolve_token(x_forwarded_access_token, authorization)
    check_warehouse_config()

    params = [
        sql_param("material_id", body.material_id),
        sql_param("mic_id", body.mic_id),
    ]
    if body.mic_name:
        params.append(sql_param("mic_name", body.mic_name))
    mb_clauses = []
    if body.date_from:
        mb_clauses.append("mb.POSTING_DATE >= :date_from")
        params.append(sql_param("date_from", body.date_from))
    if body.date_to:
        mb_clauses.append("mb.POSTING_DATE <= :date_to")
        params.append(sql_param("date_to", body.date_to))
    if body.plant_id:
        mb_clauses.append("mb.PLANT_ID = :plant_id")
        params.append(sql_param("plant_id", body.plant_id))
    date_filter = ("AND " + " AND ".join(mb_clauses)) if mb_clauses else ""
    mic_name_filter_attr = "AND r.MIC_NAME = :mic_name" if body.mic_name else ""

    query = f"""
        WITH batch_dates AS (
            SELECT MATERIAL_ID, BATCH_ID, MIN(POSTING_DATE) AS batch_date
            FROM {tbl('gold_batch_mass_balance_v')} mb
            WHERE mb.MATERIAL_ID = :material_id
              AND mb.MOVEMENT_CATEGORY = 'Production'
              {date_filter}
            GROUP BY MATERIAL_ID, BATCH_ID
        ),
        attr_data AS (
            SELECT
                r.BATCH_ID,
                bd.batch_date,
                COUNT(*) AS n_inspected,
                SUM(CASE WHEN r.INSPECTION_RESULT_VALUATION = 'R' THEN 1 ELSE 0 END) AS n_nonconforming
            FROM {tbl('gold_batch_quality_result_v')} r
            INNER JOIN batch_dates bd
                ON bd.MATERIAL_ID = r.MATERIAL_ID AND bd.BATCH_ID = r.BATCH_ID
            WHERE r.MATERIAL_ID = :material_id
              AND r.MIC_ID       = :mic_id
              {mic_name_filter_attr}
              AND r.QUALITATIVE_RESULT IS NOT NULL
              AND r.QUALITATIVE_RESULT != ''
              AND r.INSPECTION_RESULT_VALUATION IN ('A', 'R')
            GROUP BY r.BATCH_ID, bd.batch_date
        )
        SELECT
            BATCH_ID        AS batch_id,
            CAST(batch_date AS STRING) AS batch_date,
            DENSE_RANK() OVER (ORDER BY COALESCE(batch_date, '9999-12-31'), BATCH_ID) AS batch_seq,
            n_inspected,
            n_nonconforming,
            ROUND(n_nonconforming / GREATEST(n_inspected, 1), 4) AS p_value
        FROM attr_data
        ORDER BY batch_seq
    """
    try:
        rows = await run_sql_async(token, query, params)
    except Exception as exc:
        _handle_sql_error(exc)

    for row in rows:
        row["batch_seq"]       = int(float(row.get("batch_seq", 0) or 0))
        row["n_inspected"]     = int(float(row.get("n_inspected", 0) or 0))
        row["n_nonconforming"] = int(float(row.get("n_nonconforming", 0) or 0))
        row["p_value"]         = float(row.get("p_value", 0) or 0)

    return await attach_data_freshness(
        {"points": rows, "count": len(rows)},
        token,
        ["gold_batch_quality_result_v", "gold_batch_mass_balance_v"],
        request_path=request.url.path,
    )


# ---------------------------------------------------------------------------
# Feature 11: Count charts (C / U / NP)
# ---------------------------------------------------------------------------

class CountChartDataRequest(_DateRangeMixin):
    material_id: str
    mic_id: str
    mic_name: Optional[str] = None
    plant_id: Optional[str] = None
    chart_subtype: str = "c"  # 'c' | 'u' | 'np'

    @field_validator("material_id")
    @classmethod
    def check_material_id(cls, v: str) -> str:
        if len(v) > _MATERIAL_ID_MAX_LEN:
            raise ValueError(f"material_id must be at most {_MATERIAL_ID_MAX_LEN} characters")
        return v

    @field_validator("chart_subtype")
    @classmethod
    def check_chart_subtype(cls, v: str) -> str:
        if v not in ("c", "u", "np"):
            raise ValueError("chart_subtype must be 'c', 'u', or 'np'")
        return v


@router.post("/count-chart-data")
@limiter.limit("60/minute")
async def spc_count_chart_data(
    request: Request,
    body: CountChartDataRequest,
    x_forwarded_access_token: Optional[str] = Header(default=None),
    authorization: Optional[str] = Header(default=None),
):
    """Return per-batch defect counts for C / U / NP charts."""
    token = resolve_token(x_forwarded_access_token, authorization)
    check_warehouse_config()

    params = [
        sql_param("material_id", body.material_id),
        sql_param("mic_id", body.mic_id),
    ]
    if body.mic_name:
        params.append(sql_param("mic_name", body.mic_name))
    mb_clauses: list[str] = []
    if body.date_from:
        mb_clauses.append("mb.POSTING_DATE >= :date_from")
        params.append(sql_param("date_from", body.date_from))
    if body.date_to:
        mb_clauses.append("mb.POSTING_DATE <= :date_to")
        params.append(sql_param("date_to", body.date_to))
    if body.plant_id:
        mb_clauses.append("mb.PLANT_ID = :plant_id")
        params.append(sql_param("plant_id", body.plant_id))
    date_filter = ("AND " + " AND ".join(mb_clauses)) if mb_clauses else ""
    mic_name_filter = "AND r.MIC_NAME = :mic_name" if body.mic_name else ""

    query = f"""
        WITH batch_dates AS (
            SELECT MATERIAL_ID, BATCH_ID, MIN(POSTING_DATE) AS batch_date
            FROM {tbl('gold_batch_mass_balance_v')} mb
            WHERE mb.MATERIAL_ID = :material_id
              AND mb.MOVEMENT_CATEGORY = 'Production'
              {date_filter}
            GROUP BY MATERIAL_ID, BATCH_ID
        ),
        counts AS (
            SELECT
                r.BATCH_ID,
                bd.batch_date,
                COUNT(*) AS n_inspected,
                SUM(CASE WHEN r.INSPECTION_RESULT_VALUATION = 'R' THEN 1 ELSE 0 END) AS defect_count
            FROM {tbl('gold_batch_quality_result_v')} r
            INNER JOIN batch_dates bd
                ON bd.MATERIAL_ID = r.MATERIAL_ID AND bd.BATCH_ID = r.BATCH_ID
            WHERE r.MATERIAL_ID = :material_id
              AND r.MIC_ID       = :mic_id
              {mic_name_filter}
              AND r.QUALITATIVE_RESULT IS NOT NULL
              AND r.QUALITATIVE_RESULT != ''
              AND r.INSPECTION_RESULT_VALUATION IN ('A', 'R')
            GROUP BY r.BATCH_ID, bd.batch_date
        )
        SELECT
            BATCH_ID AS batch_id,
            CAST(batch_date AS STRING) AS batch_date,
            DENSE_RANK() OVER (ORDER BY COALESCE(batch_date, '9999-12-31'), BATCH_ID) AS batch_seq,
            n_inspected,
            defect_count
        FROM counts
        ORDER BY batch_seq
    """
    try:
        rows = await run_sql_async(token, query, params)
    except Exception as exc:
        _handle_sql_error(exc)

    for row in rows:
        row["batch_seq"]    = int(float(row.get("batch_seq", 0) or 0))
        row["n_inspected"]  = int(float(row.get("n_inspected", 0) or 0))
        row["defect_count"] = int(float(row.get("defect_count", 0) or 0))

    return await attach_data_freshness(
        {"points": rows, "count": len(rows), "chart_subtype": body.chart_subtype},
        token,
        ["gold_batch_quality_result_v", "gold_batch_mass_balance_v"],
        request_path=request.url.path,
    )


# ---------------------------------------------------------------------------
# Feature 2: Locked Phase II Control Limits
# ---------------------------------------------------------------------------

class LockLimitsRequest(BaseModel):
    material_id: str
    mic_id: str
    plant_id: Optional[str] = None
    chart_type: str
    cl: float
    ucl: float
    lcl: float
    ucl_r: Optional[float] = None
    lcl_r: Optional[float] = None
    sigma_within: Optional[float] = None
    baseline_from: Optional[str] = None
    baseline_to: Optional[str] = None

    @field_validator("material_id")
    @classmethod
    def check_material_id(cls, v: str) -> str:
        if len(v) > _MATERIAL_ID_MAX_LEN:
            raise ValueError(f"material_id must be at most {_MATERIAL_ID_MAX_LEN} characters")
        return v

    @field_validator("mic_id")
    @classmethod
    def check_mic_id(cls, v: str) -> str:
        if len(v) > _MIC_ID_MAX_LEN:
            raise ValueError(f"mic_id must be at most {_MIC_ID_MAX_LEN} characters")
        return v

    @field_validator("chart_type")
    @classmethod
    def check_chart_type(cls, v: str) -> str:
        if v not in _CHART_TYPES:
            raise ValueError(f"chart_type must be one of {sorted(_CHART_TYPES)}")
        return v

    @model_validator(mode="after")
    def check_limit_order(self) -> "LockLimitsRequest":
        if self.ucl <= self.lcl:
            raise ValueError("ucl must be greater than lcl")
        return self


class GetLockedLimitsRequest(BaseModel):
    material_id: str
    mic_id: str
    plant_id: Optional[str] = None
    chart_type: str

    @field_validator("material_id")
    @classmethod
    def check_material_id(cls, v: str) -> str:
        if len(v) > _MATERIAL_ID_MAX_LEN:
            raise ValueError(f"material_id must be at most {_MATERIAL_ID_MAX_LEN} characters")
        return v

    @field_validator("mic_id")
    @classmethod
    def check_mic_id(cls, v: str) -> str:
        if len(v) > _MIC_ID_MAX_LEN:
            raise ValueError(f"mic_id must be at most {_MIC_ID_MAX_LEN} characters")
        return v

    @field_validator("chart_type")
    @classmethod
    def check_chart_type(cls, v: str) -> str:
        if v not in _CHART_TYPES:
            raise ValueError(f"chart_type must be one of {sorted(_CHART_TYPES)}")
        return v


class DeleteLockedLimitsRequest(BaseModel):
    material_id: str
    mic_id: str
    plant_id: Optional[str] = None
    chart_type: str

    @field_validator("material_id")
    @classmethod
    def check_material_id(cls, v: str) -> str:
        if len(v) > _MATERIAL_ID_MAX_LEN:
            raise ValueError(f"material_id must be at most {_MATERIAL_ID_MAX_LEN} characters")
        return v

    @field_validator("mic_id")
    @classmethod
    def check_mic_id(cls, v: str) -> str:
        if len(v) > _MIC_ID_MAX_LEN:
            raise ValueError(f"mic_id must be at most {_MIC_ID_MAX_LEN} characters")
        return v

    @field_validator("chart_type")
    @classmethod
    def check_chart_type(cls, v: str) -> str:
        if v not in _CHART_TYPES:
            raise ValueError(f"chart_type must be one of {sorted(_CHART_TYPES)}")
        return v


@router.post("/locked-limits")
@limiter.limit("30/minute")
async def lock_limits(
    request: Request,
    body: LockLimitsRequest,
    x_forwarded_access_token: Optional[str] = Header(default=None),
    authorization: Optional[str] = Header(default=None),
):
    """Upsert locked Phase II control limits for a material/MIC/plant combination."""
    token = resolve_token(x_forwarded_access_token, authorization)
    check_warehouse_config()

    params = [
        sql_param("material_id", body.material_id),
        sql_param("mic_id", body.mic_id),
        sql_param("chart_type", body.chart_type),
        sql_param("cl", body.cl),
        sql_param("ucl", body.ucl),
        sql_param("lcl", body.lcl),
        sql_param("ucl_r", body.ucl_r),
        sql_param("lcl_r", body.lcl_r),
        sql_param("sigma_within", body.sigma_within),
        sql_param("baseline_from", body.baseline_from),
        sql_param("baseline_to", body.baseline_to),
    ]

    if body.plant_id:
        source_plant_expr = "CAST(:plant_id AS STRING)"
        plant_on_clause = "COALESCE(t.plant_id, '') = COALESCE(s.plant_id, '')"
        params.append(sql_param("plant_id", body.plant_id))
    else:
        source_plant_expr = "NULL"
        plant_on_clause = "t.plant_id IS NULL AND s.plant_id IS NULL"

    merge_sql = f"""
        MERGE INTO {tbl('spc_locked_limits')} AS t
        USING (SELECT
            :material_id   AS material_id,
            :mic_id        AS mic_id,
            {source_plant_expr} AS plant_id,
            :chart_type    AS chart_type,
            :cl            AS cl,
            :ucl           AS ucl,
            :lcl           AS lcl,
            :ucl_r         AS ucl_r,
            :lcl_r         AS lcl_r,
            :sigma_within  AS sigma_within,
            :baseline_from AS baseline_from,
            :baseline_to   AS baseline_to,
            CURRENT_USER() AS locked_by,
            CURRENT_TIMESTAMP() AS locked_at
        ) AS s
        ON t.material_id = s.material_id
           AND t.mic_id  = s.mic_id
           AND t.chart_type = s.chart_type
           AND {plant_on_clause}
        WHEN MATCHED THEN UPDATE SET
            t.cl = s.cl,
            t.ucl = s.ucl,
            t.lcl = s.lcl,
            t.ucl_r = s.ucl_r,
            t.lcl_r = s.lcl_r,
            t.sigma_within = s.sigma_within,
            t.baseline_from = s.baseline_from,
            t.baseline_to = s.baseline_to,
            t.locked_by = s.locked_by,
            t.locked_at = s.locked_at
        WHEN NOT MATCHED THEN INSERT (
            material_id, mic_id, plant_id, chart_type,
            cl, ucl, lcl, ucl_r, lcl_r, sigma_within,
            baseline_from, baseline_to, locked_by, locked_at
        ) VALUES (
            s.material_id, s.mic_id, s.plant_id, s.chart_type,
            s.cl, s.ucl, s.lcl, s.ucl_r, s.lcl_r, s.sigma_within,
            s.baseline_from, s.baseline_to, s.locked_by, s.locked_at
        )
    """
    try:
        await run_sql_async(token, merge_sql, params)
    except Exception as exc:
        _handle_locked_limits_error(exc)

    return {"saved": True}


@router.get("/locked-limits")
@limiter.limit("120/minute")
async def get_locked_limits(
    request: Request,
    material_id: str,
    mic_id: str,
    plant_id: Optional[str] = None,
    chart_type: str = "imr",
    x_forwarded_access_token: Optional[str] = Header(default=None),
    authorization: Optional[str] = Header(default=None),
):
    """Retrieve locked Phase II control limits."""
    token = resolve_token(x_forwarded_access_token, authorization)
    check_warehouse_config()

    try:
        GetLockedLimitsRequest(
            material_id=material_id,
            mic_id=mic_id,
            plant_id=plant_id,
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
        plant_filter = "AND plant_id = :plant_id"
        params.append(sql_param("plant_id", plant_id))
    else:
        plant_filter = "AND plant_id IS NULL"

    query = f"""
        SELECT material_id, mic_id, plant_id, chart_type,
               cl, ucl, lcl, ucl_r, lcl_r, sigma_within,
               baseline_from, baseline_to, locked_by, locked_at
        FROM {tbl('spc_locked_limits')}
        WHERE material_id = :material_id
          AND mic_id = :mic_id
          AND chart_type = :chart_type
          {plant_filter}
        ORDER BY locked_at DESC
        LIMIT 1
    """
    try:
        rows = await run_sql_async(token, query, params)
    except Exception as exc:
        _handle_locked_limits_error(exc)

    if not rows:
        return {"locked_limits": None}

    row = rows[0]
    for field in ("cl", "ucl", "lcl", "ucl_r", "lcl_r", "sigma_within"):
        v = row.get(field)
        row[field] = float(v) if v is not None else None
    if row.get("locked_at") is not None:
        row["locked_at"] = str(row["locked_at"])

    return {"locked_limits": row}


@router.delete("/locked-limits")
@limiter.limit("30/minute")
async def delete_locked_limits(
    request: Request,
    body: DeleteLockedLimitsRequest,
    x_forwarded_access_token: Optional[str] = Header(default=None),
    authorization: Optional[str] = Header(default=None),
):
    """Delete locked control limits for a material/MIC/plant."""
    token = resolve_token(x_forwarded_access_token, authorization)
    check_warehouse_config()

    params = [
        sql_param("material_id", body.material_id),
        sql_param("mic_id", body.mic_id),
        sql_param("chart_type", body.chart_type),
    ]
    if body.plant_id:
        plant_filter = "AND plant_id = :plant_id"
        params.append(sql_param("plant_id", body.plant_id))
    else:
        plant_filter = "AND plant_id IS NULL"

    query = f"""
        DELETE FROM {tbl('spc_locked_limits')}
        WHERE material_id = :material_id
          AND mic_id = :mic_id
          AND chart_type = :chart_type
          {plant_filter}
    """
    try:
        await run_sql_async(token, query, params)
    except Exception as exc:
        _handle_locked_limits_error(exc)

    return {"deleted": True}


# ---------------------------------------------------------------------------
# Feature 14: Multi-Material Comparison
# ---------------------------------------------------------------------------

class CompareScorecardsRequest(_DateRangeMixin):
    material_ids: list[str]
    plant_id: Optional[str] = None

    @field_validator("material_ids")
    @classmethod
    def check_material_ids(cls, v: list[str]) -> list[str]:
        if len(v) < 2 or len(v) > 3:
            raise ValueError("material_ids must contain 2 or 3 items")
        for mid in v:
            if len(mid) > _MATERIAL_ID_MAX_LEN:
                raise ValueError(f"material_id '{mid}' exceeds maximum length")
        return v


@router.post("/compare-scorecard")
@limiter.limit("10/minute")
async def compare_scorecard(
    request: Request,
    body: CompareScorecardsRequest,
    x_forwarded_access_token: Optional[str] = Header(default=None),
    authorization: Optional[str] = Header(default=None),
):
    """Return scorecard data for 2–3 materials for side-by-side comparison."""
    token = resolve_token(x_forwarded_access_token, authorization)
    check_warehouse_config()

    material_ids = list(dict.fromkeys(body.material_ids))
    name_params = [sql_param(f"m{i}", mid) for i, mid in enumerate(material_ids)]
    in_clause = ", ".join(f":m{i}" for i in range(len(material_ids)))

    names_query = f"""
        SELECT
            MATERIAL_ID AS material_id,
            COALESCE(
                MAX(CASE WHEN LANGUAGE_ID = 'E' THEN MATERIAL_NAME END),
                MAX(MATERIAL_NAME),
                MATERIAL_ID
            ) AS material_name
        FROM {tbl('gold_material')}
        WHERE MATERIAL_ID IN ({in_clause})
        GROUP BY MATERIAL_ID
    """

    try:
        scorecard_sets, name_rows = await asyncio.gather(
            asyncio.gather(*[
                _scorecard_rows(token, mat_id, body.plant_id, body.date_from, body.date_to)
                for mat_id in material_ids
            ]),
            run_sql_async(token, names_query, name_params),
        )
    except Exception as exc:
        _handle_sql_error(exc)

    material_names = {
        str(row["material_id"]): str(row.get("material_name") or row["material_id"])
        for row in name_rows
    }

    results = []
    all_mic_sets: list[set] = []
    for mat_id, scorecard in zip(material_ids, scorecard_sets):
        mic_ids_for_mat = {str(row["mic_id"]) for row in scorecard}
        results.append({
            "material_id": mat_id,
            "material_name": material_names.get(mat_id, mat_id),
            "scorecard": [
                {
                    "mic_id": row["mic_id"],
                    "mic_name": row["mic_name"],
                    "ppk": row.get("ppk"),
                    "batch_count": row.get("batch_count"),
                    "ooc_rate": row.get("ooc_rate"),
                }
                for row in scorecard
            ],
        })
        all_mic_sets.append(mic_ids_for_mat)

    # Common MICs across all materials
    if all_mic_sets:
        common_mic_ids = all_mic_sets[0].intersection(*all_mic_sets[1:])
    else:
        common_mic_ids = set()

    # Collect common MIC names from first material
    common_mics = []
    if results:
        for row in results[0]["scorecard"]:
            if str(row["mic_id"]) in common_mic_ids:
                common_mics.append({"mic_id": row["mic_id"], "mic_name": row["mic_name"]})

    return {"materials": results, "common_mics": common_mics}


# ---------------------------------------------------------------------------
# Feature 7: MSA / Gauge R&R — save session
# ---------------------------------------------------------------------------

class SaveMSARequest(BaseModel):
    material_id: str
    mic_id: str
    n_operators: int
    n_parts: int
    n_replicates: int
    grr_pct: float
    repeatability: float
    reproducibility: float
    ndc: int
    results_json: str  # JSON string of full results

    @field_validator("material_id")
    @classmethod
    def check_material_id(cls, v: str) -> str:
        if len(v) > _MATERIAL_ID_MAX_LEN:
            raise ValueError(f"material_id must be at most {_MATERIAL_ID_MAX_LEN} characters")
        return v

    @field_validator("results_json")
    @classmethod
    def check_results_json(cls, v: str) -> str:
        if len(v) > 65_535:
            raise ValueError("results_json too large (max 65535 chars)")
        return v


@router.post("/msa/save")
@limiter.limit("10/minute")
async def msa_save(
    request: Request,
    body: SaveMSARequest,
    x_forwarded_access_token: Optional[str] = Header(default=None),
    authorization: Optional[str] = Header(default=None),
):
    """Save an MSA (Gauge R&R) session to the Delta table."""
    import uuid as _uuid
    token = resolve_token(x_forwarded_access_token, authorization)
    check_warehouse_config()

    session_id = str(_uuid.uuid4())
    params = [
        sql_param("session_id", session_id),
        sql_param("material_id", body.material_id),
        sql_param("mic_id", body.mic_id),
        sql_param("n_operators", body.n_operators),
        sql_param("n_parts", body.n_parts),
        sql_param("n_replicates", body.n_replicates),
        sql_param("grr_pct", body.grr_pct),
        sql_param("repeatability", body.repeatability),
        sql_param("reproducibility", body.reproducibility),
        sql_param("ndc", body.ndc),
        sql_param("results_json", body.results_json),
    ]
    query = f"""
        INSERT INTO {tbl('spc_msa_sessions')}
            (session_id, material_id, mic_id, created_by, created_at,
             n_operators, n_parts, n_replicates, results_json, grr_pct,
             repeatability, reproducibility, ndc)
        VALUES (
            :session_id, :material_id, :mic_id, CURRENT_USER(), CURRENT_TIMESTAMP(),
            :n_operators, :n_parts, :n_replicates, :results_json, :grr_pct,
            :repeatability, :reproducibility, :ndc
        )
    """
    try:
        await run_sql_async(token, query, params)
    except Exception as exc:
        _handle_sql_error(exc)

    return {"saved": True, "session_id": session_id}


# ---------------------------------------------------------------------------
# Feature 17: Correlation Explorer
# ---------------------------------------------------------------------------

class CorrelationRequest(_DateRangeMixin):
    material_id: str
    plant_id: Optional[str] = None
    min_batches: int = 10

    @field_validator("material_id")
    @classmethod
    def check_material_id(cls, v: str) -> str:
        if len(v) > _MATERIAL_ID_MAX_LEN:
            raise ValueError(f"material_id must be at most {_MATERIAL_ID_MAX_LEN} characters")
        return v

    @field_validator("min_batches")
    @classmethod
    def check_min_batches(cls, v: int) -> int:
        if v < 5 or v > 100:
            raise ValueError("min_batches must be between 5 and 100")
        return v


@router.post("/correlation")
@limiter.limit("5/minute")
async def spc_correlation(
    request: Request,
    body: CorrelationRequest,
    x_forwarded_access_token: Optional[str] = Header(default=None),
    authorization: Optional[str] = Header(default=None),
):
    """Compute pairwise Pearson correlations between all MICs for a material."""
    token = resolve_token(x_forwarded_access_token, authorization)
    check_warehouse_config()

    params = [
        sql_param("material_id", body.material_id),
        sql_param("min_batches", body.min_batches),
    ]
    date_clauses: list[str] = []
    if body.date_from:
        date_clauses.append("mb.POSTING_DATE >= :date_from")
        params.append(sql_param("date_from", body.date_from))
    if body.date_to:
        date_clauses.append("mb.POSTING_DATE <= :date_to")
        params.append(sql_param("date_to", body.date_to))
    date_filter = ("AND " + " AND ".join(date_clauses)) if date_clauses else ""
    corr_plant_filter = ""
    if body.plant_id:
        corr_plant_filter = "AND (bd.plant_id = :plant_id OR bd.plant_id IS NULL)"
        params.append(sql_param("plant_id", body.plant_id))

    query = f"""
        WITH batch_dates AS (
            SELECT MATERIAL_ID, BATCH_ID, MIN(POSTING_DATE) AS batch_date,
                   MAX(PLANT_ID) AS plant_id
            FROM {tbl('gold_batch_mass_balance_v')} mb
            WHERE mb.MATERIAL_ID = :material_id
              AND mb.MOVEMENT_CATEGORY = 'Production'
              {date_filter}
            GROUP BY MATERIAL_ID, BATCH_ID
        ),
        batch_avgs AS (
            SELECT
                r.MIC_ID,
                r.MIC_NAME,
                r.BATCH_ID,
                AVG(CAST(r.QUANTITATIVE_RESULT AS DOUBLE)) AS avg_result
            FROM {tbl('gold_batch_quality_result_v')} r
            LEFT JOIN batch_dates bd
                ON bd.MATERIAL_ID = r.MATERIAL_ID AND bd.BATCH_ID = r.BATCH_ID
            WHERE r.MATERIAL_ID = :material_id
              AND r.QUANTITATIVE_RESULT IS NOT NULL
              AND (r.QUALITATIVE_RESULT IS NULL OR r.QUALITATIVE_RESULT = '')
              {corr_plant_filter}
            GROUP BY r.MIC_ID, r.MIC_NAME, r.BATCH_ID
        ),
        mic_batch_counts AS (
            SELECT MIC_ID, COUNT(DISTINCT BATCH_ID) AS n
            FROM batch_avgs
            GROUP BY MIC_ID
        ),
        qualified_mics AS (
            SELECT MIC_ID FROM mic_batch_counts WHERE n >= :min_batches
        ),
        corr_pairs AS (
            SELECT
                a.MIC_ID    AS mic_a,
                a.MIC_NAME  AS mic_name_a,
                b.MIC_ID    AS mic_b,
                b.MIC_NAME  AS mic_name_b,
                CORR(a.avg_result, b.avg_result) AS pearson_r,
                COUNT(*)    AS shared_batches
            FROM batch_avgs a
            JOIN batch_avgs b
                ON a.BATCH_ID = b.BATCH_ID
                AND a.MIC_ID < b.MIC_ID
            WHERE a.MIC_ID IN (SELECT MIC_ID FROM qualified_mics)
              AND b.MIC_ID IN (SELECT MIC_ID FROM qualified_mics)
            GROUP BY a.MIC_ID, a.MIC_NAME, b.MIC_ID, b.MIC_NAME
            HAVING COUNT(*) >= :min_batches
        )
        SELECT mic_a, mic_name_a, mic_b, mic_name_b,
               ROUND(pearson_r, 4) AS pearson_r,
               shared_batches
        FROM corr_pairs
        ORDER BY ABS(pearson_r) DESC
        LIMIT 500
    """
    try:
        rows = await run_sql_async(token, query, params)
    except Exception as exc:
        _handle_sql_error(exc)

    # Collect unique MICs from pairs
    mic_map: dict[str, str] = {}
    for row in rows:
        row["pearson_r"] = float(row.get("pearson_r") or 0)
        row["shared_batches"] = int(float(row.get("shared_batches") or 0))
        mic_map[str(row["mic_a"])] = str(row.get("mic_name_a", row["mic_a"]))
        mic_map[str(row["mic_b"])] = str(row.get("mic_name_b", row["mic_b"]))

    mics = [{"mic_id": k, "mic_name": v} for k, v in sorted(mic_map.items(), key=lambda x: x[1])]

    return await attach_data_freshness(
        {"pairs": rows, "mics": mics, "pair_count": len(rows)},
        token,
        ["gold_batch_quality_result_v", "gold_batch_mass_balance_v"],
        request_path=request.url.path,
    )


class CorrelationScatterRequest(_DateRangeMixin):
    material_id: str
    mic_a_id: str
    mic_b_id: str
    plant_id: Optional[str] = None

    @field_validator("material_id", "mic_a_id", "mic_b_id")
    @classmethod
    def check_lengths(cls, v: str) -> str:
        if len(v) > _MATERIAL_ID_MAX_LEN:
            raise ValueError(f"field must be at most {_MATERIAL_ID_MAX_LEN} characters")
        return v


@router.post("/correlation-scatter")
@limiter.limit("20/minute")
async def spc_correlation_scatter(
    request: Request,
    body: CorrelationScatterRequest,
    x_forwarded_access_token: Optional[str] = Header(default=None),
    authorization: Optional[str] = Header(default=None),
):
    """Return per-batch averaged (x, y) pairs for a scatter plot of two MICs."""
    token = resolve_token(x_forwarded_access_token, authorization)
    check_warehouse_config()

    params = [
        sql_param("material_id", body.material_id),
        sql_param("mic_a_id", body.mic_a_id),
        sql_param("mic_b_id", body.mic_b_id),
    ]
    date_clauses: list[str] = []
    if body.date_from:
        date_clauses.append("mb.POSTING_DATE >= :date_from")
        params.append(sql_param("date_from", body.date_from))
    if body.date_to:
        date_clauses.append("mb.POSTING_DATE <= :date_to")
        params.append(sql_param("date_to", body.date_to))
    date_filter = ("AND " + " AND ".join(date_clauses)) if date_clauses else ""
    plant_filter = ""
    if body.plant_id:
        plant_filter = "AND (bd.plant_id = :plant_id OR bd.plant_id IS NULL)"
        params.append(sql_param("plant_id", body.plant_id))

    query = f"""
        WITH batch_dates AS (
            SELECT MATERIAL_ID, BATCH_ID,
                   MIN(POSTING_DATE) AS batch_date,
                   MAX(PLANT_ID)     AS plant_id
            FROM {tbl('gold_batch_mass_balance_v')} mb
            WHERE mb.MATERIAL_ID       = :material_id
              AND mb.MOVEMENT_CATEGORY = 'Production'
              {date_filter}
            GROUP BY MATERIAL_ID, BATCH_ID
        ),
        mic_a_avgs AS (
            SELECT r.BATCH_ID,
                   ANY_VALUE(r.MIC_NAME) AS mic_name,
                   AVG(CAST(r.QUANTITATIVE_RESULT AS DOUBLE)) AS avg_val
            FROM {tbl('gold_batch_quality_result_v')} r
            LEFT JOIN batch_dates bd
                ON bd.MATERIAL_ID = r.MATERIAL_ID AND bd.BATCH_ID = r.BATCH_ID
            WHERE r.MATERIAL_ID = :material_id
              AND r.MIC_ID      = :mic_a_id
              AND r.QUANTITATIVE_RESULT IS NOT NULL
              AND (r.QUALITATIVE_RESULT IS NULL OR r.QUALITATIVE_RESULT = '')
              {plant_filter}
            GROUP BY r.BATCH_ID
        ),
        mic_b_avgs AS (
            SELECT r.BATCH_ID,
                   ANY_VALUE(r.MIC_NAME) AS mic_name,
                   AVG(CAST(r.QUANTITATIVE_RESULT AS DOUBLE)) AS avg_val
            FROM {tbl('gold_batch_quality_result_v')} r
            LEFT JOIN batch_dates bd
                ON bd.MATERIAL_ID = r.MATERIAL_ID AND bd.BATCH_ID = r.BATCH_ID
            WHERE r.MATERIAL_ID = :material_id
              AND r.MIC_ID      = :mic_b_id
              AND r.QUANTITATIVE_RESULT IS NOT NULL
              AND (r.QUALITATIVE_RESULT IS NULL OR r.QUALITATIVE_RESULT = '')
              {plant_filter}
            GROUP BY r.BATCH_ID
        )
        SELECT
            a.BATCH_ID                            AS batch_id,
            CAST(bd.batch_date AS STRING)         AS batch_date,
            a.avg_val                             AS x,
            b.avg_val                             AS y,
            a.mic_name                            AS mic_a_name,
            b.mic_name                            AS mic_b_name
        FROM mic_a_avgs a
        JOIN mic_b_avgs b ON a.BATCH_ID = b.BATCH_ID
        LEFT JOIN batch_dates bd ON bd.BATCH_ID = a.BATCH_ID
        ORDER BY bd.batch_date, a.BATCH_ID
    """
    try:
        rows = await run_sql_async(token, query, params)
    except Exception as exc:
        _handle_sql_error(exc)

    mic_a_name = rows[0].get("mic_a_name", body.mic_a_id) if rows else body.mic_a_id
    mic_b_name = rows[0].get("mic_b_name", body.mic_b_id) if rows else body.mic_b_id

    points = []
    for row in rows:
        x = row.get("x")
        y = row.get("y")
        try:
            x = float(x) if x is not None else None
            y = float(y) if y is not None else None
        except (ValueError, TypeError):
            x = y = None
        if x is not None and y is not None:
            points.append({
                "batch_id":   str(row.get("batch_id", "")),
                "batch_date": str(row.get("batch_date") or ""),
                "x": round(x, 6),
                "y": round(y, 6),
            })

    # Pearson r from the filtered points
    n = len(points)
    pearson_r = None
    if n >= 3:
        xs = [p["x"] for p in points]
        ys = [p["y"] for p in points]
        mx = sum(xs) / n
        my = sum(ys) / n
        num   = sum((xi - mx) * (yi - my) for xi, yi in zip(xs, ys))
        den_x = sum((xi - mx) ** 2 for xi in xs) ** 0.5
        den_y = sum((yi - my) ** 2 for yi in ys) ** 0.5
        if den_x > 0 and den_y > 0:
            pearson_r = round(num / (den_x * den_y), 4)

    return {
        "points":     points,
        "n":          n,
        "pearson_r":  pearson_r,
        "mic_a_name": mic_a_name,
        "mic_b_name": mic_b_name,
    }
