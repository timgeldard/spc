from typing import Optional

from backend.dal.spc_shared import infer_spec_type
from backend.utils.db import run_sql_async, sql_param, tbl

_NORMALITY_MAX_POINTS = 5000
_FULL_CHART_MAX_ROWS = 10000


def _apply_chart_row_formatting(rows: list[dict]) -> list[dict]:
    numeric_fields = ["value", "nominal", "tolerance", "lsl", "usl", "batch_seq", "sample_seq"]
    for row in rows:
        for field in numeric_fields:
            value = row.get(field)
            if value is not None:
                try:
                    row[field] = float(value) if field not in ("batch_seq", "sample_seq") else int(float(value))
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
        row["spec_type"] = infer_spec_type(row["usl"], row["lsl"])
        if "plant_id" not in row:
            row["plant_id"] = None
    return rows


def _build_chart_filters(
    material_id: str,
    mic_id: str,
    mic_name: Optional[str],
    plant_id: Optional[str],
    date_from: Optional[str],
    date_to: Optional[str],
    stratify_all: bool = False,
) -> tuple[list[dict], str, str, str]:
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
    return params, date_filter, plant_filter, mic_name_filter + plant_select


async def fetch_chart_data_page(
    token: str,
    material_id: str,
    mic_id: str,
    mic_name: Optional[str],
    plant_id: Optional[str],
    date_from: Optional[str],
    date_to: Optional[str],
    stratify_all: bool = False,
    cursor: Optional[str] = None,
    limit: int = 1000,
) -> dict:
    params, date_filter, plant_filter, filter_tail = _build_chart_filters(
        material_id,
        mic_id,
        mic_name,
        plant_id,
        date_from,
        date_to,
        stratify_all,
    )
    mic_name_filter = filter_tail.replace(", plant_id", "")
    plant_select = ", plant_id" if stratify_all else ""

    cursor_filter = ""
    if cursor:
        batch_seq_str, sample_seq_str = cursor.split(":", 1)
        params.extend([
            sql_param("cursor_batch_seq", int(batch_seq_str)),
            sql_param("cursor_sample_seq", int(sample_seq_str)),
        ])
        cursor_filter = """
        WHERE batch_seq > :cursor_batch_seq
           OR (batch_seq = :cursor_batch_seq AND sample_seq > :cursor_sample_seq)
        """

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
        {cursor_filter}
        ORDER BY batch_seq, sample_seq
        LIMIT {limit + 1}
    """
    rows = await run_sql_async(token, query, params)
    has_more = len(rows) > limit
    page_rows = _apply_chart_row_formatting(rows[:limit])
    next_cursor = None
    if has_more and page_rows:
        last_row = page_rows[-1]
        next_cursor = f"{last_row['batch_seq']}:{last_row['sample_seq']}"
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
    stratify_all: bool = False,
    max_points: int = _NORMALITY_MAX_POINTS,
) -> list[Optional[float]]:
    params, date_filter, plant_filter, filter_tail = _build_chart_filters(
        material_id,
        mic_id,
        mic_name,
        plant_id,
        date_from,
        date_to,
        stratify_all,
    )
    mic_name_filter = filter_tail.replace(", plant_id", "")
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
        )
        SELECT CAST(r.QUANTITATIVE_RESULT AS DOUBLE) AS value
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
        ORDER BY COALESCE(bd.batch_date, '9999-12-31'), r.BATCH_ID, r.SAMPLE_ID, r.INSPECTION_LOT_ID
        LIMIT {max_points}
    """
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
    stratify_all: bool = False,
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
            stratify_all,
            cursor=cursor,
            limit=min(1000, remaining),
        )
        all_rows.extend(page["data"])
        if not page["has_more"]:
            break
        cursor = page["next_cursor"]
    return all_rows[:max_rows]


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
