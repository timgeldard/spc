import math
from typing import Optional


D2_TABLE = {
    2: 1.128,
    3: 1.693,
    4: 2.059,
    5: 2.326,
    6: 2.534,
    7: 2.704,
    8: 2.847,
    9: 2.970,
    10: 3.078,
    11: 3.173,
    12: 3.258,
    13: 3.336,
    14: 3.407,
    15: 3.472,
}


def normal_cdf(z: float) -> float:
    """Abramowitz & Stegun 26.2.17 approximation, max error 7.5e-8."""
    t = 1 / (1 + 0.2316419 * abs(z))
    poly = t * (0.319381530 + t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))))
    base = 1 - (1 / math.sqrt(2 * math.pi)) * math.exp(-0.5 * z * z) * poly
    return base if z >= 0 else 1 - base


def cpk_ci(cpk: float, n: int) -> tuple[Optional[float], Optional[float]]:
    """95% confidence interval on Cpk (Montgomery 2009). Valid for n >= 25."""
    if n < 25:
        return None, None
    se = math.sqrt(1 / (9 * n) + cpk ** 2 / (2 * (n - 1)))
    lower = round(cpk - 1.96 * se, 3)
    upper = round(cpk + 1.96 * se, 3)
    return lower, upper


def infer_spec_type(
    usl: Optional[float],
    lsl: Optional[float],
    nominal: Optional[float] = None,
) -> str:
    """Infer spec type from resolved USL/LSL values."""
    if usl is not None and lsl is not None:
        if nominal is not None:
            upper_span = usl - nominal
            lower_span = nominal - lsl
            if math.isclose(abs(upper_span), abs(lower_span), rel_tol=1e-6, abs_tol=1e-6):
                return "bilateral_symmetric"
            return "bilateral_asymmetric"
        return "bilateral_symmetric"
    if usl is not None:
        return "unilateral_upper"
    if lsl is not None:
        return "unilateral_lower"
    return "unspecified"


def compute_normality_result(values: list[Optional[float]]) -> dict:
    """Return normality metadata for variable capability analysis."""
    alpha = 0.05
    valid_values = [
        float(v) for v in values
        if v is not None and isinstance(v, (int, float)) and math.isfinite(v)
    ]
    result = {
        "method": "shapiro_wilk",
        "p_value": None,
        "alpha": alpha,
        "is_normal": None,
        "warning": None,
    }

    if len(valid_values) < 3:
        result["warning"] = "Normality requires at least 3 quantitative points."
        return result

    try:
        from scipy.stats import shapiro
    except ImportError:
        result["warning"] = "scipy is not installed; Shapiro-Wilk normality testing skipped."
        return result

    sample = valid_values
    if len(valid_values) > 5000:
        last_index = len(valid_values) - 1
        sample = [valid_values[round(i * last_index / 4999)] for i in range(5000)]
        result["method"] = "shapiro_wilk_sampled"
        result["warning"] = (
            "Dataset exceeded 5000 points; normality was evaluated on an evenly "
            "sampled 5000-point subset."
        )

    try:
        _, p_value = shapiro(sample)
    except Exception as exc:  # pragma: no cover
        result["warning"] = f"Normality test failed: {str(exc)[:160]}"
        return result

    if p_value is None or math.isnan(float(p_value)):
        result["warning"] = "Shapiro-Wilk returned an invalid p-value."
        return result

    result["p_value"] = round(float(p_value), 6)
    result["is_normal"] = bool(float(p_value) >= alpha)
    return result
