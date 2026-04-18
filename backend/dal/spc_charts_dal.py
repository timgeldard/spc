import math
from dataclasses import dataclass, field
from typing import Optional
from urllib.parse import quote, unquote

from pypika import Database, Schema, Table, functions as fn
from pypika.dialects import MySQLQuery
from pypika.terms import Criterion, LiteralValue

from backend.dal.spc_shared import infer_spec_type
from backend.utils.db import TRACE_CATALOG, TRACE_SCHEMA, run_sql_async, sql_param, tbl

_NORMALITY_MAX_POINTS = 5000
_FULL_CHART_MAX_ROWS = 10000
_ATTRIBUTE_CHART_MAX_ROWS = 10000
_ALLOWED_STRATIFY_COLUMNS = {
    "plant_id": "bd.plant_id",
    "inspection_lot_id": "CAST(r.INSPECTION_LOT_ID AS STRING)",
    "operation_id": "CAST(r.OPERATION_ID AS STRING)",
}


def _format_chart_row_error(field: str, raw_value: object, row: dict) -> str:
    batch_id = row.get("batch_id")
    sample_id = (
        row.get("SAMPLE_ID")
        if row.get("SAMPLE_ID") is not None
        else (
            row.get("cursor_sample_id")
            if row.get("cursor_sample_id") is not None
            else row.get("sample_seq")
        )
    )
    return (
        f"Invalid chart row value for field '{field}' in batch_id={batch_id!r}, "
        f"sample_id={sample_id!r}: {raw_value!r}; row={row!r}"
    )


def _coerce_chart_float(row: dict, field: str) -> None:
    value = row.get(field)
    if value is None:
        return
    try:
        f = float(value)
        if math.isnan(f) or math.isinf(f):
            row[field] = None
            return
        row[field] = f
    except (ValueError, TypeError) as exc:
        raise ValueError(_format_chart_row_error(field, value, row)) from exc


def _coerce_chart_int(row: dict, field: str) -> None:
    value = row.get(field)
    if value is None:
        return
    try:
        row[field] = int(float(value))
    except (ValueError, TypeError) as exc:
        raise ValueError(_format_chart_row_error(field, value, row)) from exc


def _apply_chart_row_formatting(rows: list[dict]) -> list[dict]:
    for row in rows:
        for field in ["value", "nominal", "tolerance", "lsl", "usl"]:
            _coerce_chart_float(row, field)
        _coerce_chart_int(row, "sample_seq")
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
        row["spec_type"] = infer_spec_type(row["usl"], row["lsl"], row.get("nominal"))
        if "plant_id" not in row:
            row["plant_id"] = None
        row.pop("cursor_batch_date_epoch", None)
        row.pop("cursor_sample_id", None)
        row.pop("cursor_inspection_lot_id", None)
        row.pop("cursor_operation_id", None)
    return rows


def encode_chart_cursor(
    batch_date_epoch: int,
    batch_id: str,
    sample_id: str,
    inspection_lot_id: str,
    operation_id: str,
) -> str:
    return ":".join(
        [
            str(batch_date_epoch),
            quote(batch_id, safe=""),
            quote(sample_id, safe=""),
            quote(inspection_lot_id, safe=""),
            quote(operation_id, safe=""),
        ]
    )


def decode_chart_cursor(cursor: str) -> tuple[int, str, str, str, str]:
    try:
        (
            batch_date_epoch_str,
            batch_id_raw,
            sample_id_raw,
            inspection_lot_id_raw,
            operation_id_raw,
        ) = cursor.split(":", 4)
        batch_date_epoch = int(batch_date_epoch_str)
    except (AttributeError, TypeError, ValueError) as exc:
        raise ValueError(
            "cursor must be formatted as "
            "'batch_date(epoch):batch_id:sample_id:inspection_lot_id:operation_id'"
        ) from exc

    batch_id = unquote(batch_id_raw)
    sample_id = unquote(sample_id_raw)
    if not batch_id:
        raise ValueError("cursor batch_id must not be empty")
    return (
        batch_date_epoch,
        batch_id,
        sample_id,
        unquote(inspection_lot_id_raw),
        unquote(operation_id_raw),
    )


def _assign_batch_sequence(rows: list[dict]) -> list[dict]:
    batch_seq = 0
    last_batch_key: Optional[tuple[Optional[str], Optional[str]]] = None
    for row in rows:
        batch_key = (row.get("batch_date"), row.get("batch_id"))
        if batch_key != last_batch_key:
            batch_seq += 1
            last_batch_key = batch_key
        row["batch_seq"] = batch_seq
    return rows


@dataclass
class ChartFilterSpec:
    params: list[dict]
    batch_date_conditions: list[str] = field(default_factory=list)
    quality_conditions: list[str] = field(default_factory=list)
    final_where_conditions: list[str] = field(default_factory=list)
    select_extra_columns: list[str] = field(default_factory=list)
    stratify_by: Optional[str] = None
    stratify_select_sql: Optional[str] = None


