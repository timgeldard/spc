import asyncio
import math
import uuid
from typing import Optional

from backend.dal.spc_shared import D2_TABLE, infer_spec_type, normal_cdf
from backend.utils.db import run_sql_async, sql_param, tbl
from backend.utils.spc_thresholds import CPK_CAPABLE, CPK_HIGHLY_CAPABLE, CPK_MARGINAL


async def fetch_process_flow(
    token: str,
    material_id: str,
    date_from: Optional[str],
    date_to: Optional[str],
) -> dict:
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
    edge_rows = await run_sql_async(token, edges_query, [sql_param("material_id", material_id)])

    material_ids = {material_id}
    for edge in edge_rows:
        if edge.get("source"):
            material_ids.add(str(edge["source"]))
        if edge.get("target"):
            material_ids.add(str(edge["target"]))

    if not material_ids:
        return {"nodes": [], "edges": []}

    sorted_mids = sorted(material_ids)
    mat_params = [sql_param(f"m{i}", mid) for i, mid in enumerate(sorted_mids)]
    in_clause = ", ".join(f":m{i}" for i in range(len(sorted_mids)))

    date_params: list[dict] = []
    date_clauses: list[str] = []
    if date_from:
        date_clauses.append("mb.POSTING_DATE >= :date_from")
        date_params.append(sql_param("date_from", date_from))
    if date_to:
        date_clauses.append("mb.POSTING_DATE <= :date_to")
        date_params.append(sql_param("date_to", date_to))
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
    health_rows = await run_sql_async(token, health_query, mat_params + date_params)

    health_by_mat: dict[str, dict] = {}
    for row in health_rows:
        mid = str(row.get("material_id", ""))
        for field in ["total_batches", "rejected_batches", "mic_count"]:
            value = row.get(field)
            row[field] = int(float(value)) if value is not None else 0

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
            "is_root": mid == material_id,
        })

    seen_edges: set[tuple[str, str]] = set()
    edges = []
    for edge in edge_rows:
        src = str(edge.get("source", ""))
        tgt = str(edge.get("target", ""))
        if src and tgt and (src, tgt) not in seen_edges:
            seen_edges.add((src, tgt))
            edges.append({"source": src, "target": tgt})

    return {"nodes": nodes, "edges": edges}


