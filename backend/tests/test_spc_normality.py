import pytest

from backend.routers.spc import _compute_normality_result


def test_normality_returns_warning_for_small_samples():
    result = _compute_normality_result([1.0, 2.0])
    assert result["method"] == "shapiro_wilk"
    assert result["p_value"] is None
    assert result["is_normal"] is None
    assert "at least 3 quantitative points" in result["warning"].lower()


def test_normality_flags_non_normal_distribution():
    bimodal = ([0.0] * 25) + ([10.0] * 25)
    result = _compute_normality_result(bimodal)
    assert result["p_value"] is not None
    assert result["is_normal"] is False
    assert result["alpha"] == pytest.approx(0.05)