class _RawCriterion(Criterion):
    def __init__(self, sql: str):
        super().__init__()
        self.sql = sql

    def get_sql(self, **kwargs) -> str:  # pragma: no cover - exercised indirectly via Query.get_sql()
        return self.sql


def _sql_expr(sql: str) -> LiteralValue:
    return LiteralValue(sql)


def _source_table(name: str, alias: Optional[str] = None) -> Table:
    table = Table(
        name,
        schema=Schema(TRACE_SCHEMA, parent=Database(TRACE_CATALOG)),
    )
    if alias:
        return table.as_(alias)
    return table


def _apply_conditions(query, conditions: list[str]):
    for condition in conditions:
        query = query.where(_RawCriterion(condition))
    return query


def _build_chart_filters(
    material_id: str,
    mic_id: str,
    mic_name: Optional[str],
    plant_id: Optional[str],
    date_from: Optional[str],
    date_to: Optional[str],
    stratify_by: Optional[str] = None,
    operation_id: Optional[str] = None,
) -> ChartFilterSpec:
    params = [
        sql_param("material_id", material_id),
        sql_param("mic_id", mic_id),
    ]
    batch_date_conditions = [
        "MATERIAL_ID = :material_id",
        "MOVEMENT_CATEGORY = 'Production'",
    ]
    quality_conditions = [
        "r.MATERIAL_ID = :material_id",
        "r.MIC_ID = :mic_id",
        "r.QUANTITATIVE_RESULT IS NOT NULL",
        "(r.QUALITATIVE_RESULT IS NULL OR r.QUALITATIVE_RESULT = '')",
    ]
    final_where_conditions: list[str] = []
    select_extra_columns: list[str] = []

    if operation_id:
        params.append(sql_param("operation_id", operation_id))
        quality_conditions.append("r.OPERATION_ID = :operation_id")
    if date_from:
        batch_date_conditions.append("POSTING_DATE >= :date_from")
        params.append(sql_param("date_from", date_from))
    if date_to:
        batch_date_conditions.append("POSTING_DATE <= :date_to")
        params.append(sql_param("date_to", date_to))
    if plant_id:
        params.append(sql_param("plant_id", plant_id))
        quality_conditions.append("(bd.plant_id = :plant_id OR bd.plant_id IS NULL)")
    stratify_select_sql = None
    if stratify_by:
        stratify_select_sql = _ALLOWED_STRATIFY_COLUMNS.get(stratify_by)
        if stratify_select_sql is None:
            raise ValueError(
                f"stratify_by must be one of {sorted(_ALLOWED_STRATIFY_COLUMNS)}"
            )
        select_extra_columns.append("stratify_value")
    return ChartFilterSpec(
        params=params,
        batch_date_conditions=batch_date_conditions,
        quality_conditions=quality_conditions,
        final_where_conditions=final_where_conditions,
        select_extra_columns=select_extra_columns,
        stratify_by=stratify_by,
        stratify_select_sql=stratify_select_sql,
    )


def _build_batch_dates_cte(filters: ChartFilterSpec):
    mb = _source_table("gold_batch_mass_balance_v", "mb")
    query = (
        MySQLQuery.from_(mb)
        .select(
            mb.MATERIAL_ID,
            mb.BATCH_ID,
            fn.Min(mb.POSTING_DATE).as_("batch_date"),
            fn.Max(mb.PLANT_ID).as_("plant_id"),
        )
        .groupby(mb.MATERIAL_ID, mb.BATCH_ID)
    )
    return _apply_conditions(query, filters.batch_date_conditions)


def _build_quality_data_cte(filters: ChartFilterSpec):
    r = _source_table("gold_batch_quality_result_v", "r")
    bd = Table("batch_dates").as_("bd")
    select_terms = [
        r.BATCH_ID.as_("batch_id"),
        r.INSPECTION_LOT_ID,
        r.OPERATION_ID,
        r.SAMPLE_ID,
        r.attribute.as_("attribut"),
        _sql_expr("CAST(r.QUANTITATIVE_RESULT AS DOUBLE)").as_("value"),
        _sql_expr("TRY_CAST(r.TARGET_VALUE AS DOUBLE)").as_("nominal"),
        _sql_expr(
            "TRY_CAST(CASE WHEN LOCATE('...', r.TOLERANCE) > 0 "
            "THEN SUBSTRING(r.TOLERANCE, 1, LOCATE('...', r.TOLERANCE) - 1) END AS DOUBLE)"
        ).as_("lsl"),
        _sql_expr(
            "TRY_CAST(CASE WHEN LOCATE('...', r.TOLERANCE) > 0 "
            "THEN SUBSTRING(r.TOLERANCE, LOCATE('...', r.TOLERANCE) + 3) END AS DOUBLE)"
        ).as_("usl"),
        _sql_expr(
            "CASE WHEN LOCATE('...', r.TOLERANCE) = 0 THEN TRY_CAST(r.TOLERANCE AS DOUBLE) END"
        ).as_("tolerance"),
        r.INSPECTION_RESULT_VALUATION.as_("valuation"),
        bd.batch_date,
        bd.plant_id,
        _sql_expr(
            "COALESCE(UNIX_TIMESTAMP(CAST(bd.batch_date AS TIMESTAMP)), 253402214400)"
        ).as_("cursor_batch_date_epoch"),
        _sql_expr("COALESCE(CAST(r.SAMPLE_ID AS STRING), '')").as_("cursor_sample_id"),
        _sql_expr("COALESCE(CAST(r.INSPECTION_LOT_ID AS STRING), '')").as_("cursor_inspection_lot_id"),
        _sql_expr("COALESCE(CAST(r.OPERATION_ID AS STRING), '')").as_("cursor_operation_id"),
        _sql_expr(
            "ROW_NUMBER() OVER (PARTITION BY r.BATCH_ID "
            "ORDER BY COALESCE(CAST(r.SAMPLE_ID AS STRING), ''), r.INSPECTION_LOT_ID, r.OPERATION_ID)"
        ).as_("sample_seq"),
    ]
    if filters.stratify_select_sql:
        select_terms.append(_sql_expr(filters.stratify_select_sql).as_("stratify_value"))

    query = (
        MySQLQuery.from_(r)
        .join(bd)
        .on((bd.MATERIAL_ID == r.MATERIAL_ID) & (bd.BATCH_ID == r.BATCH_ID))
        .select(*select_terms)
    )
    return _apply_conditions(query, filters.quality_conditions)


