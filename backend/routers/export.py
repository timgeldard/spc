"""
SPC Export router.

Endpoints:
  POST /api/spc/export  — generate Excel or CSV download for scorecard / chart data / signals

Returns StreamingResponse with appropriate Content-Type and Content-Disposition.
PDF export is handled client-side via window.print().
"""

import io
import json
from typing import Optional

from fastapi import APIRouter, Header, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, field_validator
import openpyxl
from openpyxl.styles import Font, PatternFill, Alignment
from openpyxl.utils import get_column_letter

from backend.utils.db import (
    check_warehouse_config,
    resolve_token,
    run_sql,
    sql_param,
    tbl,
)
from backend.utils.rate_limit import limiter
from backend.routers.spc import (
    _handle_sql_error,
    _scorecard_rows,
)
import re

router = APIRouter()

_DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")
_MATERIAL_ID_MAX_LEN = 40
_FORMULA_PREFIXES = ("=", "+", "-", "@")


def sanitize_spreadsheet_value(value):
    if isinstance(value, str) and value and value[0] in _FORMULA_PREFIXES:
        return "'" + value
    return value


def _sanitize_row(row):
    return [sanitize_spreadsheet_value(cell) for cell in row]


class ExportRequest(BaseModel):
    export_type: str          # 'excel' | 'csv'
    export_scope: str         # 'scorecard' | 'chart_data' | 'signals'
    material_id: str
    mic_id: Optional[str] = None
    mic_name: Optional[str] = None
    plant_id: Optional[str] = None
    date_from: Optional[str] = None
    date_to: Optional[str] = None
    signals_json: Optional[str] = None   # JSON-encoded signals list from frontend

    @field_validator("material_id")
    @classmethod
    def check_material_id(cls, v: str) -> str:
        if len(v) > _MATERIAL_ID_MAX_LEN:
            raise ValueError(f"material_id must be at most {_MATERIAL_ID_MAX_LEN} characters")
        return v

    @field_validator("date_from", "date_to")
    @classmethod
    def check_date(cls, v: Optional[str]) -> Optional[str]:
        if v is not None and not _DATE_RE.match(v):
            raise ValueError("Date must be in YYYY-MM-DD format")
        return v

    @field_validator("export_type")
    @classmethod
    def check_export_type(cls, v: str) -> str:
        if v not in ("excel", "csv"):
            raise ValueError("export_type must be 'excel' or 'csv'")
        return v

    @field_validator("export_scope")
    @classmethod
    def check_export_scope(cls, v: str) -> str:
        if v not in ("scorecard", "chart_data", "signals"):
            raise ValueError("export_scope must be 'scorecard', 'chart_data', or 'signals'")
        return v


# ---------------------------------------------------------------------------
# Excel styling helpers
# ---------------------------------------------------------------------------

HEADER_FONT  = Font(bold=True, color="FFFFFF")
HEADER_FILL  = PatternFill("solid", fgColor="1B3A4B")
CENTER_ALIGN = Alignment(horizontal="center")

STATUS_FILLS = {
    "excellent": PatternFill("solid", fgColor="D1FAE5"),
    "good":      PatternFill("solid", fgColor="ECFDF5"),
    "marginal":  PatternFill("solid", fgColor="FFFBEB"),
    "poor":      PatternFill("solid", fgColor="FEF2F2"),
    "grey":      PatternFill("solid", fgColor="F9FAFB"),
}


def _style_header_row(ws, row_num: int, n_cols: int):
    for col in range(1, n_cols + 1):
        cell = ws.cell(row=row_num, column=col)
        cell.font  = HEADER_FONT
        cell.fill  = HEADER_FILL
        cell.alignment = CENTER_ALIGN


def _auto_width(ws):
    for col in ws.columns:
        max_len = max((len(str(c.value or "")) for c in col), default=8)
        ws.column_dimensions[get_column_letter(col[0].column)].width = min(max_len + 4, 40)


# ---------------------------------------------------------------------------
# Data fetchers (reuse SQL logic from spc.py without coupling directly)
# ---------------------------------------------------------------------------

async def _fetch_scorecard(token: str, body: ExportRequest) -> list[dict]:
    """Delegate to the shared _scorecard_rows helper so export and API are always in sync."""
    return await _scorecard_rows(token, body.material_id, body.plant_id, body.date_from, body.date_to)


