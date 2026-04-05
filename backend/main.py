"""
TraceApp – FastAPI backend (Recall Command Center)

Serves the React SPA and exposes:
  - /api/trace: recursive CTE top-down traceability + quality status
  - /api/summary: KPIs (produced, shipped, stock, mass balance)
  - /api/batch-details: consolidated CoA + stock + impact for a batch
  - /api/impact: customers, countries, cross-batch exposure

Queries aligned with Batch Traceability Dashboard V6.

Every endpoint:
  1. Reads x-forwarded-access-token from headers
  2. Connects to SQL Warehouse as that user so Unity Catalog
     row/column permissions are enforced automatically.
"""

import asyncio
import os
import logging
import uuid
from pathlib import Path
from typing import Optional

from fastapi import FastAPI, HTTPException, Header, Request
from starlette.requests import Request as StarletteRequest
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from starlette.responses import Response
from backend.utils.db import (
    DATABRICKS_HOST,
    TRACE_CATALOG,
    TRACE_SCHEMA,
    WAREHOUSE_HTTP_PATH,
    check_warehouse_config,
    get_data_freshness,
    hostname,
    resolve_token,
    run_sql,
    run_sql_async,
    sql_param,
    tbl,
)
from backend.utils.rate_limit import (
    RateLimitExceeded,
    SlowAPIMiddleware,
    limiter,
    rate_limit_handler,
)


# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------
# Core env vars are imported from backend.utils.db (single source of truth).
MAX_TRACE_LEVELS: int = int(os.environ.get("MAX_TRACE_LEVELS", "10"))
# Debug endpoints only active when APP_ENV is explicitly 'development'.
# Any other value (including unset) silently returns 404.
ENABLE_DEBUG_ENDPOINTS: bool = os.environ.get("APP_ENV", "").strip().lower() == "development"

STATIC_DIR: Path = Path(__file__).parent.parent / "frontend" / "dist"

# ---------------------------------------------------------------------------
# App
# ---------------------------------------------------------------------------
app = FastAPI(title="TraceApp API", docs_url="/api/docs", redoc_url=None)
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, rate_limit_handler)
app.add_middleware(SlowAPIMiddleware)

from backend.routers.spc import router as spc_router  # noqa: E402
from backend.routers.export import router as export_router  # noqa: E402
app.include_router(spc_router, prefix="/api/spc", tags=["SPC"])
app.include_router(export_router, prefix="/api/spc", tags=["SPC Export"])


# ---------------------------------------------------------------------------
# Global exception handler
# ---------------------------------------------------------------------------
@app.exception_handler(Exception)
async def global_exception_handler(request: StarletteRequest, exc: Exception):
    if isinstance(exc, HTTPException):
        return JSONResponse(
            status_code=exc.status_code,
            content={"detail": exc.detail},
        )
    error_id = str(uuid.uuid4())
    logging.getLogger(__name__).exception(
        "Unhandled exception error_id=%s method=%s path=%s",
        error_id,
        request.method,
        request.url.path,
    )
    return JSONResponse(
        status_code=500,
        content={
            "detail": "Internal server error",
            "error_id": error_id,
        },
    )


# ---------------------------------------------------------------------------
# Pydantic models
# ---------------------------------------------------------------------------
class TraceRequest(BaseModel):
    material_id: str
    batch_id: str

class SummaryRequest(BaseModel):
    batch_id: str

class ImpactRequest(BaseModel):
    batch_id: str

class BatchDetailsRequest(BaseModel):
    material_id: str
    batch_id: str


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
# resolve_token, check_warehouse_config, run_sql, sql_param, tbl, hostname
# are all imported from backend.utils.db.


def _with_freshness(payload: dict, token: str, source_views: list[str]) -> dict:
    try:
        payload["data_freshness"] = get_data_freshness(token, source_views)
    except Exception as exc:
        payload["data_freshness"] = {
            "error": str(exc)[:300],
            "sources": [],
        }
    return payload