def _build_chart_page_query(filters: ChartFilterSpec, cursor: Optional[str], limit: int) -> tuple[str, list[dict]]:
    params = list(filters.params)
    if cursor:
        (
            cursor_batch_date_epoch,
            cursor_batch_id,
            cursor_sample_id,
            cursor_inspection_lot_id,
            cursor_operation_id,
        ) = decode_chart_cursor(cursor)
        params.extend(
            [
                sql_param("cursor_batch_date_epoch", cursor_batch_date_epoch),
                sql_param("cursor_batch_id", cursor_batch_id),
                sql_param("cursor_sample_id", cursor_sample_id),
                sql_param("cursor_inspection_lot_id", cursor_inspection_lot_id),
                sql_param("cursor_operation_id", cursor_operation_id),
            ]
        )
        filters.final_where_conditions.extend(
            [
                "("
                "cursor_batch_date_epoch > :cursor_batch_date_epoch "
                "OR (cursor_batch_date_epoch = :cursor_batch_date_epoch AND batch_id > :cursor_batch_id) "
                "OR (cursor_batch_date_epoch = :cursor_batch_date_epoch AND batch_id = :cursor_batch_id "
                "AND cursor_sample_id > :cursor_sample_id) "
                "OR (cursor_batch_date_epoch = :cursor_batch_date_epoch AND batch_id = :cursor_batch_id "
                "AND cursor_sample_id = :cursor_sample_id "
                "AND cursor_inspection_lot_id > :cursor_inspection_lot_id) "
                "OR (cursor_batch_date_epoch = :cursor_batch_date_epoch AND batch_id = :cursor_batch_id "
                "AND cursor_sample_id = :cursor_sample_id "
                "AND cursor_inspection_lot_id = :cursor_inspection_lot_id "
                "AND cursor_operation_id > :cursor_operation_id)"
                ")"
            ]
        )

    qd = Table("quality_data")
    select_columns = [
        qd.batch_id,
        _sql_expr("CAST(batch_date AS STRING)").as_("batch_date"),
        qd.sample_seq,
        qd.attribut,
        qd.value,
        qd.nominal,
        qd.tolerance,
        qd.lsl,
        qd.usl,
        qd.valuation,
        qd.plant_id,
        qd.cursor_batch_date_epoch,
        qd.cursor_sample_id,
        qd.cursor_inspection_lot_id,
        qd.cursor_operation_id,
    ]
    if "stratify_value" in filters.select_extra_columns:
        select_columns.append(qd.stratify_value)

    final_query = (
        MySQLQuery.with_(_build_batch_dates_cte(filters), "batch_dates")
        .with_(_build_quality_data_cte(filters), "quality_data")
        .from_(qd)
        .select(*select_columns)
        .orderby(qd.cursor_batch_date_epoch)
        .orderby(qd.batch_id)
        .orderby(qd.cursor_sample_id)
        .orderby(qd.INSPECTION_LOT_ID)
        .orderby(qd.OPERATION_ID)
        .limit(limit + 1)
    )
    final_query = _apply_conditions(final_query, filters.final_where_conditions)
    return final_query.get_sql(), params


