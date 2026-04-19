import pytest
from backend.utils.statistical_utils import mean, stddev, moving_range

def test_mean():
    assert mean([1, 2, 3, 4, 5]) == 3.0
    assert mean([10, 20]) == 15.0
    assert mean([]) == 0.0

def test_stddev():
    # sample stddev of [1, 2, 3] is sqrt(((1-2)^2 + (2-2)^2 + (3-2)^2) / 2) = sqrt(1) = 1
    assert stddev([1, 2, 3]) == 1.0
    assert stddev([10, 20], ddof=1) == pytest.approx(7.0710678)
    assert stddev([1], ddof=1) == 0.0

def test_moving_range():
    assert moving_range([10, 12, 11, 13]) == [2, 1, 2]
    assert moving_range([5, 5, 5]) == [0, 0]
    assert moving_range([10]) == []
    assert moving_range([]) == []

from backend.utils.statistical_utils import detect_nelson_rules
def test_nelson_rules_zero_sigma():
    # Should return empty violations if sigma is 0
    res = detect_nelson_rules([1, 2, 3], centerline=2, sigma=0)
    assert all(len(v) == 0 for v in res.values())