def _build_tree(rows: list[dict]) -> Optional[dict]:
    if not rows:
        return None

    # Deduplicate rows: if same (material_id, batch_id) appears with multiple
    # parents, keep only the lowest-depth row to avoid shared-object cycles.
    seen: dict[tuple, dict] = {}
    for row in rows:
        key = (str(row["material_id"]), str(row["batch_id"]))
        if key not in seen or row.get("depth", 0) < seen[key].get("depth", 0):
            seen[key] = row
    rows = list(seen.values())

    nodes: dict[tuple, dict] = {}
    for row in rows:
        key = (str(row["material_id"]), str(row["batch_id"]))
        status = str(row.get("release_status", "Unknown")).strip()
        if status == "Released":
            color, tier = "#10b981", "Pass"
        elif status in ["Blocked", "Rejected", "Expired"]:
            color, tier = "#ef4444", "Critical"
        elif status in ["QI Hold", "Restricted"]:
            color, tier = "#f59e0b", "Warning"
        else:
            color, tier = "#9ca3af", "Unknown"

        nodes[key] = {
            "name": str(row["material_id"]),
            "status": status,
            "riskTier": tier,
            "nodeColor": color,
            "attributes": {
                "Batch": str(row["batch_id"]),
                "Depth": row.get("depth", 0),
                "Plant": row.get("plant_name", "Unknown Plant"),
            },
            "children": [],
        }

    # Build parent→children index from deduplicated rows
    children_of: dict[tuple, list[tuple]] = {k: [] for k in nodes}
    root: Optional[dict] = None
    root_key: Optional[tuple] = None

    for row in rows:
        key = (str(row["material_id"]), str(row["batch_id"]))
        p_mat = row.get("parent_material_id")
        p_bat = row.get("parent_batch_id")
        if p_mat is None or p_bat is None:
            if root is not None:
                # Multiple roots: take lowest depth
                if row.get("depth", 0) < nodes[root_key]["attributes"]["Depth"]:
                    root = nodes[key]
                    root_key = key
            else:
                root = nodes[key]
                root_key = key
        else:
            parent_key = (str(p_mat), str(p_bat))
            if parent_key in nodes:
                children_of[parent_key].append(key)

    # Wire children with cycle guard — iterative (stack-based) to avoid recursion limit
    if root_key:
        stack: list[tuple[tuple, frozenset]] = [(root_key, frozenset({root_key}))]
        while stack:
            parent_key, ancestors = stack.pop()
            for child_key in children_of.get(parent_key, []):
                if child_key in ancestors:
                    logging.getLogger(__name__).warning(
                        "Cycle detected in _build_tree: %s → %s already in ancestor path",
                        parent_key, child_key,
                    )
                    continue
                nodes[parent_key]["children"].append(nodes[child_key])
                stack.append((child_key, ancestors | {child_key}))

    return root


# ---------------------------------------------------------------------------
# API routes
# ---------------------------------------------------------------------------


@app.get("/api/health")
async def health():
    """Unauthenticated liveness probe — returns 200 if the process is up."""
    return {"status": "ok"}


@app.get("/api/health/debug")
async def health_debug(
    x_forwarded_access_token: Optional[str] = Header(default=None),
    authorization: Optional[str] = Header(default=None),
):
    """Authenticated debug endpoint — shows config detail. Requires a valid token."""
    if not ENABLE_DEBUG_ENDPOINTS:
        raise HTTPException(status_code=404, detail="Not found")
    resolve_token(x_forwarded_access_token, authorization)
    return {
        "status": "ok",
        "databricks_host": DATABRICKS_HOST[:50] if DATABRICKS_HOST else "(NOT SET)",
        "hostname_resolved": hostname()[:50] if hostname() else "(EMPTY)",
        "warehouse_http_path": WAREHOUSE_HTTP_PATH if WAREHOUSE_HTTP_PATH else "(NOT SET)",
        "trace_catalog": TRACE_CATALOG,
        "trace_schema": TRACE_SCHEMA,
        "static_dir_exists": STATIC_DIR.exists(),
        "python_version": __import__('sys').version,
    }