async def fetch_scorecard(
    token: str,
    material_id: str,
    plant_id: Optional[str],
    date_from: Optional[str],
    date_to: Optional[str],
) -> list[dict]:
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
        WITH batch_metadata AS (
            SELECT
                MATERIAL_ID,
                BATCH_ID,
                MAX(PLANT_ID) AS plant_id
            FROM {tbl('gold_batch_mass_balance_v')} mb
            WHERE mb.MATERIAL_ID = :material_id
              AND mb.MOVEMENT_CATEGORY = 'Production'
              {date_filter}
            GROUP BY MATERIAL_ID, BATCH_ID
        ),
        filtered_results AS (
            SELECT
                r.BATCH_ID                                            AS batch_id,
                r.MIC_ID                                              AS mic_id,
                r.MIC_NAME                                            AS mic_name,
                CAST(r.QUANTITATIVE_RESULT AS DOUBLE)                 AS value,
                TRY_CAST(r.TARGET_VALUE AS DOUBLE)                    AS nominal_target,
                TRY_CAST(
                    CASE WHEN LOCATE('...', r.TOLERANCE) > 0
                         THEN SUBSTRING(r.TOLERANCE, 1, LOCATE('...', r.TOLERANCE) - 1)
                    END AS DOUBLE)                                    AS lsl_spec,
                TRY_CAST(
                    CASE WHEN LOCATE('...', r.TOLERANCE) > 0
                         THEN SUBSTRING(r.TOLERANCE, LOCATE('...', r.TOLERANCE) + 3)
                    END AS DOUBLE)                                    AS usl_spec,
                CASE WHEN LOCATE('...', r.TOLERANCE) = 0
                     THEN TRY_CAST(r.TOLERANCE AS DOUBLE) END         AS tolerance_half_width,
                r.TOLERANCE                                           AS raw_tolerance,
                r.INSPECTION_RESULT_VALUATION                         AS valuation
            FROM {tbl('gold_batch_quality_result_v')} r
            INNER JOIN batch_metadata bm
                ON bm.MATERIAL_ID = r.MATERIAL_ID
               AND bm.BATCH_ID    = r.BATCH_ID
            WHERE r.MATERIAL_ID = :material_id
              AND r.QUANTITATIVE_RESULT IS NOT NULL
              AND (r.QUALITATIVE_RESULT IS NULL OR r.QUALITATIVE_RESULT = '')
        ),
        batch_ranges AS (
            SELECT
                mic_id,
                mic_name,
                batch_id,
                COUNT(*)                                              AS batch_n,
                MAX(value) - MIN(value)                               AS batch_range
            FROM filtered_results
            GROUP BY mic_id, mic_name, batch_id
            HAVING COUNT(*) >= 2
        ),
        range_summary AS (
            SELECT
                mic_id,
                mic_name,
                AVG(batch_range)                                      AS r_bar,
                AVG(batch_n)                                          AS avg_n
            FROM batch_ranges
            GROUP BY mic_id, mic_name
        ),
        mic_stats AS (
            SELECT
                mic_id,
                mic_name,
                COUNT(DISTINCT batch_id)                              AS batch_count,
                COUNT(*)                                              AS sample_count,
                ROUND(AVG(value), 4)                                  AS mean_value,
                ROUND(STDDEV_SAMP(value), 4)                          AS stddev_overall,
                ROUND(MIN(value), 4)                                  AS min_value,
                ROUND(MAX(value), 4)                                  AS max_value,
                MAX(nominal_target)                                   AS nominal_target,
                MAX(lsl_spec)                                         AS lsl_spec,
                MAX(usl_spec)                                         AS usl_spec,
                MAX(tolerance_half_width)                             AS tolerance_half_width,
                COUNT(DISTINCT nominal_target)                        AS distinct_nominal_count,
                COUNT(DISTINCT raw_tolerance)                         AS distinct_tolerance_count,
                COUNT(DISTINCT CASE
                    WHEN valuation = 'R' THEN batch_id
                END)                                                  AS ooc_batches,
                COUNT(DISTINCT CASE
                    WHEN valuation = 'A' THEN batch_id
                END)                                                  AS accepted_batches
            FROM filtered_results
            GROUP BY mic_id, mic_name
        )
        SELECT
            ms.*,
            ROUND(rs.r_bar, 4)                                        AS r_bar,
            ROUND(rs.avg_n, 4)                                        AS avg_n
        FROM mic_stats ms
        LEFT JOIN range_summary rs
            ON rs.mic_id = ms.mic_id
           AND rs.mic_name = ms.mic_name
        WHERE ms.batch_count >= 3
        ORDER BY ms.mic_name
    """
    rows = await run_sql_async(token, query, params)

    numeric_fields = [
        "batch_count", "sample_count", "mean_value", "stddev_overall",
        "min_value", "max_value", "nominal_target", "tolerance_half_width",
        "lsl_spec", "usl_spec", "ooc_batches", "accepted_batches", "r_bar", "avg_n",
    ]
    for row in rows:
        for field in numeric_fields:
            value = row.get(field)
            if value is not None:
                try:
                    row[field] = float(value)
                except (ValueError, TypeError):
                    row[field] = None

        stddev = row.get("stddev_overall") or 0
        mean_v = row.get("mean_value")
        nominal = row.get("nominal_target")
        r_bar = row.get("r_bar")
        avg_n = row.get("avg_n")

        usl = row.get("usl_spec")
        lsl = row.get("lsl_spec")
        if usl is None or lsl is None:
            tol_val = row.get("tolerance_half_width")
            if nominal is not None and tol_val is not None and tol_val > 0:
                usl = nominal + tol_val
                lsl = nominal - tol_val

        spec_type = infer_spec_type(usl, lsl)
        row["spec_type"] = spec_type
        row["usl"] = round(usl, 6) if usl is not None else None
        row["lsl"] = round(lsl, 6) if lsl is not None else None

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

        sigma_within = cp = cpk = None
        ref_n = int(round(avg_n)) if avg_n is not None else None
        d2 = D2_TABLE.get(ref_n)
        if d2 and r_bar is not None and r_bar > 0 and mean_v is not None:
            sigma_within = round(r_bar / d2, 6)
            if usl is not None and lsl is not None:
                cp = round((usl - lsl) / (6 * sigma_within), 3)
                cpk = round(min((usl - mean_v) / (3 * sigma_within), (mean_v - lsl) / (3 * sigma_within)), 3)
            elif usl is not None:
                cpk = round((usl - mean_v) / (3 * sigma_within), 3)
            elif lsl is not None:
                cpk = round((mean_v - lsl) / (3 * sigma_within), 3)

        row["cp"] = cp
        row["cpk"] = cpk
        row["sigma_within"] = sigma_within
        row["pp"] = pp
        row["ppk"] = ppk

        if ppk is not None:
            z_score = round(ppk * 3, 3)
            dpmo = round(normal_cdf(-(z_score - 1.5)) * 1_000_000)
        else:
            z_score, dpmo = None, None
        row["z_score"] = z_score
        row["dpmo"] = dpmo
        row["dpmo_convention"] = "motorola_1.5sigma_shift"

        nom_count = int(row.get("distinct_nominal_count") or 0)
        tol_count = int(row.get("distinct_tolerance_count") or 0)
        row["has_mixed_spec"] = nom_count > 1 or tol_count > 1
        row["spec_warning"] = (
            "Capability computed from mixed specification values in selected range."
            if row["has_mixed_spec"] else None
        )

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

    rows.sort(key=lambda row: (row.get("ppk") is None, row.get("ppk") or 0))
    return rows


async def fetch_compare_scorecard(
    token: str,
    material_ids: list[str],
    plant_id: Optional[str],
    date_from: Optional[str],
    date_to: Optional[str],
) -> dict:
    deduped_material_ids = list(dict.fromkeys(material_ids))
    name_params = [sql_param(f"m{i}", mid) for i, mid in enumerate(deduped_material_ids)]
    in_clause = ", ".join(f":m{i}" for i in range(len(deduped_material_ids)))

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

    scorecard_sets, name_rows = await asyncio.gather(
        asyncio.gather(*[
            fetch_scorecard(token, mat_id, plant_id, date_from, date_to)
            for mat_id in deduped_material_ids
        ]),
        run_sql_async(token, names_query, name_params),
    )

    material_names = {
        str(row["material_id"]): str(row.get("material_name") or row["material_id"])
        for row in name_rows
    }

    results = []
    all_mic_sets: list[set[str]] = []
    for mat_id, scorecard in zip(deduped_material_ids, scorecard_sets):
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

    common_mic_ids = all_mic_sets[0].intersection(*all_mic_sets[1:]) if all_mic_sets else set()

    common_mics = []
    if results:
        for row in results[0]["scorecard"]:
            if str(row["mic_id"]) in common_mic_ids:
                common_mics.append({"mic_id": row["mic_id"], "mic_name": row["mic_name"]})

    return {"materials": results, "common_mics": common_mics}


async def save_msa_session(
    token: str,
    material_id: str,
    mic_id: str,
    n_operators: int,
    n_parts: int,
    n_replicates: int,
    grr_pct: float,
    repeatability: float,
    reproducibility: float,
    ndc: int,
    results_json: str,
) -> dict:
    session_id = str(uuid.uuid4())
    params = [
        sql_param("session_id", session_id),
        sql_param("material_id", material_id),
        sql_param("mic_id", mic_id),
        sql_param("n_operators", n_operators),
        sql_param("n_parts", n_parts),
        sql_param("n_replicates", n_replicates),
        sql_param("grr_pct", grr_pct),
        sql_param("repeatability", repeatability),
        sql_param("reproducibility", reproducibility),
        sql_param("ndc", ndc),
        sql_param("results_json", results_json),
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
    await run_sql_async(token, query, params)
    return {"saved": True, "session_id": session_id}


async def fetch_correlation(
    token: str,
    material_id: str,
    plant_id: Optional[str],
    date_from: Optional[str],
    date_to: Optional[str],
    min_batches: int,
) -> dict:
    params = [
        sql_param("material_id", material_id),
        sql_param("min_batches", min_batches),
    ]
    date_clauses: list[str] = []
    if date_from:
        date_clauses.append("mb.POSTING_DATE >= :date_from")
        params.append(sql_param("date_from", date_from))
    if date_to:
        date_clauses.append("mb.POSTING_DATE <= :date_to")
        params.append(sql_param("date_to", date_to))
    date_filter = ("AND " + " AND ".join(date_clauses)) if date_clauses else ""
    corr_plant_filter = ""
    if plant_id:
        corr_plant_filter = "AND (bd.plant_id = :plant_id OR bd.plant_id IS NULL)"
        params.append(sql_param("plant_id", plant_id))

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
    rows = await run_sql_async(token, query, params)

    mic_map: dict[str, str] = {}
    for row in rows:
        row["pearson_r"] = float(row.get("pearson_r") or 0)
        row["shared_batches"] = int(float(row.get("shared_batches") or 0))
        mic_map[str(row["mic_a"])] = str(row.get("mic_name_a", row["mic_a"]))
        mic_map[str(row["mic_b"])] = str(row.get("mic_name_b", row["mic_b"]))

    mics = [{"mic_id": key, "mic_name": value} for key, value in sorted(mic_map.items(), key=lambda item: item[1])]
    return {"pairs": rows, "mics": mics, "pair_count": len(rows)}


async def fetch_correlation_scatter(
    token: str,
    material_id: str,
    mic_a_id: str,
    mic_b_id: str,
    plant_id: Optional[str],
    date_from: Optional[str],
    date_to: Optional[str],
) -> dict:
    params = [
        sql_param("material_id", material_id),
        sql_param("mic_a_id", mic_a_id),
        sql_param("mic_b_id", mic_b_id),
    ]
    date_clauses: list[str] = []
    if date_from:
        date_clauses.append("mb.POSTING_DATE >= :date_from")
        params.append(sql_param("date_from", date_from))
    if date_to:
        date_clauses.append("mb.POSTING_DATE <= :date_to")
        params.append(sql_param("date_to", date_to))
    date_filter = ("AND " + " AND ".join(date_clauses)) if date_clauses else ""
    plant_filter = ""
    if plant_id:
        plant_filter = "AND (bd.plant_id = :plant_id OR bd.plant_id IS NULL)"
        params.append(sql_param("plant_id", plant_id))

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
    rows = await run_sql_async(token, query, params)

    mic_a_name = rows[0].get("mic_a_name", mic_a_id) if rows else mic_a_id
    mic_b_name = rows[0].get("mic_b_name", mic_b_id) if rows else mic_b_id

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
                "batch_id": str(row.get("batch_id", "")),
                "batch_date": str(row.get("batch_date") or ""),
                "x": round(x, 6),
                "y": round(y, 6),
            })

    n = len(points)
    pearson_r = None
    if n >= 3:
        xs = [point["x"] for point in points]
        ys = [point["y"] for point in points]
        mx = sum(xs) / n
        my = sum(ys) / n
        numerator = sum((xi - mx) * (yi - my) for xi, yi in zip(xs, ys))
        den_x = math.sqrt(sum((xi - mx) ** 2 for xi in xs))
        den_y = math.sqrt(sum((yi - my) ** 2 for yi in ys))
        if den_x > 0 and den_y > 0:
            pearson_r = round(numerator / (den_x * den_y), 4)

    return {
        "points": points,
        "n": n,
        "pearson_r": pearson_r,
        "mic_a_name": mic_a_name,
        "mic_b_name": mic_b_name,
    }