def _build_chart_values_query(filters: ChartFilterSpec, max_points: int) -> tuple[str, list[dict]]:
    r = _source_table("gold_batch_quality_result_v", "r")
    bd = Table("batch_dates").as_("bd")
    final_query = (
        MySQLQuery.with_(_build_batch_dates_cte(filters), "batch_dates")
        .from_(r)
        .join(bd)
        .on((bd.MATERIAL_ID == r.MATERIAL_ID) & (bd.BATCH_ID == r.BATCH_ID))
        .select(_sql_expr("CAST(r.QUANTITATIVE_RESULT AS DOUBLE)").as_("value"))
        .orderby(bd.batch_date)
        .orderby(r.BATCH_ID)
        .orderby(r.SAMPLE_ID)
        .orderby(r.INSPECTION_LOT_ID)
        .limit(max_points)
    )
    final_query = _apply_conditions(final_query, filters.quality_conditions)
    return final_query.get_sql(), list(filters.params)


async def fetch_chart_data_page(
    token: str,
    material_id: str,
    mic_id: str,
    mic_name: Optional[str],
    plant_id: Optional[str],
    date_from: Optional[str],
    date_to: Optional[str],
    stratify_by: Optional[str] = None,
    cursor: Optional[str] = None,
    limit: int = 1000,
    operation_id: Optional[str] = None,
) -> dict:
    filters = _build_chart_filters(
        material_id,
        mic_id,
        mic_name,
        plant_id,
        date_from,
        date_to,
        stratify_by,
        operation_id,
    )
    query, params = _build_chart_page_query(filters, cursor, limit)
    rows = await run_sql_async(token, query, params)
    has_more = len(rows) > limit
    raw_page_rows = rows[:limit]
    next_cursor = None
    if has_more and raw_page_rows:
        last_row = raw_page_rows[-1]
        next_cursor = encode_chart_cursor(
            int(last_row["cursor_batch_date_epoch"]),
            str(last_row["batch_id"]),
            str(last_row.get("cursor_sample_id") or ""),
            str(last_row.get("cursor_inspection_lot_id") or ""),
            str(last_row.get("cursor_operation_id") or ""),
        )
    page_rows = _apply_chart_row_formatting(raw_page_rows)
    return {
        "data": page_rows,
        "next_cursor": next_cursor,
        "has_more": has_more,
    }


async def fetch_chart_data_values(
    token: str,
    material_id: str,
    mic_id: str,
    mic_name: Optional[str],
    plant_id: Optional[str],
    date_from: Optional[str],
    date_to: Optional[str],
    stratify_by: Optional[str] = None,
    max_points: int = _NORMALITY_MAX_POINTS,
    operation_id: Optional[str] = None,
) -> list[Optional[float]]:
    filters = _build_chart_filters(
        material_id,
        mic_id,
        mic_name,
        plant_id,
        date_from,
        date_to,
        stratify_by,
        operation_id,
    )
    query, params = _build_chart_values_query(filters, max_points)
    rows = await run_sql_async(token, query, params)
    values = []
    for row in rows:
        value = row.get("value")
        try:
            values.append(float(value) if value is not None else None)
        except (ValueError, TypeError):
            values.append(None)
    return values


async def fetch_chart_data(
    token: str,
    material_id: str,
    mic_id: str,
    mic_name: Optional[str],
    plant_id: Optional[str],
    date_from: Optional[str],
    date_to: Optional[str],
    stratify_by: Optional[str] = None,
    max_rows: int = _FULL_CHART_MAX_ROWS,
    operation_id: Optional[str] = None,
) -> list[dict]:
    all_rows: list[dict] = []
    cursor = None
    while len(all_rows) < max_rows:
        remaining = max_rows - len(all_rows)
        page = await fetch_chart_data_page(
            token,
            material_id,
            mic_id,
            mic_name,
            plant_id,
            date_from,
            date_to,
            stratify_by,
            cursor=cursor,
            limit=min(1000, remaining),
            operation_id=operation_id,
        )
        all_rows.extend(page["data"])
        if not page["has_more"]:
            break
        cursor = page["next_cursor"]
    return _assign_batch_sequence(all_rows[:max_rows])


async def fetch_p_chart_data(
    token: str,
    material_id: str,
    mic_id: str,
    mic_name: Optional[str],
    plant_id: Optional[str],
    date_from: Optional[str],
    date_to: Optional[str],
    operation_id: Optional[str] = None,
) -> list[dict]:
    params = [sql_param("material_id", material_id), sql_param("mic_id", mic_id)]
    clauses = ["material_id = :material_id", "mic_id = :mic_id"]
    if date_from:
        clauses.append("batch_date >= :date_from")
        params.append(sql_param("date_from", date_from))
    if date_to:
        clauses.append("batch_date <= :date_to")
        params.append(sql_param("date_to", date_to))
    if plant_id:
        clauses.append("plant_id = :plant_id")
        params.append(sql_param("plant_id", plant_id))
    if operation_id:
        clauses.append("operation_id = :operation_id")
        params.append(sql_param("operation_id", operation_id))
    where_sql = "WHERE " + " AND ".join(clauses)

    query = f"""
        SELECT
            batch_id,
            CAST(batch_date AS STRING)                              AS batch_date,
            n_inspected,
            n_nonconforming,
            ROUND(n_nonconforming / GREATEST(n_inspected, 1), 4)   AS p_value
        FROM {tbl('spc_attribute_metric_source_v')}
        {where_sql}
        ORDER BY COALESCE(batch_date, '9999-12-31'), batch_id
        LIMIT {_ATTRIBUTE_CHART_MAX_ROWS}
    """
    rows = await run_sql_async(token, query, params)
    rows = _assign_batch_sequence(rows)
    for row in rows:
        row["batch_seq"] = int(float(row.get("batch_seq", 0) or 0))
        row["n_inspected"] = int(float(row.get("n_inspected", 0) or 0))
        row["n_nonconforming"] = int(float(row.get("n_nonconforming", 0) or 0))
        row["p_value"] = float(row.get("p_value", 0) or 0)
    return rows


