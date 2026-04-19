import pytest
from backend.utils.statistical_utils import compute_imr_limits

def test_compute_imr_limits():
    values = [10.0, 10.5, 9.8, 11.2, 10.1]
    # mean = (10.0 + 10.5 + 9.8 + 11.2 + 10.1) / 5 = 10.32
    # MR = [0.5, 0.7, 1.4, 1.1]
    # MR_bar = (0.5 + 0.7 + 1.4 + 1.1) / 4 = 0.925
    # sigma_within = 0.925 / 1.128 = 0.8199
    # UCL = 10.32 + 3 * 0.8199 = 12.7797
    # LCL = 10.32 - 3 * 0.8199 = 7.8603
    
    lcl, cl, ucl = compute_imr_limits(values)
    
    assert cl == pytest.approx(10.32)
    assert ucl == pytest.approx(12.7797, rel=1e-4)
    assert lcl == pytest.approx(7.8603, rel=1e-4)

def test_imr_limits_with_stable_data():
    values = [10.0, 10.0, 10.0, 10.0]
    lcl, cl, ucl = compute_imr_limits(values)
    assert cl == 10.0
    assert ucl == 10.0
    assert lcl == 10.0
