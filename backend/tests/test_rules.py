import pytest
from backend.utils.statistical_utils import detect_nelson_rules

def test_nelson_rule_1():
    # 1 point > 3 sigma
    values = [0, 0, 0, 0, 4, 0] # sigma=1, centerline=0 -> 4 is > 3 sigma
    res = detect_nelson_rules(values, centerline=0, sigma=1)
    assert 4 in res[1]

def test_nelson_rule_2():
    # 9 consecutive same side
    values = [1, 1, 1, 1, 1, 1, 1, 1, 1]
    res = detect_nelson_rules(values, centerline=0, sigma=1)
    assert 8 in res[2]
    
    values = [-1] * 9
    res = detect_nelson_rules(values, centerline=0, sigma=1)
    assert 8 in res[2]

def test_nelson_rule_3():
    # 6 consecutive increasing
    values = [1, 2, 3, 4, 5, 6]
    res = detect_nelson_rules(values, centerline=0, sigma=1)
    assert 5 in res[3]

def test_nelson_rule_4():
    # 14 consecutive alternating
    values = [1, -1, 1, -1, 1, -1, 1, -1, 1, -1, 1, -1, 1, -1]
    res = detect_nelson_rules(values, centerline=0, sigma=1)
    assert 13 in res[4]

def test_nelson_rule_5():
    # 2 of 3 > 2 sigma same side
    values = [2.1, 0, 2.1]
    res = detect_nelson_rules(values, centerline=0, sigma=1)
    assert 2 in res[5]

def test_nelson_rule_6():
    # 4 of 5 > 1 sigma same side
    values = [1.1, 1.1, 0, 1.1, 1.1]
    res = detect_nelson_rules(values, centerline=0, sigma=1)
    assert 4 in res[6]

def test_nelson_rule_7():
    # 15 consecutive within 1 sigma
    values = [0.1] * 15
    res = detect_nelson_rules(values, centerline=0, sigma=1)
    assert 14 in res[7]

def test_nelson_rule_8():
    # 8 consecutive > 1 sigma both sides
    values = [1.1, -1.1, 1.1, -1.1, 1.1, -1.1, 1.1, -1.1]
    res = detect_nelson_rules(values, centerline=0, sigma=1)
    assert 7 in res[8]
