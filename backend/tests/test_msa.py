from backend.utils.msa import compute_grr, compute_grr_anova


def test_compute_grr_returns_expected_components():
    data = [
        [[10, 10], [20, 20]],
        [[10, 10], [20, 20]],
    ]

    result = compute_grr(data, 20)

    assert result.get("error") is None
    assert result["ev"] == 0
    assert result["av"] == 0
    assert result["grr"] == 0
    assert result["pv"] > 0


def test_compute_grr_anova_returns_interaction_metadata():
    data = [
        [[10.0, 10.1], [20.0, 20.2], [30.0, 30.1]],
        [[10.2, 10.3], [20.1, 20.2], [30.2, 30.3]],
        [[9.9, 10.0], [19.8, 20.0], [29.9, 30.0]],
    ]

    result = compute_grr_anova(data, 10)

    assert result.get("error") is None
    assert result["method"] == "anova"
    assert result["repeatability"] >= 0
    assert result["reproducibility"] >= 0
    assert result["grrPct"] is not None
    assert "interactionPValue" in result
    assert "modelWarning" in result
