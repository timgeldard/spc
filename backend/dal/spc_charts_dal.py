from dataclasses import dataclass, field
from typing import Optional
from urllib.parse import quote, unquote

from pypika import Table, functions as fn
from pypika.dialects import MySQLQuery
from pypika.terms import Criterion, LiteralValue

from backend.dal.spc_shared import infer_spec_type
from backend.utils.db import run_sql_async, sql_param, tbl

_NORMALITY_MAX_POINTS = 5000
_FULL_CHART_MAX_ROWS = 10000
_MB_TABLE_PLACEHOLDER = "__spc_mass_balance__"
_QR_TABLE_PLACEHOLDER = "__spc_quality_result__"
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
        row[field] = float(value)
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
        row["spec_type"] = infer_spec_type(row["usl"], row["lsl"])
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


def _render_query(query) -> str:
    return (
        query.get_sql()
        .replace(f"`{_MB_TABLE_PLACEHOLDER}`", tbl("gold_batch_mass_balance_v"))
        .replace(f"`{_QR_TABLE_PLACEHOLDER}`", tbl("gold_batch_quality_result_v"))
    )


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

    if mic_name:
        params.append(sql_param("mic_name", mic_name))
        quality_conditions.append("r.MIC_NAME = :mic_name")
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
    mb = Table(_MB_TABLE_PLACEHOLDER).as_("mb")
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
    r = Table(_QR_TABLE_PLACEHOLDER).as_("r")
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
        .left_join(bd)
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
    return _render_query(final_query), params


def _build_chart_values_query(filters: ChartFilterSpec, max_points: int) -> tuple[str, list[dict]]:
    r = Table(_QR_TABLE_PLACEHOLDER).as_("r")
    bd = Table("batch_dates").as_("bd")
    final_query = (
        MySQLQuery.with_(_build_batch_dates_cte(filters), "batch_dates")
        .from_(r)
        .left_join(bd)
        .on((bd.MATERIAL_ID == r.MATERIAL_ID) & (bd.BATCH_ID == r.BATCH_ID))
        .select(_sql_expr("CAST(r.QUANTITATIVE_RESULT AS DOUBLE)").as_("value"))
        .orderby(_sql_expr("COALESCE(bd.batch_date, '9999-12-31')"))
        .orderby(r.BATCH_ID)
        .orderby(r.SAMPLE_ID)
        .orderby(r.INSPECTION_LOT_ID)
        .limit(max_points)
    )
    final_query = _apply_conditions(final_query, filters.quality_conditions)
    return _render_query(final_query), list(filters.params)


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
) -> dict:
    filters = _build_chart_filters(
        material_id,
        mic_id,
        mic_name,
        plant_id,
        date_from,
        date_to,
        stratify_by,
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
) -> list[Optional[float]]:
    filters = _build_chart_filters(
        material_id,
        mic_id,
        mic_name,
        plant_id,
        date_from,
        date_to,
        stratify_by,
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
) -> list[dict]:
    params = [sql_param("material_id", material_id), sql_param("mic_id", mic_id)]
    if mic_name:
        params.append(sql_param("mic_name", mic_name))
    mb_clauses = []
    if date_from:
        mb_clauses.append("mb.POSTING_DATE >= :date_from")
        params.append(sql_param("date_from", date_from))
    if date_to:
        mb_clauses.append("mb.POSTING_DATE <= :date_to")
        params.append(sql_param("date_to", date_to))
    if plant_id:
        mb_clauses.append("mb.PLANT_ID = :plant_id")
        params.append(sql_param("plant_id", plant_id))
    date_filter = ("AND " + " AND ".join(mb_clauses)) if mb_clauses else ""
    mic_name_filter = "AND r.MIC_NAME = :mic_name" if mic_name else ""

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
              {mic_name_filter}
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
    rows = await run_sql_async(token, query, params)
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
) -> list[dict]:
    params = [sql_param("material_id", material_id), sql_param("mic_id", mic_id)]
    if mic_name:
        params.append(sql_param("mic_name", mic_name))
    mb_clauses = []
    if date_from:
        mb_clauses.append("mb.POSTING_DATE >= :date_from")
        params.append(sql_param("date_from", date_from))
    if date_to:
        mb_clauses.append("mb.POSTING_DATE <= :date_to")
        params.append(sql_param("date_to", date_to))
    if plant_id:
        mb_clauses.append("mb.PLANT_ID = :plant_id")
        params.append(sql_param("plant_id", plant_id))
    date_filter = ("AND " + " AND ".join(mb_clauses)) if mb_clauses else ""
    mic_name_filter = "AND r.MIC_NAME = :mic_name" if mic_name else ""

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
    rows = await run_sql_async(token, query, params)
    for row in rows:
        row["batch_seq"] = int(float(row.get("batch_seq", 0) or 0))
        row["n_inspected"] = int(float(row.get("n_inspected", 0) or 0))
        row["defect_count"] = int(float(row.get("defect_count", 0) or 0))
    return rows


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
    ]
    if plant_id:
        source_plant_expr = "CAST(:plant_id AS STRING)"
        plant_on_clause = "COALESCE(t.plant_id, '') = COALESCE(s.plant_id, '')"
        params.append(sql_param("plant_id", plant_id))
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
    await run_sql_async(token, merge_sql, params)
    return {"saved": True}


async def fetch_locked_limits(
    token: str,
    material_id: str,
    mic_id: str,
    plant_id: Optional[str],
    chart_type: str,
) -> Optional[dict]:
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
) -> None:
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
        DELETE FROM {tbl('spc_locked_limits')}
        WHERE material_id = :material_id
          AND mic_id = :mic_id
          AND chart_type = :chart_type
          {plant_filter}
    """
    await run_sql_async(token, query, params)
    return {"deleted": True}
