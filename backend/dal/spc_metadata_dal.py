from typing import Optional

from backend.utils.db import run_sql_async, sql_param, tbl

# Valid chart types an override may pin a MIC to. Overrides outside this set
# are ignored to keep a typo in the config table from crashing the chart.
_VALID_CHART_TYPES = {"imr", "xbar_r", "xbar_s", "p_chart", "np_chart", "c_chart", "u_chart"}


def _normalize_mic_name(value: object) -> str:
    text = str(value or "").strip().upper()
    return text or "UNKNOWN_MIC"


async def _fetch_quantitative_characteristics(
    token: str,
    material_id: str,
    plant_id: Optional[str],
) -> list[dict]:
    if plant_id:
        query = f"""
            SELECT
                mic_id,
                CASE WHEN COUNT(DISTINCT operation_id) = 1
                     THEN MAX(operation_id) END                       AS operation_id,
                mic_name,
                MAX(UPPER(TRIM(mic_name)))                            AS mic_name_normalized,
                inspection_method,
                MAX(unified_mic_key)                                  AS unified_mic_key,
                COUNT(DISTINCT batch_id)                              AS batch_count,
                SUM(CASE WHEN subgroup_rep = 1 THEN batch_n ELSE 0 END) AS total_samples
            FROM {tbl('spc_quality_metric_subgroup_v')}
            WHERE material_id = :material_id
              AND plant_id = :plant_id
            GROUP BY mic_id, mic_name, inspection_method
            HAVING COUNT(DISTINCT batch_id) >= 3
            ORDER BY mic_name
        """
        params = [sql_param("material_id", material_id), sql_param("plant_id", plant_id)]
        return await run_sql_async(token, query, params, endpoint_hint="spc.metadata.characteristics")

    query = f"""
        SELECT
            mic_id,
            operation_id,
            mic_name,
            mic_name_normalized,
            inspection_method,
            batch_count,
            total_samples
        FROM {tbl('spc_characteristic_dim_mv')}
        WHERE material_id = :material_id
        ORDER BY mic_name
    """
    return await run_sql_async(
        token, query, [sql_param("material_id", material_id)], endpoint_hint="spc.metadata.characteristics"
    )


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
        rows = await run_sql_async(token, query, params, endpoint_hint="spc.metadata.chart-overrides")
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
    return await run_sql_async(token, query, [sql_param("material_id", material_id)], endpoint_hint="spc.metadata.plants")


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
    rows = await run_sql_async(
        token, query, [sql_param("material_id", material_id)], endpoint_hint="spc.metadata.validate-material"
    )
    return rows[0] if rows else None


async def fetch_materials(token: str) -> list[dict]:
    query = f"""
        SELECT material_id, material_name
        FROM {tbl('spc_material_dim_mv')}
        ORDER BY material_name
    """
    return await run_sql_async(token, query, endpoint_hint="spc.metadata.materials")


async def fetch_characteristics(token: str, material_id: str, plant_id: Optional[str] = None) -> tuple[list[dict], list[dict]]:
    rows = await _fetch_quantitative_characteristics(token, material_id, plant_id)
    attr_rows = await fetch_attribute_characteristics(token, material_id, plant_id)
    overrides = await _fetch_mic_chart_overrides(token, material_id, plant_id)
    # The attribute query now collapses operations when a MIC spans multiple
    # ops (operation_id comes back NULL), so the per-(mic_id, operation_id)
    # check used here previously would falsely clear routing_conflict. Use
    # mic_id alone: if any quantitative mic_id is also seen as attribute,
    # flag the conflict. Coarser, but safer — the downstream UX just tells
    # the user "this MIC has both variable and attribute records".
    attribute_mic_ids = {str(row.get("mic_id") or "") for row in attr_rows}
    characteristics = []
    for row in rows:
        value = row.get("inspection_method")
        row["inspection_method"] = str(value) if value is not None else None
        row["batch_count"] = int(float(row.get("batch_count") or 0))
        row["routing_conflict"] = str(row.get("mic_id") or "") in attribute_mic_ids
        normalized_name = _normalize_mic_name(row.get("mic_name_normalized") or row.get("mic_name"))
        row["mic_name_normalized"] = normalized_name
        row["unified_mic_key"] = row.get("unified_mic_key") or (
            f"{plant_id}||{normalized_name}||NO_UNIT" if plant_id else None
        )
        mic_id = row.get("mic_id")
        override = overrides.get(str(mic_id)) if mic_id is not None else None
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

    attr_characteristics = []
    # Mirror of the attribute_mic_ids set above — same reasoning. An attribute
    # row flags routing_conflict if its mic_id also appears in the collapsed
    # quantitative output.
    quantitative_mic_ids = {str(row.get("mic_id") or "") for row in characteristics}
    for row in attr_rows:
        row["routing_conflict"] = str(row.get("mic_id") or "") in quantitative_mic_ids
        mic_id = row.get("mic_id")
        override = overrides.get(str(mic_id)) if mic_id is not None else None
        row["chart_type"] = override if override in {"p_chart", "np_chart", "c_chart", "u_chart"} else "p_chart"
        row["chart_type_source"] = "override" if override == row["chart_type"] else "default"
        attr_characteristics.append(row)
    return characteristics, attr_characteristics


async def fetch_attribute_characteristics(token: str, material_id: str, plant_id: Optional[str] = None) -> list[dict]:
    params = [sql_param("material_id", material_id)]
    filters = ["material_id = :material_id"]
    if plant_id:
        filters.append("plant_id = :plant_id")
        params.append(sql_param("plant_id", plant_id))
    where_sql = "WHERE " + " AND ".join(filters)

    # Mirrors the collapse idiom in `_fetch_quantitative_characteristics`: group
    # by (mic_id, mic_name, inspection_method) and emit operation_id only when
    # there is exactly one operation per group. Prevents the dropdown from
    # showing N rows for a single attribute characteristic measured at N
    # operations (same mic_id, different op) — which was the observed bug.
    # Measures auto-aggregate at the coarser grain: batch_count remains a
    # distinct-batch count across operations, totals are summed, p_bar is
    # recomputed as the ratio at the new grain.
    query = f"""
        SELECT
            mic_id,
            mic_name,
            inspection_method,
            CASE WHEN COUNT(DISTINCT operation_id) = 1
                 THEN MAX(operation_id) END         AS operation_id,
            MEASURE(batch_count)                    AS batch_count,
            MEASURE(total_inspected)                AS total_inspected,
            MEASURE(total_nonconforming)            AS total_nonconforming,
            MEASURE(p_bar)                          AS p_bar
        FROM {tbl('spc_attribute_quality_metrics')}
        {where_sql}
        GROUP BY mic_id, mic_name, inspection_method
        HAVING MEASURE(batch_count) >= 3
        ORDER BY mic_name
    """
    rows = await run_sql_async(token, query, params, endpoint_hint="spc.metadata.attribute-characteristics")
    for row in rows:
        for field in ("batch_count", "total_inspected", "total_nonconforming"):
            value = row.get(field)
            row[field] = int(float(value)) if value is not None else 0
        p_bar = row.get("p_bar")
        row["p_bar"] = round(float(p_bar), 4) if p_bar is not None else None
        row["chart_type"] = "p_chart"
    return rows