@app.get("/api/test-query")
async def test_query(
    x_forwarded_access_token: Optional[str] = Header(default=None),
    authorization: Optional[str] = Header(default=None),
):
    """Debug: verify SQL connectivity via the shared run_sql helper."""
    if not ENABLE_DEBUG_ENDPOINTS:
        raise HTTPException(status_code=404, detail="Not found")

    token = resolve_token(x_forwarded_access_token, authorization)
    info: dict = {
        "token_present": True,
        "token_length": len(token),
    }
    try:
        rows = run_sql(token, "SELECT 1 AS ok")
        info["result"] = rows
        info["status"] = "ok"
    except Exception as exc:
        info["status"] = "error"
        info["error"] = str(exc)[:500]
    return info


@app.post("/api/trace")
@limiter.limit("30/minute")
async def trace(
    request: Request,
    body: TraceRequest,
    x_forwarded_access_token: Optional[str] = Header(default=None),
    authorization: Optional[str] = Header(default=None),
):
    """
    Top-down trace aligned with Dashboard V6 dataset cb4b5774.
    Uses gold_batch_lineage recursive CTE with cycle detection.
    Uses inline escaped values and REST API to avoid
    databricks-sql-connector recursion bug with WITH RECURSIVE.
    """
    token = resolve_token(x_forwarded_access_token, authorization)
    check_warehouse_config()

    # Uses REST API (not databricks-sql-connector) to avoid recursion bug with WITH RECURSIVE.
    # Named parameters (:mat, :bat) prevent SQL injection.
    trace_params = [
        sql_param("mat", body.material_id),
        sql_param("bat", body.batch_id),
    ]

    query = f"""
        WITH RECURSIVE unique_edges AS (
          SELECT DISTINCT
            PARENT_MATERIAL_ID, PARENT_BATCH_ID, PARENT_PLANT_ID,
            CHILD_MATERIAL_ID, CHILD_BATCH_ID, CHILD_PLANT_ID, LINK_TYPE
          FROM {tbl("gold_batch_lineage")}
          WHERE CHILD_BATCH_ID IS NOT NULL
            AND LINK_TYPE IN ('PRODUCTION', 'BATCH_TRANSFER', 'STO_TRANSFER')
        ),
        production_plant AS (
          SELECT MAX(CHILD_PLANT_ID) AS PLANT_ID
          FROM {tbl("gold_batch_lineage")}
          WHERE CHILD_MATERIAL_ID = :mat
            AND CHILD_BATCH_ID = :bat
            AND LINK_TYPE = 'PRODUCTION'
        ),
        trace AS (
          SELECT
            CASE WHEN LINK_TYPE = 'PRODUCTION' THEN 2 ELSE 1 END AS trace_level,
            CHILD_MATERIAL_ID AS MATERIAL_ID,
            CHILD_BATCH_ID AS BATCH_ID,
            CHILD_PLANT_ID AS PLANT_ID,
            LINK_TYPE,
            PARENT_MATERIAL_ID,
            PARENT_BATCH_ID,
            CONCAT(',', CHILD_MATERIAL_ID, '|', CHILD_BATCH_ID, '|', CHILD_PLANT_ID, ',') AS path
          FROM unique_edges
          JOIN production_plant pp ON unique_edges.PARENT_PLANT_ID = pp.PLANT_ID
          WHERE PARENT_MATERIAL_ID = :mat AND PARENT_BATCH_ID = :bat
          UNION ALL
          SELECT
            t.trace_level + 1,
            e.CHILD_MATERIAL_ID,
            e.CHILD_BATCH_ID,
            e.CHILD_PLANT_ID,
            e.LINK_TYPE,
            e.PARENT_MATERIAL_ID,
            e.PARENT_BATCH_ID,
            CONCAT(t.path, e.CHILD_MATERIAL_ID, '|', e.CHILD_BATCH_ID, '|', e.CHILD_PLANT_ID, ',')
          FROM unique_edges e
          JOIN trace t
            ON e.PARENT_MATERIAL_ID = t.MATERIAL_ID
            AND e.PARENT_BATCH_ID = t.BATCH_ID
            AND e.PARENT_PLANT_ID = t.PLANT_ID
          WHERE t.trace_level < {MAX_TRACE_LEVELS}
            AND INSTR(t.path, CONCAT(',', e.CHILD_MATERIAL_ID, '|', e.CHILD_BATCH_ID, '|', e.CHILD_PLANT_ID, ',')) = 0
        ),
        distinct_trace AS (
          SELECT DISTINCT
            trace_level, MATERIAL_ID, BATCH_ID, PLANT_ID, LINK_TYPE,
            PARENT_MATERIAL_ID, PARENT_BATCH_ID
          FROM trace
        ),
        all_nodes AS (
          -- Root node
          SELECT
            0 AS depth,
            :mat AS material_id,
            :bat AS batch_id,
            CAST(NULL AS STRING) AS parent_material_id,
            CAST(NULL AS STRING) AS parent_batch_id,
            CAST(NULL AS STRING) AS plant_id
          UNION ALL
          -- Traced children
          SELECT
            dt.trace_level AS depth,
            dt.MATERIAL_ID AS material_id,
            dt.BATCH_ID AS batch_id,
            dt.PARENT_MATERIAL_ID AS parent_material_id,
            dt.PARENT_BATCH_ID AS parent_batch_id,
            dt.PLANT_ID AS plant_id
          FROM distinct_trace dt
        )
        SELECT DISTINCT
          n.material_id,
          n.batch_id,
          n.parent_material_id,
          n.parent_batch_id,
          m.MATERIAL_NAME AS material_description,
          n.depth,
          p.PLANT_NAME AS plant_name,
          CASE
            WHEN COALESCE(stk.BLOCKED, 0) > 0
              OR COALESCE(qs.rejected_result_count, 0) > 0 THEN 'Blocked'
            WHEN COALESCE(stk.QUALITY_INSPECTION, 0) > 0
              OR COALESCE(qs.failed_mic_count, 0) > 0 THEN 'QI Hold'
            WHEN COALESCE(qs.accepted_result_count, 0) > 0 THEN 'Released'
            WHEN COALESCE(stk.UNRESTRICTED, 0) > 0 THEN 'Released'
            ELSE 'Unknown'
          END AS release_status
        FROM all_nodes n
        LEFT JOIN {tbl("gold_material")} m
          ON m.MATERIAL_ID = n.material_id AND m.LANGUAGE_ID = 'E'
        LEFT JOIN {tbl("gold_plant")} p
          ON p.PLANT_ID = n.plant_id
        LEFT JOIN {tbl("gold_batch_quality_summary_v")} qs
          ON qs.MATERIAL_ID = n.material_id AND qs.BATCH_ID = n.batch_id
        LEFT JOIN (
          SELECT MATERIAL_ID, BATCH_ID,
            SUM(UNRESTRICTED) AS UNRESTRICTED,
            SUM(BLOCKED) AS BLOCKED,
            SUM(QUALITY_INSPECTION) AS QUALITY_INSPECTION,
            SUM(RESTRICTED) AS RESTRICTED
          FROM {tbl("gold_batch_stock_v")}
          GROUP BY MATERIAL_ID, BATCH_ID
        ) stk ON stk.MATERIAL_ID = n.material_id AND stk.BATCH_ID = n.batch_id
        ORDER BY n.depth, n.material_id
    """

    try:
        rows = run_sql(token, query, trace_params)
    except Exception as exc:
        error_msg = str(exc).lower()
        if "permission denied" in error_msg or "no access" in error_msg:
            raise HTTPException(status_code=403, detail="Access Denied.") from exc
        raise HTTPException(status_code=500, detail=str(exc)) from exc

    if not rows:
        raise HTTPException(
            status_code=404,
            detail=f"No traceability data found for Material '{body.material_id}', Batch '{body.batch_id}'.",
        )

    tree = _build_tree(rows)
    return _with_freshness(
        {"tree": tree, "total_nodes": len(rows)},
        token,
        [
            "gold_batch_lineage",
            "gold_material",
            "gold_plant",
            "gold_batch_quality_summary_v",
            "gold_batch_stock_v",
        ],
    )


