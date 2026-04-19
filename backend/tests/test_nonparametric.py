import pytest
from backend.utils.statistical_utils import compute_non_parametric_capability

def test_non_parametric_capability():
    # Simple uniform distribution from 0 to 100
    values = list(range(101)) # 0, 1, ..., 100
    # p00135 = 0.00135 * 100 = 0.135
    # p50 = 50.0
    # p99865 = 0.99865 * 100 = 99.865
    
    # usl = 110, lsl = -10
    # ppk_u = (110 - 50) / (99.865 - 50) = 60 / 49.865 = 1.203
    # ppk_l = (50 - (-10)) / (50 - 0.135) = 60 / 49.865 = 1.203
    
    res = compute_non_parametric_capability(values, usl=110.0, lsl=-10.0)
    assert res["ppk_non_parametric"] == pytest.approx(1.203248, rel=1e-3)

def test_non_parametric_with_empty_data():
    assert compute_non_parametric_capability([], usl=10, lsl=0) == {}
