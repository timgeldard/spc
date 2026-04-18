from typing import Optional

from backend.utils.db import run_sql_async, sql_param, tbl

# Valid chart types an override may pin a MIC to. Overrides outside this set
# are ignored to keep a typo in the config table from crashing the chart.
_VALID_CHART_TYPES = {"imr", "xbar_r", "xbar_s", "p_chart", "np_chart", "c_chart", "u_chart"}


async def _fetch_mic_chart_overrides(
    token: str,
    material_id: str,
    plant_id: Optional[str],
) -> dict[str, str]:
    """Return {mic_id: chart_type} for overrides that apply to this material/plant.

    Precedence (most specific wins): (plant_id, material_id) > (NULL, material_id)
    > (NULL, NULL). Selecting these three tiers in SQL and resolving in Python
    keeps the query simple and auditable.
    """
    query = f"""
        SELECT mic_id, chart_type, plant_id, material_id
        FROM {tbl('spc_mic_chart_config')}
        WHERE (material_id = :material_id OR material_id IS NULL)
          AND (plant_id = :plant_id OR plant_id IS NULL)
    """
    params = [sql_param("material_id", material_id), sql_param("plant_id", plant_id)]
    try:
        rows = await run_sql_async(token, query, params)
    except Exception:
        # Config table not yet migrated — fall back to heuristic silently.
        return {}

    # Sort so more specific rows land last and overwrite less specific ones.
    def specificity(row: dict) -> int:
        score = 0
        if row.get("material_id") is not None:
            score += 2
        if row.get("plant_id") is not None:
            score += 1
        return score

    rows_sorted = sorted(rows, key=specificity)
    overrides: dict[str, str] = {}
    for row in rows_sorted:
        mic_id = row.get("mic_id")
        chart_type = row.get("chart_type")
        if not mic_id or chart_type not in _VALID_CHART_TYPES:
            continue
        overrides[str(mic_id)] = str(chart_type)
    return overrides


async def fetch_plants(token: str, material_id: str) -> list[dict]:
    query = f"""
        SELECT plant_id, plant_name
        FROM {tbl('spc_plant_material_dim_mv')}
        WHERE material_id = :material_id
        ORDER BY plant_name
    """
    return await run_sql_async(token, query, [sql_param("material_id", material_id)])


async def validate_material(token: str, material_id: str) -> Optional[dict]:
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
    rows = await run_sql_async(token, query, [sql_param("material_id", material_id)])
    return rows[0] if rows else None


async def fetch_materials(token: str) -> list[dict]:
    query = f"""
        SELECT material_id, material_name
        FROM {tbl('spc_material_dim_mv')}
        ORDER BY material_name
    """
    return await run_sql_async(token, query)


async def fetch_characteristics(token: str, material_id: str, plant_id: Optional[str] = None) -> tuple[list[dict], list[dict]]:
    params = [sql_param("material_id", material_id)]
    plant_filter = ""
    if plant_id:
        plant_filter = f"""
          AND BATCH_ID IN (
              SELECT DISTINCT BATCH_ID
              FROM {tbl('gold_batch_mass_balance_v')}
              WHERE MATERIAL_ID = :material_id
                AND PLANT_ID = :plant_id
                AND MOVEMENT_CATEGORY = 'Production'
          )"""
        params.append(sql_param("plant_id", plant_id))
    plant_id_expr = ":plant_id" if plant_id else "NULL"
    query = f"""
        SELECT
            MIC_ID                                                       AS mic_id,
            CASE WHEN COUNT(DISTINCT OPERATION_ID) = 1
                 THEN MAX(OPERATION_ID) END                              AS operation_id,
            MIC_NAME                                                     AS mic_name,
            MAX(UPPER(TRIM(MIC_NAME)))                                   AS mic_name_normalized,
            INSPECTION_METHOD                                            AS inspection_method,
            -- Unified MIC key: plant-scoped canonical identity.
            -- Uses provided plant_id if available; otherwise uses 'NO_PLANT' as scope.
            MAX(CONCAT_WS('||',
                COALESCE({plant_id_expr}, 'NO_PLANT'),
                UPPER(TRIM(MIC_NAME)),
                'NO_UNIT'
            ))                                                           AS unified_mic_key,
            MAX(CASE WHEN QUALITATIVE_RESULT IS NOT NULL
                          AND QUALITATIVE_RESULT != ''
                     THEN 1 ELSE 0 END)                                 AS is_attribute,
            MAX(CASE WHEN QUANTITATIVE_RESULT IS NOT NULL
                     THEN 1 ELSE 0 END)                                 AS has_quantitative,
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
    rows = await run_sql_async(token, query, params)
    overrides = await _fetch_mic_chart_overrides(token, material_id, plant_id)
    characteristics = []
    attr_characteristics = []
    for row in rows:
        is_attr = int(float(row.get("is_attribute") or 0)) == 1
        has_quant = int(float(row.get("has_quantitative") or 0)) == 1
        row.pop("is_attribute", None)
        row.pop("has_quantitative", None)
        value = row.get("inspection_method")
        row["inspection_method"] = str(value) if value is not None else None
        row["batch_count"] = int(float(row.get("batch_count") or 0))
        # A MIC with both result types has a routing conflict.
        row["routing_conflict"] = is_attr and has_quant
        mic_id = row.get("mic_id")
        override = overrides.get(str(mic_id)) if mic_id is not None else None
        if is_attr:
            row["chart_type"] = override if override in {"p_chart", "np_chart", "c_chart", "u_chart"} else "p_chart"
            row["chart_type_source"] = "override" if override == row["chart_type"] else "default"
            attr_characteristics.append(row)
        else:
            total_samples = float(row.get("total_samples") or 0)
            batch_count = row["batch_count"] or 1
            avg_spb = total_samples / batch_count
            row["avg_samples_per_batch"] = avg_spb
            default_chart = "xbar_r" if avg_spb > 1.5 else "imr"
            if override in {"imr", "xbar_r", "xbar_s"}:
                row["chart_type"] = override
                row["chart_type_source"] = "override"
            else:
                row["chart_type"] = default_chart
                row["chart_type_source"] = "heuristic"
            characteristics.append(row)
    return characteristics, attr_characteristics


async def fetch_attribute_characteristics(token: str, material_id: str, plant_id: Optional[str] = None) -> list[dict]:
    params = [sql_param("material_id", material_id)]
    filters = ["material_id = :material_id"]
    if plant_id:
        filters.append("plant_id = :plant_id")
        params.append(sql_param("plant_id", plant_id))
    where_sql = "WHERE " + " AND ".join(filters)

    query = f"""
        SELECT
            mic_id,
            operation_id,
            mic_name,
            inspection_method,
            MEASURE(batch_count)               AS batch_count,
            MEASURE(total_inspected)           AS total_inspected,
            MEASURE(total_nonconforming)       AS total_nonconforming,
            MEASURE(p_bar)                     AS p_bar
        FROM {tbl('spc_attribute_quality_metrics')}
        {where_sql}
        GROUP BY mic_id, mic_name, operation_id, inspection_method
        HAVING MEASURE(batch_count) >= 3
        ORDER BY mic_name
    """
    rows = await run_sql_async(token, query, params)
    for row in rows:
        for field in ("batch_count", "total_inspected", "total_nonconforming"):
            value = row.get(field)
            row[field] = int(float(value)) if value is not None else 0
        p_bar = row.get("p_bar")
        row["p_bar"] = round(float(p_bar), 4) if p_bar is not None else None
        row["chart_type"] = "p_chart"
    return rows