@app.post("/api/summary")
@limiter.limit("60/minute")
async def summary(
    request: Request,
    body: SummaryRequest,
    x_forwarded_access_token: Optional[str] = Header(default=None),
    authorization: Optional[str] = Header(default=None),
):
    """
    KPI summary aligned with Dashboard V6 datasets:
    Batch Disposition (1f206aa1) + Mass Balance (35d26cb5).
    """
    token = resolve_token(x_forwarded_access_token, authorization)
    check_warehouse_config()

    query = f"""
        WITH stk AS (
          SELECT
            SUM(UNRESTRICTED) AS current_stock_unrestricted,
            SUM(BLOCKED + RESTRICTED) AS current_stock_blocked,
            SUM(TOTAL_STOCK) AS actual_stock
          FROM {tbl('gold_batch_stock_v')}
          WHERE BATCH_ID = :batch_id
        ),
        mb AS (
          SELECT
            COALESCE(SUM(CASE WHEN MOVEMENT_CATEGORY = 'Production' THEN ABS_QUANTITY ELSE 0 END), 0) AS total_produced,
            COALESCE(SUM(CASE WHEN MOVEMENT_CATEGORY = 'Shipment'   THEN ABS_QUANTITY ELSE 0 END), 0) AS total_shipped
          FROM {tbl('gold_batch_mass_balance_v')}
          WHERE BATCH_ID = :batch_id
            AND MOVEMENT_CATEGORY NOT LIKE 'STO%'
        )
        SELECT
          :batch_id AS batch_id,
          mb.total_produced,
          mb.total_shipped,
          COALESCE(stk.current_stock_unrestricted, 0) AS current_stock_unrestricted,
          COALESCE(stk.current_stock_blocked, 0) AS current_stock_blocked,
          COALESCE(stk.actual_stock, 0) AS actual_stock,
          COALESCE(stk.actual_stock, 0) -
            (mb.total_produced - mb.total_shipped) AS mass_balance_variance
        FROM mb CROSS JOIN stk
    """

    try:
        rows = run_sql(token, query, [sql_param("batch_id", body.batch_id)])
    except Exception as exc:
        error_msg = str(exc).lower()
        if "permission denied" in error_msg or "no access" in error_msg:
            raise HTTPException(status_code=403, detail="Access Denied.") from exc
        raise HTTPException(status_code=500, detail=str(exc)) from exc

    if not rows:
        raise HTTPException(status_code=404, detail=f"No summary data for Batch '{body.batch_id}'.")

    return _with_freshness(
        rows[0],
        token,
        ["gold_batch_stock_v", "gold_batch_mass_balance_v"],
    )


