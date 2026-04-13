"""Backend Gauge R&R calculation reference.

Provides governed Average & Range and crossed ANOVA Gauge R&R calculations so
frontend MSA results can be checked against a backend implementation.
"""

from __future__ import annotations

import math
from typing import Any

try:
    from scipy.stats import f as f_dist
except Exception:  # pragma: no cover
    f_dist = None

MeasurementCube = list[list[list[float | None]]]

K1_TABLE: dict[int, float] = {2: 0.8862, 3: 0.5908, 4: 0.4857, 5: 0.4299}
K2_TABLE: dict[int, float] = {2: 0.7071, 3: 0.5231, 4: 0.4467, 5: 0.4030}
K3_TABLE: dict[int, float] = {
    2: 0.7071, 3: 0.5231, 4: 0.4467, 5: 0.4030,
    6: 0.3742, 7: 0.3534, 8: 0.3375, 9: 0.3249, 10: 0.3146,
}


def _is_number(value: float | None) -> bool:
    return value is not None and not math.isnan(value)


def _round(value: float, digits: int) -> float:
    factor = 10 ** digits
    return math.floor(value * factor + 0.5) / factor


def _mean(values: list[float]) -> float | None:
    if not values:
        return None
    return sum(values) / len(values)


def _finalize_grr(
    *,
    method: str,
    tolerance: float,
    repeatability_var: float,
    reproducibility_var: float,
    part_var: float,
    interaction_var: float = 0.0,
    extra: dict[str, Any] | None = None,
) -> dict[str, Any]:
    ev = math.sqrt(max(0.0, repeatability_var))
    av = math.sqrt(max(0.0, reproducibility_var))
    interaction = math.sqrt(max(0.0, interaction_var))
    reproducibility_total = math.sqrt(max(0.0, reproducibility_var + interaction_var))
    grr = math.sqrt(ev ** 2 + reproducibility_total ** 2)
    pv = math.sqrt(max(0.0, part_var))
    tv = math.sqrt(grr ** 2 + pv ** 2)

    grr_pct = _round((100 * grr) / tv, 1) if tv > 0 else None
    grr_pct_tol = _round((100 * (grr * 5.15)) / tolerance, 1) if tolerance > 0 else None
    ndc = math.floor(1.41 * (pv / grr)) if pv > 0 and grr > 0 else None

    result = {
        "method": method,
        "ev": _round(ev, 4),
        "av": _round(av, 4),
        "interaction": _round(interaction, 4),
        "grr": _round(grr, 4),
        "pv": _round(pv, 4),
        "tv": _round(tv, 4),
        "repeatability": _round(ev, 4),
        "reproducibility": _round(av, 4),
        "reproducibilityTotal": _round(reproducibility_total, 4),
        "interactionVariation": _round(interaction, 4),
        "grrPct": grr_pct,
        "grrPctTol": grr_pct_tol,
        "ndc": ndc,
    }
    if extra:
        result.update(extra)
    return result


def compute_grr(data: MeasurementCube, tolerance: float) -> dict[str, Any]:
    n_operators = len(data)
    n_parts = len(data[0]) if data else 0
    n_replicates = len(data[0][0]) if data and data[0] else 0

    if n_operators < 2 or n_parts < 2 or n_replicates < 2:
        return {"error": "Minimum: 2 operators, 2 parts, 2 replicates"}

    k1 = K1_TABLE.get(n_replicates)
    k2 = K2_TABLE.get(n_operators)
    k3 = K3_TABLE.get(n_parts)
    if not k1 or not k2 or not k3:
        return {"error": f"Unsupported dimensions: {n_operators} ops × {n_parts} parts × {n_replicates} reps"}

    operator_ranges = []
    for op_data in data:
        ranges = []
        for part_data in op_data:
            vals = [value for value in part_data if _is_number(value)]
            if vals:
                ranges.append(max(vals) - min(vals))
        operator_ranges.append(ranges)

    r_bars_by_op = [sum(ranges) / len(ranges) for ranges in operator_ranges if ranges]
    r_bar_bar = sum(r_bars_by_op) / len(r_bars_by_op)
    ev = r_bar_bar * k1

    op_means = []
    for op_data in data:
        vals = [value for part_data in op_data for value in part_data if _is_number(value)]
        op_means.append(sum(vals) / (len(vals) or 1))
    x_bar_diff = max(op_means) - min(op_means)

    av_raw = (x_bar_diff * k2) ** 2 - (ev ** 2) / (n_parts * n_replicates)
    av = math.sqrt(max(0.0, av_raw))
    grr = math.sqrt(ev ** 2 + av ** 2)

    all_part_means = []
    for pi in range(n_parts):
        vals = [value for op in data for value in (op[pi] if pi < len(op) else []) if _is_number(value)]
        all_part_means.append(sum(vals) / (len(vals) or 1))
    r_parts = max(all_part_means) - min(all_part_means)
    pv = r_parts * k3
    tv = math.sqrt(grr ** 2 + pv ** 2)

    warning = (
        "Negative variance detected: measurement system resolution may be insufficient."
        if av_raw < 0 else None
    )

    return {
        "method": "average_range",
        "ev": _round(ev, 4),
        "av": _round(av, 4),
        "grr": _round(grr, 4),
        "pv": _round(pv, 4),
        "tv": _round(tv, 4),
        "repeatability": _round(ev, 4),
        "reproducibility": _round(av, 4),
        "grrPct": _round((100 * grr) / tv, 1) if tv > 0 else None,
        "grrPctTol": _round((100 * (grr * 5.15)) / tolerance, 1) if tolerance > 0 else None,
        "ndc": math.floor(1.41 * (pv / grr)) if pv > 0 and grr > 0 else None,
        "rBarBar": _round(r_bar_bar, 4),
        "xBarDiff": _round(x_bar_diff, 4),
        "systemStabilityWarning": warning,
    }