def _fetch_chart_data(token: str, body: ExportRequest) -> list[dict]:
    if not body.mic_id:
        return []
    params = [sql_param("material_id", body.material_id), sql_param("mic_id", body.mic_id)]
    if body.mic_name:
        params.append(sql_param("mic_name", body.mic_name))
    mb_clauses = []
    if body.date_from:
        mb_clauses.append("POSTING_DATE >= :date_from")
        params.append(sql_param("date_from", body.date_from))
    if body.date_to:
        mb_clauses.append("POSTING_DATE <= :date_to")
        params.append(sql_param("date_to", body.date_to))
    if body.plant_id:
        mb_clauses.append("PLANT_ID = :plant_id")
        params.append(sql_param("plant_id", body.plant_id))
    date_filter     = ("AND " + " AND ".join(mb_clauses)) if mb_clauses else ""
    mic_name_filter = "AND r.MIC_NAME = :mic_name" if body.mic_name else ""

    query = f"""
        WITH batch_dates AS (
            SELECT MATERIAL_ID, BATCH_ID, MIN(POSTING_DATE) AS batch_date
            FROM {tbl('gold_batch_mass_balance_v')}
            WHERE MATERIAL_ID = :material_id
              AND MOVEMENT_CATEGORY = 'Production'
              {date_filter}
            GROUP BY MATERIAL_ID, BATCH_ID
        ),
        quality_data AS (
            SELECT
                r.BATCH_ID,
                CAST(r.QUANTITATIVE_RESULT AS DOUBLE) AS value,
                TRY_CAST(r.TARGET_VALUE AS DOUBLE)    AS nominal,
                TRY_CAST(r.TOLERANCE AS DOUBLE)       AS tolerance,
                r.INSPECTION_RESULT_VALUATION         AS valuation,
                bd.batch_date,
                ROW_NUMBER() OVER (
                    PARTITION BY r.BATCH_ID ORDER BY r.SAMPLE_ID, r.INSPECTION_LOT_ID
                ) AS sample_seq
            FROM {tbl('gold_batch_quality_result_v')} r
            INNER JOIN batch_dates bd ON bd.MATERIAL_ID = r.MATERIAL_ID AND bd.BATCH_ID = r.BATCH_ID
            WHERE r.MATERIAL_ID = :material_id
              AND r.MIC_ID       = :mic_id
              {mic_name_filter}
              AND r.QUANTITATIVE_RESULT IS NOT NULL
        )
        SELECT
            BATCH_ID AS batch_id,
            CAST(batch_date AS STRING) AS batch_date,
            DENSE_RANK() OVER (ORDER BY COALESCE(batch_date, '9999-12-31'), BATCH_ID) AS batch_seq,
            sample_seq,
            value,
            nominal,
            tolerance,
            valuation
        FROM quality_data
        ORDER BY batch_seq, sample_seq
    """
    rows = run_sql(token, query, params)
    for row in rows:
        for f in ["value", "nominal", "tolerance"]:
            v = row.get(f)
            row[f] = float(v) if v is not None else None
        for f in ["batch_seq", "sample_seq"]:
            v = row.get(f)
            row[f] = int(float(v)) if v is not None else None
    return rows


# ---------------------------------------------------------------------------
# Excel builders
# ---------------------------------------------------------------------------

def _build_scorecard_excel(rows: list[dict], material_id: str) -> io.BytesIO:
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "Capability Scorecard"

    headers = [
        "MIC ID", "Characteristic", "Batches", "Samples", "Mean", "Std Dev",
        "Min", "Max", "Target", "Pp", "Ppk", "Z Score", "DPMO", "OOC Rate", "Status",
    ]
    ws.append(_sanitize_row(headers))
    _style_header_row(ws, 1, len(headers))

    for row in rows:
        ooc_pct = f"{row.get('ooc_rate', 0) * 100:.1f}%" if row.get("ooc_rate") is not None else "—"
        ws.append(_sanitize_row([
            row.get("mic_id"),
            row.get("mic_name"),
            row.get("batch_count"),
            row.get("sample_count"),
            row.get("mean_value"),
            row.get("stddev_overall"),
            row.get("min_value"),
            row.get("max_value"),
            row.get("nominal_target"),
            row.get("pp"),
            row.get("ppk"),
            row.get("z_score"),
            row.get("dpmo"),
            ooc_pct,
            row.get("capability_status", "").capitalize(),
        ]))
        # Colour status cell (column 15 = "Status")
        status = row.get("capability_status", "grey")
        fill   = STATUS_FILLS.get(status)
        if fill:
            ws.cell(row=ws.max_row, column=15).fill = fill

    _auto_width(ws)
    buf = io.BytesIO()
    wb.save(buf)
    buf.seek(0)
    return buf


def _build_chart_data_excel(rows: list[dict], material_id: str, mic_name: Optional[str]) -> io.BytesIO:
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "Measurement Data"

    headers = ["Batch ID", "Batch Date", "Batch Seq", "Sample Seq", "Value", "Nominal", "Tolerance", "Valuation"]
    ws.append(_sanitize_row(headers))
    _style_header_row(ws, 1, len(headers))

    for row in rows:
        ws.append(_sanitize_row([
            row.get("batch_id"),
            row.get("batch_date"),
            row.get("batch_seq"),
            row.get("sample_seq"),
            row.get("value"),
            row.get("nominal"),
            row.get("tolerance"),
            row.get("valuation"),
        ]))

    _auto_width(ws)
    buf = io.BytesIO()
    wb.save(buf)
    buf.seek(0)
    return buf