async def fetch_count_chart_data(
    token: str,
    material_id: str,
    mic_id: str,
    mic_name: Optional[str],
    plant_id: Optional[str],
    date_from: Optional[str],
    date_to: Optional[str],
    chart_subtype: str,
    operation_id: Optional[str] = None,
) -> list[dict]:
    params = [sql_param("material_id", material_id), sql_param("mic_id", mic_id)]
    clauses = ["material_id = :material_id", "mic_id = :mic_id"]
    if date_from:
        clauses.append("batch_date >= :date_from")
        params.append(sql_param("date_from", date_from))
    if date_to:
        clauses.append("batch_date <= :date_to")
        params.append(sql_param("date_to", date_to))
    if plant_id:
        clauses.append("plant_id = :plant_id")
        params.append(sql_param("plant_id", plant_id))
    if operation_id:
        clauses.append("operation_id = :operation_id")
        params.append(sql_param("operation_id", operation_id))
    where_sql = "WHERE " + " AND ".join(clauses)

    query = f"""
        SELECT
            batch_id,
            CAST(batch_date AS STRING)  AS batch_date,
            n_inspected,
            n_nonconforming             AS defect_count
        FROM {tbl('spc_attribute_metric_source_v')}
        {where_sql}
        ORDER BY COALESCE(batch_date, '9999-12-31'), batch_id
        LIMIT {_ATTRIBUTE_CHART_MAX_ROWS}
    """
    rows = await run_sql_async(token, query, params)
    rows = _assign_batch_sequence(rows)
    for row in rows:
        row["batch_seq"] = int(float(row.get("batch_seq", 0) or 0))
        row["n_inspected"] = int(float(row.get("n_inspected", 0) or 0))
        row["defect_count"] = int(float(row.get("defect_count", 0) or 0))
    return rows


async def fetch_spec_drift_summary(
    token: str,
    material_id: str,
    mic_id: str,
    plant_id: Optional[str],
    date_from: Optional[str],
    date_to: Optional[str],
    operation_id: Optional[str] = None,
) -> dict:
    """Pre-flight spec-drift check.

    Queries spc_quality_metric_subgroup_v for the number of distinct spec_signature
    values observed for this MIC/material/plant in the requested date range.
    A count > 1 means the process was inspected against different tolerance limits
    within the range — mixing them on one SPC chart produces invalid control limits.

    Returns a dict with keys:
        detected (bool), distinct_signatures (int), total_batches (int),
        signature_set (list[str]).
    """
    params: list[dict] = [
        sql_param("material_id", material_id),
        sql_param("mic_id", mic_id),
    ]
    conditions = [
        "material_id = :material_id",
        "mic_id      = :mic_id",
        "subgroup_rep = 1",
    ]
    if plant_id:
        conditions.append("plant_id = :plant_id")
        params.append(sql_param("plant_id", plant_id))
    if date_from:
        conditions.append("batch_date >= :date_from")
        params.append(sql_param("date_from", date_from))
    if date_to:
        conditions.append("batch_date <= :date_to")
        params.append(sql_param("date_to", date_to))
    if operation_id:
        conditions.append("operation_id = :operation_id")
        params.append(sql_param("operation_id", operation_id))

    where_clause = " AND ".join(conditions)
    query = f"""
        SELECT
            COUNT(DISTINCT spec_signature)  AS distinct_signatures,
            COUNT(DISTINCT batch_id)        AS total_batches,
            COLLECT_SET(spec_signature)     AS signature_set
        FROM (
            SELECT DISTINCT batch_id, spec_signature
            FROM {tbl('spc_quality_metric_subgroup_v')}
            WHERE {where_clause}
        ) t
    """
    rows = await run_sql_async(token, query, params)
    row = rows[0] if rows else {}
    distinct = int(float(row.get("distinct_signatures") or 1))
    total = int(float(row.get("total_batches") or 0))
    sig_set = row.get("signature_set") or []
    if isinstance(sig_set, str):
        sig_set = [sig_set]
    # Forward-compatible placeholder for upstream ECO references (Phase 2.3).
    # The upstream gold view does not yet expose a `spec_change_reference`
    # column tying a spec change to an engineering change order (ECO); when
    # it does, fetch it via a separate COLLECT_SET query joined on
    # spec_signature and populate `change_references` here. See
    # docs/DATA_CONTRACT.md for the extension procedure.
    return {
        "detected": distinct > 1,
        "distinct_signatures": distinct,
        "total_batches": total,
        "signature_set": list(sig_set),
        "change_references": None,
    }


