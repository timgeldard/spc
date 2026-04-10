from typing import Optional

from backend.utils.db import run_sql_async, sql_param, tbl


async def fetch_plants(token: str, material_id: str) -> list[dict]:
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
    query = f"""
        SELECT
            MIC_ID                                                       AS mic_id,
            OPERATION_ID                                                 AS operation_id,
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
        GROUP BY MIC_ID, MIC_NAME, INSPECTION_METHOD, OPERATION_ID
        HAVING COUNT(DISTINCT BATCH_ID) >= 3
        ORDER BY mic_name
    """
    rows = await run_sql_async(token, query, params)
    characteristics = []
    attr_characteristics = []
    for row in rows:
        is_attr = int(float(row.get("is_attribute") or 0)) == 1
        value = row.get("inspection_method")
        row["inspection_method"] = str(value) if value is not None else None
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
    return characteristics, attr_characteristics


async def fetch_attribute_characteristics(token: str, material_id: str, plant_id: Optional[str] = None) -> list[dict]:
    params = [sql_param("material_id", material_id)]
    plant_filter = ""
    if plant_id:
        plant_filter = f"""
              AND BATCH_ID IN (
                  SELECT DISTINCT BATCH_ID
                  FROM {tbl('gold_batch_mass_balance_v')}
                  WHERE PLANT_ID = :plant_id
                    AND MOVEMENT_CATEGORY = 'Production'
              )"""
        params.append(sql_param("plant_id", plant_id))

    query = f"""
        SELECT
            MIC_ID                              AS mic_id,
            OPERATION_ID                        AS operation_id,
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
        GROUP BY MIC_ID, MIC_NAME, OPERATION_ID
        HAVING COUNT(DISTINCT BATCH_ID) >= 3
        ORDER BY mic_name
    """
    rows = await run_sql_async(token, query, params)
    for row in rows:
        for field in ("batch_count", "total_inspected", "total_nonconforming"):
            value = row.get(field)
            row[field] = int(float(value)) if value is not None else 0
        total = row["total_inspected"] or 1
        row["p_bar"] = round(row["total_nonconforming"] / total, 4)
        row["chart_type"] = "p_chart"
    return rows
