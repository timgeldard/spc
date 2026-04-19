import pytest
import json
import os
from hypothesis import given, strategies as st
from backend.utils.statistical_utils import mean, stddev, moving_range, compute_imr_limits, compute_capability_indices, detect_nelson_rules

def load_fixture(name):
    path = os.path.join(os.path.dirname(__file__), "fixtures", name)
    with open(path, "r") as f:
        return json.load(f)

def test_imr_golden_dataset():
    fixture = load_fixture("imr_golden.json")
    data = fixture["data"]
    expected = fixture["expected"]
    
    lcl, cl, ucl = compute_imr_limits(data)
    
    assert cl == pytest.approx(expected["mean"], abs=1e-2)
    assert ucl == pytest.approx(expected["ucl"], abs=1e-2)
    assert lcl == pytest.approx(expected["lcl"], abs=1e-2)

def test_nelson_rules_golden_datasets():
    fixtures = load_fixture("nelson_rules_trigger.json")
    for rule_key, fixture in fixtures.items():
        rule_num = int(rule_key.replace("rule", ""))
        res = detect_nelson_rules(fixture["data"], centerline=fixture["centerline"], sigma=fixture["sigma"])
        assert fixture["expected_violations"][0] in res[rule_num], f"Failed {rule_key}: {fixture['description']}"

@given(st.lists(st.floats(min_value=-1e6, max_value=1e6, allow_nan=False, allow_infinity=False), min_size=1))
def test_mean_property(values):
    m = mean(values)
    # Use a relative epsilon for floating point comparison
    eps = max(abs(min(values)), abs(max(values))) * 1e-12
    assert min(values) - eps <= m <= max(values) + eps

@given(st.lists(st.floats(min_value=-1e6, max_value=1e6, allow_nan=False, allow_infinity=False), min_size=2))
def test_stddev_property(values):
    s = stddev(values)
    assert s >= 0

def test_mean_edge_cases():
    assert mean([]) == 0.0
    assert mean([10]) == 10.0

def test_stddev_edge_cases():
    assert stddev([10]) == 0.0
    assert stddev([], ddof=1) == 0.0

def test_moving_range_edge_cases():
    assert moving_range([10]) == []
    assert moving_range([]) == []

def test_nelson_rules_zero_sigma():
    # Should return empty violations if sigma is 0
    res = detect_nelson_rules([1, 2, 3], centerline=2, sigma=0)
    assert all(len(v) == 0 for v in res.values())
