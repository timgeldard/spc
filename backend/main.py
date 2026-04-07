import os
import logging
import uuid
from pathlib import Path
from typing import Optional

from fastapi import FastAPI, Header, HTTPException
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from starlette.requests import Request as StarletteRequest

from backend.routers.exclusions import router as exclusions_router
from backend.routers.export import router as export_router
from backend.routers.spc_analysis import router as spc_analysis_router
from backend.routers.spc_charts import router as spc_charts_router
from backend.routers.spc_metadata import router as spc_metadata_router
from backend.routers.trace import router as trace_router
from backend.utils.db import (
    DATABRICKS_HOST,
    TRACE_CATALOG,
    TRACE_SCHEMA,
    WAREHOUSE_HTTP_PATH,
    check_warehouse_config,
    hostname,
    resolve_token,
    run_sql,
    run_sql_async,
)
from backend.utils.rate_limit import (
    RateLimitExceeded,
    SlowAPIMiddleware,
    limiter,
    rate_limit_handler,
)

ENABLE_DEBUG_ENDPOINTS: bool = os.environ.get("APP_ENV", "").strip().lower() == "development"
STATIC_DIR: Path = Path(__file__).parent.parent / "frontend" / "dist"
_NO_CACHE = {"Cache-Control": "no-store"}

app = FastAPI(title="TraceApp API", docs_url="/api/docs", redoc_url=None)
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, rate_limit_handler)
app.add_middleware(SlowAPIMiddleware)

app.include_router(trace_router, prefix="/api", tags=["Traceability"])
app.include_router(spc_metadata_router, prefix="/api/spc", tags=["SPC"])
app.include_router(spc_charts_router, prefix="/api/spc", tags=["SPC"])
app.include_router(spc_analysis_router, prefix="/api/spc", tags=["SPC"])
app.include_router(export_router, prefix="/api/spc", tags=["SPC Export"])
app.include_router(exclusions_router, prefix="/api/spc", tags=["SPC Exclusions"])


@app.exception_handler(Exception)
async def global_exception_handler(request: StarletteRequest, exc: Exception):
    if isinstance(exc, HTTPException):
        return JSONResponse(status_code=exc.status_code, content={"detail": exc.detail})
    error_id = str(uuid.uuid4())
    logging.getLogger(__name__).exception(
        "Unhandled exception error_id=%s method=%s path=%s",
        error_id,
        request.method,
        request.url.path,
    )
    return JSONResponse(
        status_code=500,
        content={"detail": "Internal server error", "error_id": error_id},
    )


@app.get("/api/health")
async def health():
    return {"status": "ok"}


@app.get("/api/ready")
async def ready():
    try:
        check_warehouse_config()
    except HTTPException as exc:
        raise HTTPException(
            status_code=503,
            detail={
                "status": "not_ready",
                "reason": "warehouse_config_missing",
                "message": exc.detail,
            },
        ) from exc

    readiness_token = os.environ.get("DATABRICKS_READINESS_TOKEN", "").strip()
    if not readiness_token:
        raise HTTPException(
            status_code=503,
            detail={
                "status": "not_ready",
                "reason": "readiness_token_missing",
                "message": (
                    "DATABRICKS_READINESS_TOKEN is not configured. "
                    "A dedicated workspace token is required for SQL warehouse readiness checks."
                ),
            },
        )

    try:
        rows = await run_sql_async(readiness_token, "SELECT 1 AS ok")
    except Exception as exc:
        raise HTTPException(
            status_code=503,
            detail={
                "status": "not_ready",
                "reason": "sql_warehouse_unreachable",
                "message": str(exc)[:500],
            },
        ) from exc

    return {
        "status": "ready",
        "checks": {
            "config": "ok",
            "sql_warehouse": "ok",
        },
        "sample_result": rows[0] if rows else None,
    }


@app.get("/api/health/debug")
async def health_debug(
    x_forwarded_access_token: Optional[str] = Header(default=None),
    authorization: Optional[str] = Header(default=None),
):
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
        "python_version": __import__("sys").version,
    }


@app.get("/api/test-query")
async def test_query(
    x_forwarded_access_token: Optional[str] = Header(default=None),
    authorization: Optional[str] = Header(default=None),
):
    if not ENABLE_DEBUG_ENDPOINTS:
        raise HTTPException(status_code=404, detail="Not found")
    token = resolve_token(x_forwarded_access_token, authorization)
    info: dict = {"token_present": True, "token_length": len(token)}
    try:
        info["result"] = run_sql(token, "SELECT 1 AS ok")
        info["status"] = "ok"
    except Exception as exc:
        info["status"] = "error"
        info["error"] = str(exc)[:500]
    return info


if (STATIC_DIR / "assets").exists():
    app.mount("/assets", StaticFiles(directory=STATIC_DIR / "assets"), name="assets")


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
