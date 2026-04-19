import pytest
import json
import os
from backend.dal.spc_shared import compute_normality_result

def load_fixture(name):
    path = os.path.join(os.path.dirname(__file__), "fixtures", name)
    with open(path, "r") as f:
        return json.load(f)

def test_normality_with_bimodal_data():
    """
    Reference: STATISTICAL_METHODS.md Section 7.1 Normality Trigger.
    Shapiro-Wilk should flag bimodal data as non-normal (p < 0.05).
    """
    fixture = load_fixture("non_normal_golden.json")
    result = compute_normality_result(fixture["data"])
    assert result["is_normal"] is False
    assert result["p_value"] < 0.05

def test_normality_returns_warning_for_small_samples():
    """
    Reference: STATISTICAL_METHODS.md Section 7.1.
    Shapiro-Wilk requires at least 3 points.
    """
    result = compute_normality_result([1.0, 2.0])
    assert result["method"] == "shapiro_wilk"
    assert result["p_value"] is None
    assert result["is_normal"] is None
    assert "at least 3 quantitative points" in result["warning"].lower()

def test_normality_flags_non_normal_distribution():
    # Synthetic non-normal
    bimodal = ([0.0] * 25) + ([10.0] * 25)
    result = compute_normality_result(bimodal)
    assert result["p_value"] is not None
    assert result["is_normal"] is False
    assert result["alpha"] == pytest.approx(0.05)
