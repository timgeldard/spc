import pytest
import math
import json
import os
import numpy as np
from backend.utils.msa import compute_grr, compute_grr_anova, _round, _mean, _is_number
from backend.utils.multivariate import compute_hotelling_t2, _round_float, _safe_ratio

def load_fixture(name):
    path = os.path.join(os.path.dirname(__file__), "fixtures", name)
    with open(path, "r") as f:
        return json.load(f)

def test_msa_utils():
    """
    Reference: STATISTICAL_METHODS.md Section 4. Measurement Systems Analysis.
    Verifies Average & Range method components.
    """
    assert _is_number(1.0) is True
    assert _is_number(float('nan')) is False
    
    # Simple GRR case
    data = [
        [[1, 1.1], [2, 2.1]], # Op 1: Part 1, Part 2
        [[1.1, 1.2], [2.1, 2.2]] # Op 2: Part 1, Part 2
    ]
    res = compute_grr(data, 1.0)
    assert res["method"] == "average_range"
    assert res["repeatability"] > 0
    assert res["reproducibility"] > 0
    # Use larger tolerance for rounded results
    assert res["grr"] == pytest.approx(math.sqrt(res["repeatability"]**2 + res["reproducibility"]**2), rel=1e-3)

def test_multivariate_utils():
    """
    Reference: STATISTICAL_METHODS.md Section 5. Multivariate SPC (Hotelling's T2).
    Verifies T2 calculation and contribution decomposition.
    """
    # Two MICs, 4 batches (n > p)
    data = [
        {"batch_id": "b1", "batch_date": "2024-01-01", "mic_id": "mic1", "mic_name": "m1", "avg_result": 10.0},
        {"batch_id": "b1", "batch_date": "2024-01-01", "mic_id": "mic2", "mic_name": "m2", "avg_result": 100.0},
        {"batch_id": "b2", "batch_date": "2024-01-02", "mic_id": "mic1", "mic_name": "m1", "avg_result": 10.1},
        {"batch_id": "b2", "batch_date": "2024-01-02", "mic_id": "mic2", "mic_name": "m2", "avg_result": 101.0},
        {"batch_id": "b3", "batch_date": "2024-01-03", "mic_id": "mic1", "mic_name": "m1", "avg_result": 10.2},
        {"batch_id": "b3", "batch_date": "2024-01-03", "mic_id": "mic2", "mic_name": "m2", "avg_result": 102.0},
        {"batch_id": "b4", "batch_date": "2024-01-04", "mic_id": "mic1", "mic_name": "m1", "avg_result": 10.3},
        {"batch_id": "b4", "batch_date": "2024-01-04", "mic_id": "mic2", "mic_name": "m2", "avg_result": 103.0},
    ]
    res = compute_hotelling_t2(data, ["mic1", "mic2"])
    assert "points" in res
    assert len(res["points"]) == 4
    # Each result should have a t2 score and top contributors
    for item in res["points"]:
        assert "t2" in item
        assert "top_contributors" in item
        # Contributions should be present for each MIC
        assert len(item["top_contributors"]) == 2

def test_msa_anova_significant_interaction():
    """
    Reference: STATISTICAL_METHODS.md Section 4. Methods.
    ANOVA decomposes interaction effects between Operator and Part.
    """
    data = [
        [[10, 10.1], [2, 2.1]], # Op 1
        [[2, 2.1], [10, 10.1]]  # Op 2
    ]
    res = compute_grr_anova(data, 1.0)
    assert res["interaction"] > 0
    assert "statistically significant" in res["modelWarning"]
    assert res["interactionPValue"] < 0.05

def test_multivariate_errors():
    # Singular matrix or insufficient data
    data = [
        {"batch_id": "b1", "batch_date": "2024-01-01", "mic_id": "mic1", "mic_name": "m1", "avg_result": 10},
        {"batch_id": "b1", "batch_date": "2024-01-01", "mic_id": "mic2", "mic_name": "m2", "avg_result": 20},
    ]
    with pytest.raises(ValueError, match="Insufficient shared batches"):
        compute_hotelling_t2(data, ["mic1", "mic2"])

def test_round_float_edge_cases():
    assert _round_float(None) is None
    assert _round_float("invalid") is None
    assert _round_float(float('nan')) is None
    assert _round_float(float('inf')) is None
    assert _round_float(10.5555555, 2) == 10.56

def test_multivariate_missing_columns():
    data = [{"batch_id": "B1"}] # Missing others
    with pytest.raises(ValueError, match="Missing required multivariate columns"):
        compute_hotelling_t2(data, ["M1", "M2"])

def test_multivariate_empty_after_filter():
    data = [{"batch_id": "B1", "batch_date": "D1", "mic_id": "M3", "mic_name": "N3", "avg_result": 10}]
    with pytest.raises(ValueError, match="No observations found for the selected characteristics"):
        compute_hotelling_t2(data, ["M1", "M2"])

def test_multivariate_no_shared_batches():
    data = [
        {"batch_id": "B1", "batch_date": "D1", "mic_id": "M1", "mic_name": "N1", "avg_result": 10},
        {"batch_id": "B2", "batch_date": "D2", "mic_id": "M2", "mic_name": "N2", "avg_result": 20},
    ]
    with pytest.raises(ValueError, match="No shared batches contain complete observations"):
        compute_hotelling_t2(data, ["M1", "M2"])
