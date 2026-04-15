import pytest
import math
import numpy as np
from backend.utils.msa import compute_grr, compute_grr_anova, _round, _mean, _is_number
from backend.utils.multivariate import compute_hotelling_t2, _round_float, _safe_ratio

def test_msa_utils():
    assert _is_number(1.0) is True
    assert _is_number(float('nan')) is False
    assert _is_number(None) is False
    
    assert _round(1.23456, 2) == 1.23
    assert _round(1.235, 2) == 1.24
    
    assert _mean([1, 2, 3]) == 2.0
    assert _mean([]) is None

def test_msa_average_range_errors():
    # Less than 2 operators
    data = [[[1, 2], [3, 4]]] # 1 op, 2 parts, 2 reps
    res = compute_grr(data, 1.0)
    assert "error" in res
    assert "Minimum: 2 operators" in res["error"]
    
    # Unsupported dimensions (e.g. 6 replicates)
    data = [
        [[1, 2, 3, 4, 5, 6], [1, 2, 3, 4, 5, 6]],
        [[1, 2, 3, 4, 5, 6], [1, 2, 3, 4, 5, 6]]
    ]
    res = compute_grr(data, 1.0)
    assert "error" in res
    assert "Unsupported dimensions" in res["error"]

def test_msa_anova_errors():
    # No numeric measurements
    data = [[[None, None], [None, None]], [[None, None], [None, None]]]
    res = compute_grr_anova(data, 1.0)
    assert "error" in res
    assert "No numeric measurements found" in res["error"]
    
    # Insufficient replication (reps = 1)
    data = [[[1], [2]], [[3], [4]]]
    res = compute_grr_anova(data, 1.0)
    assert "error" in res
    assert "Minimum: 2 operators, 2 parts, 2 replicates" in res["error"]

def test_multivariate_utils():
    assert _round_float(None) is None
    assert _round_float("invalid") is None
    assert _round_float(float('nan')) is None
    assert _round_float(1.2345678, 4) == 1.2346
    
    assert _safe_ratio(10, 2) == 5.0
    assert _safe_ratio(10, 0) == 0.0

def test_multivariate_errors():
    # Less than 2 mics
    with pytest.raises(ValueError, match="At least 2 characteristics"):
        compute_hotelling_t2([], ["mic1"])
        
    # Empty data
    with pytest.raises(ValueError, match="No observations found for the selected multivariate scope"):
        compute_hotelling_t2([], ["mic1", "mic2"])
        
    # Missing columns
    data = [{"batch_id": "b1", "mic_id": "mic1", "avg_result": 10}]
    with pytest.raises(ValueError, match="Missing required multivariate columns"):
        compute_hotelling_t2(data, ["mic1", "mic2"])
        
    # No observations for selected characteristics
    data = [
        {"batch_id": "b1", "batch_date": "2024-01-01", "mic_id": "micA", "mic_name": "m1", "avg_result": 10},
        {"batch_id": "b1", "batch_date": "2024-01-01", "mic_id": "micB", "mic_name": "m2", "avg_result": 20},
    ]
    with pytest.raises(ValueError, match="No observations found for the selected characteristics"):
        compute_hotelling_t2(data, ["mic1", "mic2"])

    # Selected characteristics do not have numeric observations
    data = [
        {"batch_id": "b1", "batch_date": "2024-01-01", "mic_id": "mic1", "mic_name": "m1", "avg_result": "N/A"},
        {"batch_id": "b1", "batch_date": "2024-01-01", "mic_id": "mic2", "mic_name": "m2", "avg_result": "N/A"},
    ]
    with pytest.raises(ValueError, match="Selected characteristics do not have numeric observations"):
        compute_hotelling_t2(data, ["mic1", "mic2"])

    # At least 2 selected characteristics must contain observations in the chosen window
    data = [
        {"batch_id": "b1", "batch_date": "2024-01-01", "mic_id": "mic1", "mic_name": "m1", "avg_result": 10},
        {"batch_id": "b1", "batch_date": "2024-01-01", "mic_id": "mic3", "mic_name": "m3", "avg_result": 30},
    ]
    with pytest.raises(ValueError, match="At least 2 selected characteristics must contain observations"):
        compute_hotelling_t2(data, ["mic1", "mic2"])

    # No shared batches contain complete observations
    data = [
        {"batch_id": "b1", "batch_date": "2024-01-01", "mic_id": "mic1", "mic_name": "m1", "avg_result": 10},
        {"batch_id": "b2", "batch_date": "2024-01-02", "mic_id": "mic2", "mic_name": "m2", "avg_result": 20},
    ]
    with pytest.raises(ValueError, match="No shared batches contain complete observations"):
        compute_hotelling_t2(data, ["mic1", "mic2"])

    # Insufficient shared batches (n <= p)
    data = [
        {"batch_id": "b1", "batch_date": "2024-01-01", "mic_id": "mic1", "mic_name": "m1", "avg_result": 10},
        {"batch_id": "b1", "batch_date": "2024-01-01", "mic_id": "mic2", "mic_name": "m2", "avg_result": 20},
        {"batch_id": "b2", "batch_date": "2024-01-02", "mic_id": "mic1", "mic_name": "m1", "avg_result": 11},
        {"batch_id": "b2", "batch_date": "2024-01-02", "mic_id": "mic2", "mic_name": "m2", "avg_result": 21},
    ]
    # n=2, p=2. n <= p should fail.
    with pytest.raises(ValueError, match="Insufficient shared batches to estimate multivariate covariance"):
        compute_hotelling_t2(data, ["mic1", "mic2"])

def test_msa_anova_significant_interaction():
    # Data designed to have significant interaction
    # Op 1: Part 1 high, Part 2 low
    # Op 2: Part 1 low, Part 2 high
    data = [
        [[10, 10.1], [2, 2.1]], # Op 1
        [[2, 2.1], [10, 10.1]]  # Op 2
    ]
    res = compute_grr_anova(data, 1.0)
    assert res["interaction"] > 0
    assert "statistically significant" in res["modelWarning"]
    assert res["interactionPValue"] < 0.05