def _build_signals_excel(signals: list[dict]) -> io.BytesIO:
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "Signals Log"

    headers = ["Rule", "Chart", "Point Indices", "Description"]
    ws.append(_sanitize_row(headers))
    _style_header_row(ws, 1, len(headers))

    for sig in signals:
        ws.append(_sanitize_row([
            sig.get("rule"),
            sig.get("chart", "X"),
            ", ".join(str(i) for i in sig.get("indices", [])),
            sig.get("description"),
        ]))

    _auto_width(ws)
    buf = io.BytesIO()
    wb.save(buf)
    buf.seek(0)
    return buf


# ---------------------------------------------------------------------------
# CSV helpers
# ---------------------------------------------------------------------------

def _rows_to_csv(headers: list[str], rows: list[list]) -> str:
    import csv, io as _io
    buf = _io.StringIO()
    w   = csv.writer(buf)
    w.writerow(_sanitize_row(headers))
    for row in rows:
        w.writerow(_sanitize_row(row))
    return buf.getvalue()


# ---------------------------------------------------------------------------
# Endpoint
# ---------------------------------------------------------------------------

@router.post("/export")
@limiter.limit("20/minute")
async def spc_export(
    request: Request,
    body: ExportRequest,
    x_forwarded_access_token: Optional[str] = Header(default=None),
    authorization: Optional[str] = Header(default=None),
):
    """Generate an Excel or CSV download for SPC data."""
    token = resolve_token(x_forwarded_access_token, authorization)
    check_warehouse_config()

    scope = body.export_scope
    fmt   = body.export_type

    # --- Signals (no DB call needed — passed from frontend) ---
    if scope == "signals":
        signals: list[dict] = []
        if body.signals_json:
            try:
                signals = json.loads(body.signals_json)
            except (json.JSONDecodeError, TypeError):
                signals = []

        if fmt == "excel":
            buf  = _build_signals_excel(signals)
            return StreamingResponse(
                buf,
                media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                headers={"Content-Disposition": "attachment; filename=spc_signals.xlsx"},
            )
        else:
            headers_csv = ["Rule", "Chart", "Point Indices", "Description"]
            rows_csv    = [
                [s.get("rule"), s.get("chart", "X"),
                 ", ".join(str(i) for i in s.get("indices", [])), s.get("description")]
                for s in signals
            ]
            csv_text = _rows_to_csv(headers_csv, rows_csv)
            return StreamingResponse(
                iter([csv_text]),
                media_type="text/csv",
                headers={"Content-Disposition": "attachment; filename=spc_signals.csv"},
            )

    # --- Scorecard ---
    if scope == "scorecard":
        try:
            rows = await _fetch_scorecard(token, body)
        except Exception as exc:
            _handle_sql_error(exc)

        if fmt == "excel":
            buf = _build_scorecard_excel(rows, body.material_id)
            return StreamingResponse(
                buf,
                media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                headers={"Content-Disposition": "attachment; filename=spc_scorecard.xlsx"},
            )
        else:
            headers_csv = ["MIC ID", "Characteristic", "Batches", "Mean", "Std Dev",
                           "Pp", "Ppk", "Z Score", "DPMO", "OOC Rate %", "Status"]
            rows_csv = [
                [r.get("mic_id"), r.get("mic_name"), r.get("batch_count"),
                 r.get("mean_value"), r.get("stddev_overall"),
                 r.get("pp"), r.get("ppk"), r.get("z_score"), r.get("dpmo"),
                 f"{(r.get('ooc_rate') or 0)*100:.1f}", r.get("capability_status")]
                for r in rows
            ]
            csv_text = _rows_to_csv(headers_csv, rows_csv)
            return StreamingResponse(
                iter([csv_text]),
                media_type="text/csv",
                headers={"Content-Disposition": "attachment; filename=spc_scorecard.csv"},
            )

    # --- Chart data ---
    if scope == "chart_data":
        try:
            rows = _fetch_chart_data(token, body)
        except Exception as exc:
            _handle_sql_error(exc)

        if fmt == "excel":
            buf = _build_chart_data_excel(rows, body.material_id, body.mic_name)
            return StreamingResponse(
                buf,
                media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                headers={"Content-Disposition": "attachment; filename=spc_chart_data.xlsx"},
            )
        else:
            headers_csv = ["Batch ID", "Batch Date", "Batch Seq", "Sample Seq",
                           "Value", "Nominal", "Tolerance", "Valuation"]
            rows_csv = [
                [r.get("batch_id"), r.get("batch_date"), r.get("batch_seq"),
                 r.get("sample_seq"), r.get("value"), r.get("nominal"),
                 r.get("tolerance"), r.get("valuation")]
                for r in rows
            ]
            csv_text = _rows_to_csv(headers_csv, rows_csv)
            return StreamingResponse(
                iter([csv_text]),
                media_type="text/csv",
                headers={"Content-Disposition": "attachment; filename=spc_chart_data.csv"},
            )