@app.post("/api/batch-details")
@limiter.limit("30/minute")
async def batch_details(
    request: Request,
    body: BatchDetailsRequest,
    x_forwarded_access_token: Optional[str] = Header(default=None),
    authorization: Optional[str] = Header(default=None),
):
    """
    Consolidated batch details aligned with Dashboard V6 datasets:
    Batch Disposition, CoA Results, Deliveries, Cross-Batch, Mass Balance.
    """
    token = resolve_token(x_forwarded_access_token, authorization)
    check_warehouse_config()
    mat_batch = [sql_param("material_id", body.material_id), sql_param("batch_id", body.batch_id)]

    summary_query = f"""
        WITH stk AS (
          SELECT
            SUM(UNRESTRICTED) AS current_stock_unrestricted,
            SUM(BLOCKED + RESTRICTED) AS current_stock_blocked,
            SUM(TOTAL_STOCK) AS actual_stock
          FROM {tbl('gold_batch_stock_v')}
          WHERE MATERIAL_ID = :material_id AND BATCH_ID = :batch_id
        ),
        mb AS (
          SELECT
            COALESCE(SUM(CASE WHEN MOVEMENT_CATEGORY = 'Production' THEN ABS_QUANTITY ELSE 0 END), 0) AS total_produced,
            COALESCE(SUM(CASE WHEN MOVEMENT_CATEGORY = 'Shipment'   THEN ABS_QUANTITY ELSE 0 END), 0) AS total_shipped
          FROM {tbl('gold_batch_mass_balance_v')}
          WHERE MATERIAL_ID = :material_id AND BATCH_ID = :batch_id
            AND MOVEMENT_CATEGORY NOT LIKE 'STO%'
        )
        SELECT
          :batch_id AS batch_id,
          mb.total_produced,
          mb.total_shipped,
          COALESCE(stk.current_stock_unrestricted, 0) AS current_stock_unrestricted,
          COALESCE(stk.current_stock_blocked, 0) AS current_stock_blocked,
          COALESCE(stk.actual_stock, 0) AS actual_stock,
          COALESCE(stk.actual_stock, 0) -
            (mb.total_produced - mb.total_shipped) AS mass_balance_variance
        FROM mb CROSS JOIN stk
    """
    coa_query = f"""
        SELECT
          r.MIC_ID AS mic_code,
          r.MIC_NAME AS mic_name,
          r.TARGET_VALUE AS target_value,
          r.TOLERANCE AS tolerance_range,
          r.QUANTITATIVE_RESULT AS actual_result,
          r.INSPECTION_RESULT_VALUATION AS result_status,
          CASE
            WHEN r.QUANTITATIVE_RESULT IS NOT NULL
              AND r.TARGET_VALUE IS NOT NULL
              AND TRY_CAST(r.TOLERANCE AS DOUBLE) IS NOT NULL
            THEN CASE
              WHEN ABS(r.QUANTITATIVE_RESULT - r.TARGET_VALUE)
                   <= TRY_CAST(r.TOLERANCE AS DOUBLE)
              THEN 'Within spec' ELSE 'Out of spec'
            END
            WHEN r.INSPECTION_RESULT_VALUATION = 'A' THEN 'Within spec'
            WHEN r.INSPECTION_RESULT_VALUATION = 'R' THEN 'Out of spec'
            ELSE 'No result'
          END AS within_spec,
          CASE
            WHEN r.QUANTITATIVE_RESULT IS NOT NULL AND r.TARGET_VALUE IS NOT NULL
            THEN ROUND(r.QUANTITATIVE_RESULT - r.TARGET_VALUE, 4)
            ELSE NULL
          END AS deviation_from_target
        FROM {tbl('gold_batch_quality_result_v')} r
        LEFT JOIN {tbl('gold_batch_quality_lot_v')} l
          ON l.INSPECTION_LOT_ID = r.INSPECTION_LOT_ID
          AND l.MATERIAL_ID = r.MATERIAL_ID
          AND l.BATCH_ID = r.BATCH_ID
        WHERE r.MATERIAL_ID = :material_id AND r.BATCH_ID = :batch_id
        ORDER BY r.INSPECTION_LOT_ID, r.OPERATION_ID, r.MIC_ID, r.SAMPLE_ID
    """
    customer_query = f"""
        SELECT DISTINCT
          CUSTOMER_NAME AS customer_name,
          COUNTRY_NAME AS country
        FROM {tbl('gold_batch_delivery_v')}
        WHERE MATERIAL_ID = :material_id AND BATCH_ID = :batch_id
          AND CUSTOMER_NAME IS NOT NULL
        ORDER BY customer_name, country
    """
    cross_query = f"""
        WITH inputs AS (
          SELECT DISTINCT
            PARENT_MATERIAL_ID AS input_mat,
            PARENT_BATCH_ID AS input_batch
          FROM {tbl('gold_batch_lineage')}
          WHERE CHILD_MATERIAL_ID = :material_id AND CHILD_BATCH_ID = :batch_id
            AND LINK_TYPE = 'PRODUCTION'
            AND PARENT_BATCH_ID IS NOT NULL
        ),
        exposed AS (
          SELECT DISTINCT
            bl.CHILD_BATCH_ID AS other_batch_id,
            i.input_mat AS shared_input_material
          FROM inputs i
          JOIN {tbl('gold_batch_lineage')} bl
            ON bl.PARENT_MATERIAL_ID = i.input_mat
            AND bl.PARENT_BATCH_ID = i.input_batch
            AND bl.LINK_TYPE = 'PRODUCTION'
          WHERE NOT (bl.CHILD_MATERIAL_ID = :material_id AND bl.CHILD_BATCH_ID = :batch_id)
        )
        SELECT
          other_batch_id,
          CONCAT_WS(', ', COLLECT_SET(shared_input_material)) AS shared_material_ids,
          CASE
            WHEN COUNT(DISTINCT shared_input_material) >= 3 THEN 'High'
            WHEN COUNT(DISTINCT shared_input_material) >= 2 THEN 'Medium'
            ELSE 'Low'
          END AS risk_level
        FROM exposed
        GROUP BY other_batch_id
        ORDER BY
          CASE
            WHEN COUNT(DISTINCT shared_input_material) >= 3 THEN 1
            WHEN COUNT(DISTINCT shared_input_material) >= 2 THEN 2
            ELSE 3
          END,
          other_batch_id
    """
    movement_query = f"""
        WITH daily_balance AS (
          SELECT
            POSTING_DATE,
            SUM(
              CASE
                WHEN MOVEMENT_TYPE = '261' THEN -ABS_QUANTITY
                ELSE BALANCE_QTY
              END
            ) AS daily_net
          FROM {tbl('gold_batch_mass_balance_v')}
          WHERE MATERIAL_ID = :material_id AND BATCH_ID = :batch_id
            AND MOVEMENT_CATEGORY NOT LIKE 'STO%'
          GROUP BY POSTING_DATE
        ),
        running_balance AS (
          SELECT
            POSTING_DATE,
            SUM(daily_net) OVER (ORDER BY POSTING_DATE) AS inventory_level
          FROM daily_balance
        )
        SELECT POSTING_DATE, inventory_level
        FROM running_balance
        ORDER BY POSTING_DATE
    """

    try:
        summary_rows, coa_rows, customer_rows, cross_rows, movement_rows = await asyncio.gather(
            run_sql_async(token, summary_query, mat_batch),
            run_sql_async(token, coa_query, mat_batch),
            run_sql_async(token, customer_query, mat_batch),
            run_sql_async(token, cross_query, mat_batch),
            run_sql_async(token, movement_query, mat_batch),
        )

    except Exception as exc:
        error_msg = str(exc).lower()
        if "permission denied" in error_msg or "no access" in error_msg:
            raise HTTPException(status_code=403, detail="Access Denied.") from exc
        raise HTTPException(status_code=500, detail=str(exc)) from exc

    if not summary_rows:
        raise HTTPException(status_code=404, detail=f"No data for Batch '{body.batch_id}'.")

    return _with_freshness({
        "summary": summary_rows[0],
        "coa_results": coa_rows,
        "customers": customer_rows,
        "cross_batch_exposure": cross_rows,
        "movement_history": movement_rows,
    }, token, [
        "gold_batch_stock_v",
        "gold_batch_mass_balance_v",
        "gold_batch_quality_result_v",
        "gold_batch_quality_lot_v",
        "gold_batch_delivery_v",
        "gold_batch_lineage",
    ])


