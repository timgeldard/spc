import pytest
import math
from backend.dal.spc_shared import normal_cdf, cpk_ci, infer_spec_type, compute_normality_result

def test_normal_cdf():
    # z=0 -> 0.5
    assert normal_cdf(0) == pytest.approx(0.5)
    # z=1.96 -> ~0.975
    assert normal_cdf(1.96) == pytest.approx(0.975, rel=1e-3)
    # z=-1.96 -> ~0.025
    assert normal_cdf(-1.96) == pytest.approx(0.025, rel=1e-3)

def test_cpk_ci():
    # Small n -> None
    assert cpk_ci(1.0, 20) == (None, None)
    # n=100
    low, high = cpk_ci(1.0, 100)
    assert low is not None
    assert high > low

def test_infer_spec_type():
    assert infer_spec_type(10, 5, 7.5) == "bilateral_symmetric"
    assert infer_spec_type(10, 5, 8) == "bilateral_asymmetric"
    assert infer_spec_type(10, None) == "unilateral_upper"
    assert infer_spec_type(None, 5) == "unilateral_lower"
    assert infer_spec_type(None, None) == "unspecified"

def test_compute_normality_large_sample():
    # Dataset > 5000 points
    large_data = [1.0] * 6000
    res = compute_normality_result(large_data)
    assert res["method"] == "shapiro_wilk_sampled"
    assert "Dataset exceeded 5000 points" in res["warning"]

def test_infer_spec_type_bilateral_no_nominal():
    assert infer_spec_type(10, 5, None) == "bilateral_symmetric"

def test_compute_normality_invalid_p_value(monkeypatch):
    import scipy.stats
    # Mock shapiro to return NaN p-value
    monkeypatch.setattr(scipy.stats, "shapiro", lambda data: (1.0, float('nan')))
    res = compute_normality_result([1.0, 2.0, 3.0])
    assert "invalid p-value" in res["warning"]
