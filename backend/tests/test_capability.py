import pytest
from backend.utils.statistical_utils import compute_capability_indices

def test_compute_capability_indices():
    # mu = 10.0, s_overall = 1.0 (ddof=1)
    values = [8.0, 9.0, 10.0, 11.0, 12.0]
    # MR = [1.0, 1.0, 1.0, 1.0], MR_bar = 1.0, sigma_within = 1.0 / 1.128 = 0.8865
    
    # usl = 13.0, lsl = 7.0
    # Cp = (13 - 7) / (6 * 0.8865) = 6 / 5.319 = 1.128
    # Cpk_u = (13 - 10) / (3 * 0.8865) = 3 / 2.6595 = 1.128
    # Cpk_l = (10 - 7) / (3 * 0.8865) = 3 / 2.6595 = 1.128
    
    res = compute_capability_indices(values, usl=13.0, lsl=7.0)
    
    assert res["cp"] == pytest.approx(1.128, rel=1e-3)
    assert res["cpk"] == pytest.approx(1.128, rel=1e-3)
    assert res["pp"] == pytest.approx(0.6325, rel=1e-3)

def test_cpm_calculation():
    values = [9.0, 10.0, 11.0]
    # mu = 10, s = 1.0
    # target = 10, usl = 13, lsl = 7
    # Cpm = (13-7) / (6 * sqrt(1 + (10-10)^2)) = 6 / 6 = 1.0
    res = compute_capability_indices(values, usl=13.0, lsl=7.0, target=10.0)
    assert res["cpm"] == pytest.approx(1.0)
    
    # Off-target: target = 11
    # Cpm = (13-7) / (6 * sqrt(1 + (10-11)^2)) = 6 / (6 * sqrt(2)) = 1 / 1.414 = 0.707
    res = compute_capability_indices(values, usl=13.0, lsl=7.0, target=11.0)
    assert res["cpm"] == pytest.approx(0.707, rel=1e-3)