async def save_locked_limits(
    token: str,
    material_id: str,
    mic_id: str,
    plant_id: Optional[str],
    chart_type: str,
    cl: float,
    ucl: float,
    lcl: float,
    ucl_r: Optional[float],
    lcl_r: Optional[float],
    sigma_within: Optional[float],
    baseline_from: Optional[str],
    baseline_to: Optional[str],
    operation_id: Optional[str] = None,
    unified_mic_key: Optional[str] = None,
    mic_origin: Optional[str] = None,
    spec_signature: Optional[str] = None,
    locking_note: Optional[str] = None,
) -> None:
    params = [
        sql_param("material_id", material_id),
        sql_param("mic_id", mic_id),
        sql_param("chart_type", chart_type),
        sql_param("cl", cl),
        sql_param("ucl", ucl),
        sql_param("lcl", lcl),
        sql_param("ucl_r", ucl_r),
        sql_param("lcl_r", lcl_r),
        sql_param("sigma_within", sigma_within),
        sql_param("baseline_from", baseline_from),
        sql_param("baseline_to", baseline_to),
        sql_param("unified_mic_key", unified_mic_key),
        sql_param("mic_origin", mic_origin),
        sql_param("spec_signature", spec_signature),
        sql_param("locking_note", locking_note),
    ]
    if plant_id:
        source_plant_expr = "CAST(:plant_id AS STRING)"
        plant_on_clause = "COALESCE(t.plant_id, '') = COALESCE(s.plant_id, '')"
        params.append(sql_param("plant_id", plant_id))
    else:
        source_plant_expr = "NULL"
        plant_on_clause = "t.plant_id IS NULL AND s.plant_id IS NULL"
    if operation_id:
        source_operation_id_expr = "CAST(:operation_id AS STRING)"
        operation_id_on_clause = "COALESCE(t.operation_id, '') = COALESCE(s.operation_id, '')"
        params.append(sql_param("operation_id", operation_id))
    else:
        source_operation_id_expr = "NULL"
        operation_id_on_clause = "t.operation_id IS NULL AND s.operation_id IS NULL"
    if unified_mic_key:
        mic_identity_on_clause = (
            "(COALESCE(t.unified_mic_key, '') = COALESCE(s.unified_mic_key, '') "
            "OR (t.unified_mic_key IS NULL AND t.mic_id = s.mic_id))"
        )
    else:
        mic_identity_on_clause = "t.mic_id = s.mic_id"
    merge_sql = f"""
        MERGE INTO {tbl('spc_locked_limits')} AS t
        USING (SELECT
            :material_id      AS material_id,
            :mic_id           AS mic_id,
            {source_plant_expr} AS plant_id,
            {source_operation_id_expr} AS operation_id,
            :chart_type       AS chart_type,
            :cl               AS cl,
            :ucl              AS ucl,
            :lcl              AS lcl,
            :ucl_r            AS ucl_r,
            :lcl_r            AS lcl_r,
            :sigma_within     AS sigma_within,
            :baseline_from    AS baseline_from,
            :baseline_to      AS baseline_to,
            :unified_mic_key  AS unified_mic_key,
            :mic_origin       AS mic_origin,
            :spec_signature   AS spec_signature,
            :locking_note     AS locking_note,
            CURRENT_USER()    AS locked_by,
            CURRENT_TIMESTAMP() AS locked_at
        ) AS s
        ON t.material_id = s.material_id
           AND t.chart_type = s.chart_type
           AND {mic_identity_on_clause}
           AND {plant_on_clause}
           AND {operation_id_on_clause}
        WHEN MATCHED THEN UPDATE SET
            t.cl              = s.cl,
            t.ucl             = s.ucl,
            t.lcl             = s.lcl,
            t.ucl_r           = s.ucl_r,
            t.lcl_r           = s.lcl_r,
            t.sigma_within    = s.sigma_within,
            t.baseline_from   = s.baseline_from,
            t.baseline_to     = s.baseline_to,
            t.unified_mic_key = s.unified_mic_key,
            t.mic_origin      = s.mic_origin,
            t.spec_signature  = s.spec_signature,
            t.locking_note    = s.locking_note,
            t.locked_by       = s.locked_by,
            t.locked_at       = s.locked_at
        WHEN NOT MATCHED THEN INSERT (
            material_id, mic_id, plant_id, operation_id, chart_type,
            cl, ucl, lcl, ucl_r, lcl_r, sigma_within,
            baseline_from, baseline_to,
            unified_mic_key, mic_origin, spec_signature, locking_note,
            locked_by, locked_at
        ) VALUES (
            s.material_id, s.mic_id, s.plant_id, s.operation_id, s.chart_type,
            s.cl, s.ucl, s.lcl, s.ucl_r, s.lcl_r, s.sigma_within,
            s.baseline_from, s.baseline_to,
            s.unified_mic_key, s.mic_origin, s.spec_signature, s.locking_note,
            s.locked_by, s.locked_at
        )
    """
    await run_sql_async(token, merge_sql, params)
    return {"saved": True}


