from __future__ import annotations

import math
from typing import Any

import numpy as np
import pandas as pd
from scipy import stats


def _round_float(value: Any, digits: int = 6) -> float | None:
    if value is None:
        return None
    try:
        f = float(value)
        if math.isnan(f) or math.isinf(f):
            return None
        return round(f, digits)
    except (TypeError, ValueError):
        return None


def _safe_ratio(numerator: float, denominator: float) -> float:
    if denominator == 0:
        return 0.0
    return numerator / denominator


def compute_hotelling_t2(
    data_rows: list[dict[str, Any]],
    selected_mic_ids: list[str],
    alpha: float = 0.0027,
) -> dict[str, Any]:
    if len(selected_mic_ids) < 2:
        raise ValueError("At least 2 characteristics are required for multivariate analysis")

    frame = pd.DataFrame(data_rows)
    if frame.empty:
        raise ValueError("No observations found for the selected multivariate scope")

    required_columns = {"batch_id", "batch_date", "mic_id", "mic_name", "avg_result"}
    missing = required_columns.difference(frame.columns)
    if missing:
        raise ValueError(f"Missing required multivariate columns: {', '.join(sorted(missing))}")

    filtered = frame[frame["mic_id"].isin(selected_mic_ids)].copy()
    if filtered.empty:
        raise ValueError("No observations found for the selected characteristics")

    filtered["avg_result"] = pd.to_numeric(filtered["avg_result"], errors="coerce")
    filtered = filtered.dropna(subset=["avg_result", "batch_id", "mic_id"])
    if filtered.empty:
        raise ValueError("Selected characteristics do not have numeric observations")

    mic_meta = (
        filtered[["mic_id", "mic_name"]]
        .drop_duplicates()
        .assign(mic_name=lambda df: df["mic_name"].fillna(df["mic_id"]))
        .sort_values(["mic_name", "mic_id"])
    )
    mic_name_map = {
        str(row["mic_id"]): str(row["mic_name"])
        for row in mic_meta.to_dict(orient="records")
    }

    pivot = (
        filtered.pivot_table(
            index=["batch_id", "batch_date"],
            columns="mic_id",
            values="avg_result",
            aggfunc="mean",
        )
        .sort_index()
    )

    ordered_mic_ids = [mic_id for mic_id in selected_mic_ids if mic_id in pivot.columns]
    if len(ordered_mic_ids) < 2:
        raise ValueError("At least 2 selected characteristics must contain observations in the chosen window")

    pivot = pivot[ordered_mic_ids]
    complete = pivot.dropna(how="any")
    incomplete_batches = int(len(pivot.index) - len(complete.index))

    if complete.empty:
        raise ValueError("No shared batches contain complete observations for the selected characteristics")

    X = complete.to_numpy(dtype=float)
    n, p = X.shape
    if n <= p:
        raise ValueError("Insufficient shared batches to estimate multivariate covariance")

    mean_vec = np.mean(X, axis=0)
    cov_matrix = np.cov(X, rowvar=False, bias=False)
    inv_cov = np.linalg.pinv(cov_matrix)

    centered = X - mean_vec
    t2_values = np.einsum("ij,jk,ik->i", centered, inv_cov, centered)
    ucl = ((n * p) / (n - p)) * stats.f.ppf(1 - alpha, p, n - p)
    contributions = centered * (centered @ inv_cov)
    corr = np.corrcoef(X, rowvar=False)

    selected_mics = [
        {"mic_id": mic_id, "mic_name": mic_name_map.get(mic_id, mic_id)}
        for mic_id in ordered_mic_ids
    ]

    pairs: list[dict[str, Any]] = []
    for i, mic_a in enumerate(ordered_mic_ids):
        for j in range(i + 1, len(ordered_mic_ids)):
            mic_b = ordered_mic_ids[j]
            pairs.append(
                {
                    "mic_a_id": mic_a,
                    "mic_b_id": mic_b,
                    "mic_a_name": mic_name_map.get(mic_a, mic_a),
                    "mic_b_name": mic_name_map.get(mic_b, mic_b),
                    "pearson_r": _round_float(corr[i, j], 4),
                    "shared_batches": int(n),
                }
            )

    points: list[dict[str, Any]] = []
    anomaly_summaries: list[dict[str, Any]] = []
    complete_records = complete.reset_index().to_dict(orient="records")

    for idx, (record, t2_value) in enumerate(zip(complete_records, t2_values)):
        point_contribs: list[dict[str, Any]] = []
        contrib_row = contributions[idx]
        abs_total = float(np.sum(np.abs(contrib_row)))

        for mic_index, mic_id in enumerate(ordered_mic_ids):
            contribution = float(contrib_row[mic_index])
            share_abs = _safe_ratio(abs(contribution), abs_total)
            point_contribs.append(
                {
                    "mic_id": mic_id,
                    "mic_name": mic_name_map.get(mic_id, mic_id),
                    "contribution": _round_float(contribution),
                    "share_abs": _round_float(share_abs, 4),
                    "value": _round_float(record.get(mic_id)),
                }
            )

        point_contribs.sort(key=lambda item: abs(float(item["contribution"] or 0.0)), reverse=True)
        is_anomaly = bool(t2_value > ucl)
        top_contributors = point_contribs[:3]
        point = {
            "index": idx,
            "batch_id": str(record.get("batch_id") or ""),
            "batch_date": str(record.get("batch_date") or ""),
            "t2": _round_float(t2_value),
            "is_anomaly": is_anomaly,
            "top_contributors": top_contributors,
            "contributions": point_contribs,
            "values": {mic_id: _round_float(record.get(mic_id)) for mic_id in ordered_mic_ids},
        }
        points.append(point)

        if is_anomaly:
            summary_bits = []
            for contributor in top_contributors:
                name = contributor["mic_name"]
                direction = "high" if float(contributor["contribution"] or 0.0) >= 0 else "low"
                share_pct = round(float(contributor["share_abs"] or 0.0) * 100)
                summary_bits.append(f"{name} ({direction}, {share_pct}%)")

            anomaly_summaries.append(
                {
                    "index": idx,
                    "batch_id": point["batch_id"],
                    "batch_date": point["batch_date"],
                    "t2": point["t2"],
                    "summary": ", ".join(summary_bits),
                    "top_contributors": top_contributors,
                }
            )

    anomaly_summaries.sort(key=lambda item: float(item["t2"] or 0.0), reverse=True)

    return {
        "variables": selected_mics,
        "ucl": _round_float(ucl),
        "alpha": alpha,
        "n_observations": int(n),
        "n_variables": int(p),
        "excluded_incomplete_batches": incomplete_batches,
        "points": points,
        "anomalies": anomaly_summaries[:10],
        "correlation": {
            "mics": selected_mics,
            "pairs": pairs,
            "pair_count": len(pairs),
        },
        "mean_vector": [
            {
                "mic_id": mic_id,
                "mic_name": mic_name_map.get(mic_id, mic_id),
                "mean": _round_float(mean_vec[idx]),
            }
            for idx, mic_id in enumerate(ordered_mic_ids)
        ],
    }