@app.post("/api/impact")
@limiter.limit("60/minute")
async def impact(
    request: Request,
    body: ImpactRequest,
    x_forwarded_access_token: Optional[str] = Header(default=None),
    authorization: Optional[str] = Header(default=None),
):
    """
    Impact analysis: customers + cross-batch exposure.
    Aligned with Dashboard V6 datasets deb1ffdc and d1fc0037.
    """
    token = resolve_token(x_forwarded_access_token, authorization)
    check_warehouse_config()
    batch_param = [sql_param("batch_id", body.batch_id)]

    try:
        customers_rows = run_sql(token, f"""
            SELECT DISTINCT
              CUSTOMER_NAME AS customer_name,
              COUNTRY_NAME AS country
            FROM {tbl('gold_batch_delivery_v')}
            WHERE BATCH_ID = :batch_id
              AND CUSTOMER_NAME IS NOT NULL
            ORDER BY customer_name, country
        """, batch_param)

        cross_rows = run_sql(token, f"""
            WITH inputs AS (
              SELECT DISTINCT
                PARENT_MATERIAL_ID AS input_mat,
                PARENT_BATCH_ID AS input_batch
              FROM {tbl('gold_batch_lineage')}
              WHERE CHILD_BATCH_ID = :batch_id
                AND LINK_TYPE = 'PRODUCTION'
                AND PARENT_BATCH_ID IS NOT NULL
            ),
            exposed AS (
              SELECT DISTINCT
                bl.CHILD_BATCH_ID AS other_batch_id,
                i.input_mat AS shared_input_material
              FROM inputs i
              JOIN {tbl('gold_batch_lineage')} bl
                ON bl.PARENT_MATERIAL_ID = i.input_mat
                AND bl.PARENT_BATCH_ID = i.input_batch
                AND bl.LINK_TYPE = 'PRODUCTION'
              WHERE bl.CHILD_BATCH_ID != :batch_id
            )
            SELECT
              other_batch_id,
              CONCAT_WS(', ', COLLECT_SET(shared_input_material)) AS shared_material_ids,
              CASE
                WHEN COUNT(DISTINCT shared_input_material) >= 3 THEN 'High'
                WHEN COUNT(DISTINCT shared_input_material) >= 2 THEN 'Medium'
                ELSE 'Low'
              END AS risk_level
            FROM exposed
            GROUP BY other_batch_id
            ORDER BY risk_level DESC, other_batch_id
        """, batch_param)

    except Exception as exc:
        error_msg = str(exc).lower()
        if "permission denied" in error_msg or "no access" in error_msg:
            raise HTTPException(status_code=403, detail="Access Denied.") from exc
        raise HTTPException(status_code=500, detail=str(exc)) from exc

    return _with_freshness({
        "customers": customers_rows,
        "cross_batch_exposure": cross_rows,
    }, token, ["gold_batch_delivery_v", "gold_batch_lineage"])


# ---------------------------------------------------------------------------
# Serve the compiled React SPA
# ---------------------------------------------------------------------------
if (STATIC_DIR / "assets").exists():
    app.mount("/assets", StaticFiles(directory=STATIC_DIR / "assets"), name="assets")


_NO_CACHE = {"Cache-Control": "no-store"}


@app.get("/", include_in_schema=False)
async def serve_index():
    if not STATIC_DIR.exists():
        return {"status": "backend running", "frontend": "not built"}
    return FileResponse(STATIC_DIR / "index.html", headers=_NO_CACHE)


@app.get("/{full_path:path}", include_in_schema=False)
async def serve_spa(full_path: str):
    if STATIC_DIR.exists():
        candidate = STATIC_DIR / full_path
        if candidate.is_file():
            return FileResponse(candidate)
        return FileResponse(STATIC_DIR / "index.html", headers=_NO_CACHE)
    raise HTTPException(status_code=404, detail="Frontend not built.")