async def fetch_locked_limits(
    token: str,
    material_id: str,
    mic_id: str,
    plant_id: Optional[str],
    chart_type: str,
    operation_id: Optional[str] = None,
    unified_mic_key: Optional[str] = None,
) -> Optional[dict]:
    params = [
        sql_param("material_id", material_id),
        sql_param("chart_type", chart_type),
    ]
    if unified_mic_key:
        mic_scope_filter = "AND (unified_mic_key = :unified_mic_key OR mic_id = :mic_id)"
        mic_scope_order = "CASE WHEN unified_mic_key = :unified_mic_key THEN 0 ELSE 1 END,"
        params.append(sql_param("unified_mic_key", unified_mic_key))
        params.append(sql_param("mic_id", mic_id))
    else:
        mic_scope_filter = "AND mic_id = :mic_id"
        mic_scope_order = ""
        params.append(sql_param("mic_id", mic_id))
    if plant_id:
        plant_filter = "AND plant_id = :plant_id"
        params.append(sql_param("plant_id", plant_id))
    else:
        plant_filter = "AND plant_id IS NULL"
    if operation_id:
        operation_id_filter = "AND operation_id = :operation_id"
        params.append(sql_param("operation_id", operation_id))
    else:
        operation_id_filter = "AND operation_id IS NULL"
    query = f"""
        SELECT material_id, mic_id, plant_id, operation_id, chart_type,
               cl, ucl, lcl, ucl_r, lcl_r, sigma_within,
               baseline_from, baseline_to,
               unified_mic_key, mic_origin, spec_signature, locking_note,
               locked_by, locked_at
        FROM {tbl('spc_locked_limits')}
        WHERE material_id = :material_id
          AND chart_type = :chart_type
          {mic_scope_filter}
          {plant_filter}
          {operation_id_filter}
        ORDER BY {mic_scope_order} locked_at DESC
        LIMIT 1
    """
    rows = await run_sql_async(token, query, params)
    if not rows:
        return None
    row = rows[0]
    for field in ("cl", "ucl", "lcl", "ucl_r", "lcl_r", "sigma_within"):
        value = row.get(field)
        row[field] = float(value) if value is not None else None
    if row.get("locked_at") is not None:
        row["locked_at"] = str(row["locked_at"])
    return row


async def delete_locked_limits(
    token: str,
    material_id: str,
    mic_id: str,
    plant_id: Optional[str],
    chart_type: str,
    operation_id: Optional[str] = None,
    unified_mic_key: Optional[str] = None,
) -> None:
    params = [
        sql_param("material_id", material_id),
        sql_param("chart_type", chart_type),
    ]
    if unified_mic_key:
        mic_scope_filter = "AND (unified_mic_key = :unified_mic_key OR mic_id = :mic_id)"
        params.append(sql_param("unified_mic_key", unified_mic_key))
        params.append(sql_param("mic_id", mic_id))
    else:
        mic_scope_filter = "AND mic_id = :mic_id"
        params.append(sql_param("mic_id", mic_id))
    if plant_id:
        plant_filter = "AND plant_id = :plant_id"
        params.append(sql_param("plant_id", plant_id))
    else:
        plant_filter = "AND plant_id IS NULL"
    if operation_id:
        operation_id_filter = "AND operation_id = :operation_id"
        params.append(sql_param("operation_id", operation_id))
    else:
        operation_id_filter = "AND operation_id IS NULL"
    query = f"""
        DELETE FROM {tbl('spc_locked_limits')}
        WHERE material_id = :material_id
          AND chart_type = :chart_type
          {mic_scope_filter}
          {plant_filter}
          {operation_id_filter}
    """
    await run_sql_async(token, query, params)
    return {"deleted": True}


