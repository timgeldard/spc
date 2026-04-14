import asyncio
import math
import uuid
from typing import Optional, TypedDict

from backend.dal.spc_shared import infer_spec_type
from backend.utils.multivariate import compute_hotelling_t2
from backend.utils.db import run_sql_async, sql_param, tbl
from backend.utils.spc_thresholds import CPK_CAPABLE, CPK_HIGHLY_CAPABLE, CPK_MARGINAL

_MULTIVARIATE_MAX_SOURCE_ROWS = 50000


class _HealthRow(TypedDict, total=False):
    material_id: str
    material_name: str
    plant_name: str | None
    total_batches: int
    rejected_batches: int
    mic_count: int
    status: str
    estimated_cpk: float | None
    mean_value: float | None
    stddev_value: float | None


class _ScorecardRow(TypedDict, total=False):
    mic_id: str
    mic_name: str
    batch_count: int
    sample_count: int
    mean_value: float | None
    stddev_overall: float | None
    capability_status: str
    ppk: float | None
    ooc_rate: float | None


def _coerce_float(value: object) -> Optional[float]:
    if value is None:
        return None
    try:
        f = float(value)
        if math.isnan(f) or math.isinf(f):
            return None
        return f
    except (TypeError, ValueError):
        return None


def _coerce_int(value: object) -> int:
    if value is None:
        return 0
    try:
        return int(float(value))
    except (TypeError, ValueError):
        return 0


def _scorecard_status(ppk: Optional[float], *, mean_out_of_spec: bool) -> str:
    if ppk is None:
        return "grey"
    if mean_out_of_spec:
        return "out_of_spec_mean"
    if ppk >= CPK_HIGHLY_CAPABLE:
        return "excellent"
    if ppk >= CPK_CAPABLE:
        return "good"
    if ppk >= CPK_MARGINAL:
        return "marginal"
    return "poor"