def compute_grr_anova(data: MeasurementCube, tolerance: float) -> dict[str, Any]:
    n_operators = len(data)
    n_parts = len(data[0]) if data else 0
    n_replicates = len(data[0][0]) if data and data[0] else 0

    if n_operators < 2 or n_parts < 2 or n_replicates < 2:
        return {"error": "Minimum: 2 operators, 2 parts, 2 replicates"}

    triples: list[tuple[int, int, int, float]] = []
    for oi, op_data in enumerate(data):
      for pi, part_data in enumerate(op_data):
            for ri, raw_value in enumerate(part_data):
                if _is_number(raw_value):
                    triples.append((oi, pi, ri, float(raw_value)))

    values = [value for _, _, _, value in triples]
    grand_mean = _mean(values)
    if grand_mean is None:
        return {"error": "No numeric measurements found."}

    op_means = {
        oi: _mean([value for op_idx, _, _, value in triples if op_idx == oi]) or 0.0
        for oi in range(n_operators)
    }
    part_means = {
        pi: _mean([value for _, part_idx, _, value in triples if part_idx == pi]) or 0.0
        for pi in range(n_parts)
    }
    cell_means = {
        (oi, pi): _mean([value for op_idx, part_idx, _, value in triples if op_idx == oi and part_idx == pi]) or 0.0
        for oi in range(n_operators)
        for pi in range(n_parts)
    }

    ss_total = sum((value - grand_mean) ** 2 for value in values)
    ss_ops = n_parts * n_replicates * sum((op_means[oi] - grand_mean) ** 2 for oi in range(n_operators))
    ss_parts = n_operators * n_replicates * sum((part_means[pi] - grand_mean) ** 2 for pi in range(n_parts))
    ss_interaction = n_replicates * sum(
        (cell_means[(oi, pi)] - op_means[oi] - part_means[pi] + grand_mean) ** 2
        for oi in range(n_operators)
        for pi in range(n_parts)
    )
    ss_repeat = sum((value - cell_means[(oi, pi)]) ** 2 for oi, pi, _, value in triples)

    df_ops = n_operators - 1
    df_parts = n_parts - 1
    df_interaction = df_ops * df_parts
    df_repeat = n_operators * n_parts * (n_replicates - 1)

    if df_repeat <= 0:
        return {"error": "Insufficient replication to estimate repeatability."}

    ms_ops = ss_ops / df_ops if df_ops > 0 else 0.0
    ms_parts = ss_parts / df_parts if df_parts > 0 else 0.0
    ms_interaction = ss_interaction / df_interaction if df_interaction > 0 else 0.0
    ms_repeat = ss_repeat / df_repeat

    interaction_p_value = None
    if df_interaction > 0 and ms_repeat > 0 and f_dist is not None:
        interaction_p_value = float(f_dist.sf(ms_interaction / ms_repeat, df_interaction, df_repeat))

    interaction_significant = interaction_p_value is not None and interaction_p_value < 0.05

    repeatability_var = ms_repeat
    interaction_var = max((ms_interaction - ms_repeat) / max(1, n_replicates), 0.0) if df_interaction > 0 else 0.0
    if interaction_significant:
        reproducibility_var = max((ms_ops - ms_interaction) / max(1, n_parts * n_replicates), 0.0) if df_ops > 0 else 0.0
        part_var = max((ms_parts - ms_interaction) / max(1, n_operators * n_replicates), 0.0) if df_parts > 0 else 0.0
    else:
        pooled_error = (
            ((df_interaction * ms_interaction) + (df_repeat * ms_repeat)) / (df_interaction + df_repeat)
            if df_interaction > 0 else ms_repeat
        )
        repeatability_var = pooled_error
        interaction_var = 0.0
        reproducibility_var = max((ms_ops - pooled_error) / max(1, n_parts * n_replicates), 0.0) if df_ops > 0 else 0.0
        part_var = max((ms_parts - pooled_error) / max(1, n_operators * n_replicates), 0.0) if df_parts > 0 else 0.0

    model_warning = (
        "Operator-by-part interaction is statistically significant (p < 0.05); AV includes interaction."
        if interaction_significant
        else "Operator-by-part interaction is not significant; pooled error model applied."
    )

    return _finalize_grr(
        method="anova",
        tolerance=tolerance,
        repeatability_var=repeatability_var,
        reproducibility_var=reproducibility_var,
        part_var=part_var,
        interaction_var=interaction_var,
        extra={
            "interactionPValue": _round(interaction_p_value, 4) if interaction_p_value is not None else None,
            "modelWarning": model_warning,
            "grandMean": _round(grand_mean, 4),
            "msRepeat": _round(ms_repeat, 4),
            "msInteraction": _round(ms_interaction, 4) if df_interaction > 0 else None,
            "msOperators": _round(ms_ops, 4) if df_ops > 0 else None,
            "msParts": _round(ms_parts, 4) if df_parts > 0 else None,
        },
    )