async def fetch_data_quality_summary(
    token: str,
    material_id: str,
    mic_id: str,
    plant_id: Optional[str],
    date_from: Optional[str],
    date_to: Optional[str],
    operation_id: Optional[str] = None,
) -> dict:
    """Single-query data-quality summary for the selected MIC/material/plant.

    Returns counts, missing-value rate, 3-sigma outlier count, and time-gap
    statistics between consecutive batches' posting dates. Surfaced by
    /api/spc/data-quality and rendered in the Data Quality panel on
    ControlChartsView.

    One aggregate query; window functions are used for outlier detection
    (gate based on mean/stddev over the same filtered population) and
    time-gap percentiles. No per-row fetch.
    """
    params = [
        sql_param("material_id", material_id),
        sql_param("mic_id", mic_id),
    ]
    conditions = [
        "r.MATERIAL_ID = :material_id",
        "r.MIC_ID = :mic_id",
    ]
    if operation_id:
        conditions.append("r.OPERATION_ID = :operation_id")
        params.append(sql_param("operation_id", operation_id))
    if date_from:
        conditions.append("mb.POSTING_DATE >= :date_from")
        params.append(sql_param("date_from", date_from))
    if date_to:
        conditions.append("mb.POSTING_DATE <= :date_to")
        params.append(sql_param("date_to", date_to))
    if plant_id:
        conditions.append("mb.PLANT_ID = :plant_id")
        params.append(sql_param("plant_id", plant_id))

    where_clause = " AND ".join(conditions)

    query = f"""
        WITH filtered AS (
            SELECT
                r.BATCH_ID                                     AS batch_id,
                r.QUANTITATIVE_RESULT                          AS raw_value,
                TRY_CAST(r.QUANTITATIVE_RESULT AS DOUBLE)      AS value,
                mb.POSTING_DATE                                AS posting_date
            FROM {tbl('gold_batch_quality_result_v')} r
            JOIN (
                SELECT BATCH_ID, MATERIAL_ID, MIN(POSTING_DATE) AS POSTING_DATE, MAX(PLANT_ID) AS PLANT_ID
                FROM {tbl('gold_batch_mass_balance_v')}
                WHERE MOVEMENT_CATEGORY = 'Production'
                GROUP BY BATCH_ID, MATERIAL_ID
            ) mb ON mb.BATCH_ID = r.BATCH_ID AND mb.MATERIAL_ID = r.MATERIAL_ID
            WHERE {where_clause}
        ),
        stats AS (
            SELECT
                AVG(value)                                     AS mean_value,
                STDDEV_SAMP(value)                             AS stddev_value
            FROM filtered
            WHERE value IS NOT NULL
        ),
        per_batch AS (
            SELECT batch_id, MIN(posting_date) AS batch_date
            FROM filtered
            GROUP BY batch_id
        ),
        gaps AS (
            SELECT
                DATEDIFF(
                    batch_date,
                    LAG(batch_date) OVER (ORDER BY batch_date)
                ) AS gap_days
            FROM per_batch
        )
        SELECT
            (SELECT COUNT(*) FROM filtered)                                                          AS n_samples,
            (SELECT COUNT(DISTINCT batch_id) FROM filtered)                                          AS n_batches,
            (SELECT COUNT(*) FROM filtered WHERE raw_value IS NULL OR raw_value = '')                AS n_missing_values,
            (SELECT COUNT(*) FROM filtered WHERE value IS NULL AND raw_value IS NOT NULL AND raw_value != '') AS n_unparseable_values,
            (SELECT mean_value FROM stats)                                                           AS mean_value,
            (SELECT stddev_value FROM stats)                                                         AS stddev_value,
            (
                SELECT COUNT(*)
                FROM filtered, stats
                WHERE filtered.value IS NOT NULL
                  AND stats.stddev_value IS NOT NULL
                  AND stats.stddev_value > 0
                  AND ABS(filtered.value - stats.mean_value) > 3 * stats.stddev_value
            )                                                                                        AS n_outliers_3sigma,
            (SELECT MIN(batch_date) FROM per_batch)                                                  AS first_batch_date,
            (SELECT MAX(batch_date) FROM per_batch)                                                  AS last_batch_date,
            (SELECT PERCENTILE(gap_days, 0.5) FROM gaps WHERE gap_days IS NOT NULL)                  AS median_gap_days,
            (SELECT PERCENTILE(gap_days, 0.95) FROM gaps WHERE gap_days IS NOT NULL)                 AS p95_gap_days,
            (SELECT MAX(gap_days) FROM gaps WHERE gap_days IS NOT NULL)                              AS max_gap_days
    """
    rows = await run_sql_async(token, query, params)
    row = rows[0] if rows else {}

    def _num(val, default=0):
        if val is None:
            return default
        try:
            return float(val)
        except (TypeError, ValueError):
            return default

    def _int(val, default=0):
        try:
            return int(_num(val, default))
        except (TypeError, ValueError):
            return default

    n_samples = _int(row.get("n_samples"))
    n_missing = _int(row.get("n_missing_values"))
    denom = max(n_samples, 1)
    return {
        "n_samples": n_samples,
        "n_batches": _int(row.get("n_batches")),
        "n_missing_values": n_missing,
        "n_unparseable_values": _int(row.get("n_unparseable_values")),
        "pct_missing": round(n_missing / denom, 4),
        "n_outliers_3sigma": _int(row.get("n_outliers_3sigma")),
        "mean_value": None if row.get("mean_value") is None else round(_num(row.get("mean_value")), 6),
        "stddev_value": None if row.get("stddev_value") is None else round(_num(row.get("stddev_value")), 6),
        "first_batch_date": row.get("first_batch_date"),
        "last_batch_date": row.get("last_batch_date"),
        "median_gap_days": None if row.get("median_gap_days") is None else round(_num(row.get("median_gap_days")), 2),
        "p95_gap_days": None if row.get("p95_gap_days") is None else round(_num(row.get("p95_gap_days")), 2),
        "max_gap_days": None if row.get("max_gap_days") is None else round(_num(row.get("max_gap_days")), 2),
    }