async def fetch_process_flow(
    token: str,
    material_id: str,
    date_from: Optional[str],
    date_to: Optional[str],
    upstream_depth: int = 4,
    downstream_depth: int = 3,
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
              AND u.depth < :upstream_depth
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
              AND d.depth < :downstream_depth
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
    edge_rows = await run_sql_async(
        token,
        edges_query,
        [
            sql_param("material_id", material_id),
            sql_param("upstream_depth", upstream_depth),
            sql_param("downstream_depth", downstream_depth),
        ],
    )

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
        date_clauses.append("batch_date >= :date_from")
        date_params.append(sql_param("date_from", date_from))
    if date_to:
        date_clauses.append("batch_date <= :date_to")
        date_params.append(sql_param("date_to", date_to))
    date_filter = ("AND " + " AND ".join(date_clauses)) if date_clauses else ""

    health_query = f"""
        SELECT
            material_id                                                 AS material_id,
            MAX(material_name)                                          AS material_name,
            CASE
                WHEN COUNT(DISTINCT plant_name_resolved) = 1
                THEN MIN(plant_name_resolved)
                ELSE NULL
            END                                                         AS plant_name,
            COUNT(DISTINCT batch_id)                                    AS total_batches,
            COUNT(DISTINCT CASE
                WHEN has_rejection = 1 THEN batch_id
            END)                                                        AS rejected_batches,
            COUNT(DISTINCT mic_id)                                      AS mic_count
        FROM {tbl('spc_process_flow_source_v')}
        WHERE material_id IN ({in_clause})
          {date_filter}
        GROUP BY material_id
    """
    health_rows = await run_sql_async(token, health_query, mat_params + date_params)

    health_by_mat: dict[str, _HealthRow] = {}
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

    return {
        "nodes": nodes,
        "edges": edges,
        "upstream_depth": upstream_depth,
        "downstream_depth": downstream_depth,
    }


async def fetch_scorecard(
    token: str,
    material_id: str,
    plant_id: Optional[str],
    date_from: Optional[str],
    date_to: Optional[str],
) -> list[dict]:
    params = [sql_param("material_id", material_id)]
    filters = ["material_id = :material_id"]
    if date_from:
        filters.append("batch_date >= :date_from")
        params.append(sql_param("date_from", date_from))
    if date_to:
        filters.append("batch_date <= :date_to")
        params.append(sql_param("date_to", date_to))
    if plant_id:
        filters.append("plant_id = :plant_id")
        params.append(sql_param("plant_id", plant_id))
    where_sql = "WHERE " + " AND ".join(filters)

    query = f"""
        SELECT
            mic_id,
            mic_name,
            MEASURE(batch_count)                                      AS batch_count,
            MEASURE(total_samples)                                    AS sample_count,
            MEASURE(mean_value)                                       AS mean_value,
            MEASURE(stddev_overall)                                   AS stddev_overall,
            MEASURE(min_value)                                        AS min_value,
            MEASURE(max_value)                                        AS max_value,
            MEASURE(nominal_target)                                   AS nominal_target,
            MEASURE(spec_lower)                                       AS lsl,
            MEASURE(spec_upper)                                       AS usl,
            MEASURE(rejected_batches)                                 AS ooc_batches,
            MEASURE(accepted_batches)                                 AS accepted_batches,
            MEASURE(ooc_rate)                                         AS ooc_rate,
            MEASURE(sigma_within)                                     AS sigma_within,
            MEASURE(pp)                                               AS pp,
            MEASURE(ppk)                                              AS ppk,
            MEASURE(cp)                                               AS cp,
            MEASURE(cpk)                                              AS cpk,
            MEASURE(z_score)                                          AS z_score,
            MEASURE(dpmo)                                             AS dpmo,
            MEASURE(distinct_spec_count)                              AS distinct_spec_count,
            MEASURE(performance_capability_method)                    AS performance_capability_method,
            MEASURE(mean_out_of_spec_flag)                            AS mean_out_of_spec_flag
        FROM {tbl('spc_quality_metrics')}
        {where_sql}
        GROUP BY mic_id, mic_name
        HAVING MEASURE(batch_count) >= 3
        ORDER BY mic_name
    """
    rows = await run_sql_async(token, query, params)

    for row in rows:
        typed_row: _ScorecardRow = row
        for int_field in ("batch_count", "sample_count", "ooc_batches", "accepted_batches", "distinct_spec_count"):
            typed_row[int_field] = _coerce_int(typed_row.get(int_field))  # type: ignore[literal-required]
        for float_field in (
            "mean_value",
            "stddev_overall",
            "min_value",
            "max_value",
            "nominal_target",
            "lsl",
            "usl",
            "ooc_rate",
            "sigma_within",
            "pp",
            "ppk",
            "cp",
            "cpk",
            "z_score",
            "dpmo",
        ):
            typed_row[float_field] = _coerce_float(typed_row.get(float_field))  # type: ignore[literal-required]

        mean_v = typed_row.get("mean_value")
        nominal = typed_row.get("nominal_target")
        usl = typed_row.get("usl")
        lsl = typed_row.get("lsl")

        spec_type = infer_spec_type(usl, lsl, nominal)
        typed_row["spec_type"] = spec_type
        typed_row["usl"] = round(usl, 6) if usl is not None else None
        typed_row["lsl"] = round(lsl, 6) if lsl is not None else None
        for rounded_field in ("pp", "ppk", "cp", "cpk", "z_score"):
            value = typed_row.get(rounded_field)
            typed_row[rounded_field] = round(value, 3) if value is not None else None
        sigma_within = typed_row.get("sigma_within")
        typed_row["sigma_within"] = round(sigma_within, 6) if sigma_within is not None else None
        dpmo = typed_row.get("dpmo")
        typed_row["dpmo"] = int(round(dpmo)) if dpmo is not None else None
        typed_row["dpmo_convention"] = "motorola_1.5sigma_shift"

        typed_row["has_mixed_spec"] = typed_row["distinct_spec_count"] > 1
        typed_row["spec_warning"] = (
            "Capability computed from mixed specification values in selected range."
            if typed_row["has_mixed_spec"] else None
        )

        mean_out_of_spec = _coerce_int(typed_row.get("mean_out_of_spec_flag")) == 1
        typed_row["capability_status"] = _scorecard_status(typed_row.get("ppk"), mean_out_of_spec=mean_out_of_spec)
        typed_row["ooc_rate"] = round(typed_row["ooc_rate"], 4) if typed_row["ooc_rate"] is not None else None

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
    filters = ["material_id = :material_id"]
    if date_from:
        filters.append("batch_date >= :date_from")
        params.append(sql_param("date_from", date_from))
    if date_to:
        filters.append("batch_date <= :date_to")
        params.append(sql_param("date_to", date_to))
    if plant_id:
        filters.append("plant_id = :plant_id")
        params.append(sql_param("plant_id", plant_id))
    where_sql = "WHERE " + " AND ".join(filters)

    query = f"""
        WITH filtered_avgs AS (
            SELECT
                mic_selection_key,
                mic_display_name,
                batch_id,
                avg_result
            FROM {tbl('spc_correlation_source_v')}
            {where_sql}
        ),
        mic_batch_counts AS (
            SELECT mic_selection_key, COUNT(DISTINCT batch_id) AS n
            FROM filtered_avgs
            GROUP BY mic_selection_key
        ),
        qualified_mics AS (
            SELECT mic_selection_key FROM mic_batch_counts WHERE n >= :min_batches
        ),
        corr_pairs AS (
            SELECT
                a.mic_selection_key AS mic_a,
                a.mic_display_name  AS mic_name_a,
                b.mic_selection_key AS mic_b,
                b.mic_display_name  AS mic_name_b,
                CORR(a.avg_result, b.avg_result) AS pearson_r,
                COUNT(*)    AS shared_batches
            FROM filtered_avgs a
            JOIN filtered_avgs b
                ON a.batch_id = b.batch_id
                AND a.mic_selection_key < b.mic_selection_key
            WHERE a.mic_selection_key IN (SELECT mic_selection_key FROM qualified_mics)
              AND b.mic_selection_key IN (SELECT mic_selection_key FROM qualified_mics)
            GROUP BY a.mic_selection_key, a.mic_display_name, b.mic_selection_key, b.mic_display_name
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
    filters = ["material_id = :material_id"]
    if date_from:
        filters.append("batch_date >= :date_from")
        params.append(sql_param("date_from", date_from))
    if date_to:
        filters.append("batch_date <= :date_to")
        params.append(sql_param("date_to", date_to))
    if plant_id:
        filters.append("plant_id = :plant_id")
        params.append(sql_param("plant_id", plant_id))
    where_sql = "WHERE " + " AND ".join(filters)

    query = f"""
        WITH filtered_avgs AS (
            SELECT batch_id, batch_date, mic_selection_key, mic_display_name, avg_result
            FROM {tbl('spc_correlation_source_v')}
            {where_sql}
        ),
        mic_a_avgs AS (
            SELECT batch_id, ANY_VALUE(mic_display_name) AS mic_name, AVG(avg_result) AS avg_val
            FROM filtered_avgs
            WHERE mic_selection_key = :mic_a_id
            GROUP BY batch_id
        ),
        mic_b_avgs AS (
            SELECT batch_id, ANY_VALUE(mic_display_name) AS mic_name, AVG(avg_result) AS avg_val
            FROM filtered_avgs
            WHERE mic_selection_key = :mic_b_id
            GROUP BY batch_id
        )
        SELECT
            a.batch_id                            AS batch_id,
            CAST(MIN(f.batch_date) AS STRING)     AS batch_date,
            a.avg_val                             AS x,
            b.avg_val                             AS y,
            a.mic_name                            AS mic_a_name,
            b.mic_name                            AS mic_b_name
        FROM mic_a_avgs a
        JOIN mic_b_avgs b ON a.batch_id = b.batch_id
        LEFT JOIN filtered_avgs f ON f.batch_id = a.batch_id
        GROUP BY a.batch_id, a.avg_val, b.avg_val, a.mic_name, b.mic_name
        ORDER BY MIN(f.batch_date), a.batch_id
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
    if n >= 2:
        from scipy.stats import pearsonr

        xs = [point["x"] for point in points]
        ys = [point["y"] for point in points]
        try:
            corr, _p_value = pearsonr(xs, ys)
        except ValueError:
            corr = math.nan
        if not math.isnan(corr):
            pearson_r = round(float(corr), 4)

    return {
        "points": points,
        "n": n,
        "pearson_r": pearson_r,
        "mic_a_name": mic_a_name,
        "mic_b_name": mic_b_name,
    }


async def fetch_multivariate(
    token: str,
    material_id: str,
    mic_ids: list[str],
    plant_id: Optional[str],
    date_from: Optional[str],
    date_to: Optional[str],
) -> dict:
    params = [sql_param("material_id", material_id)]
    filters = ["material_id = :material_id"]

    mic_params: list[dict] = []
    mic_placeholders: list[str] = []
    for index, mic_id in enumerate(mic_ids):
        param_name = f"mic_{index}"
        mic_params.append(sql_param(param_name, mic_id))
        mic_placeholders.append(f":{param_name}")
    filters.append(f"mic_selection_key IN ({', '.join(mic_placeholders)})")

    if date_from:
        filters.append("batch_date >= :date_from")
        params.append(sql_param("date_from", date_from))
    if date_to:
        filters.append("batch_date <= :date_to")
        params.append(sql_param("date_to", date_to))
    if plant_id:
        filters.append("plant_id = :plant_id")
        params.append(sql_param("plant_id", plant_id))
    where_sql = "WHERE " + " AND ".join(filters)

    query = f"""
        SELECT
            batch_id,
            CAST(batch_date AS STRING) AS batch_date,
            mic_selection_key AS mic_id,
            mic_display_name AS mic_name,
            avg_result
        FROM {tbl('spc_correlation_source_v')}
        {where_sql}
        ORDER BY batch_date, batch_id, mic_name
        LIMIT {_MULTIVARIATE_MAX_SOURCE_ROWS + 1}
    """
    rows = await run_sql_async(token, query, params + mic_params)
    if len(rows) > _MULTIVARIATE_MAX_SOURCE_ROWS:
        raise ValueError(
            "Selected multivariate scope is too large for interactive analysis. "
            "Narrow the date range, plant, or variable set and try again."
        )
    payload = compute_hotelling_t2(rows, mic_ids)
    payload["material_id"] = material_id
    payload["plant_id"] = plant_id
    payload["date_from"] = date_from
    payload["date_to"] = date_to
    return payload
