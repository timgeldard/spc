import asyncio

import pytest

from backend.dal import spc_charts_dal


def test_fetch_chart_data_page_generates_expected_sql(monkeypatch):
    calls = []

    async def fake_run_sql_async(_token, query, params=None, **_kwargs):
        calls.append((query, params or []))
        return []

    monkeypatch.setattr(spc_charts_dal, "run_sql_async", fake_run_sql_async)

    asyncio.run(
        spc_charts_dal.fetch_chart_data_page(
            "token",
            "MAT-1",
            "MIC-1",
            "Viscosity",
            "PLANT-1",
            "2026-01-01",
            "2026-01-31",
            "operation_id",
            cursor=spc_charts_dal.encode_chart_cursor(1704067200, "B1", "S1", "LOT1", "OP1"),
            limit=100,
        )
    )

    query, params = calls[0]
    assert "WITH" in query
    assert "batch_dates AS" in query
    assert "quality_data AS" in query
    assert "spc_batch_dim_mv" in query
    assert "gold_batch_quality_result_v" in query
    assert "cursor_batch_date_epoch > :cursor_batch_date_epoch" in query
    assert "batch_date >= :date_from" in query
    assert "batch_date <= :date_to" in query
    assert "stratify_value" in query
    assert ":date_from" in query and ":date_to" in query
    assert "2026-01-01" not in query
    assert "2026-01-31" not in query
    assert any(param["name"] == "date_from" for param in params)
    assert any(param["name"] == "date_to" for param in params)
    assert any(param["name"] == "cursor_batch_id" and param["value"] == "B1" for param in params)
    assert "pypika" not in query.lower()


def test_build_chart_filters_rejects_invalid_stratify_key():
    with pytest.raises(ValueError, match="stratify_by must be one of"):
        spc_charts_dal._build_chart_filters(
            "MAT-1",
            "MIC-1",
            None,
            None,
            None,
            None,
            "bad_column",
        )


def test_fetch_spec_drift_summary_filters_by_operation_id(monkeypatch):
    captured = {}

    async def fake_run_sql_async(_token, query, params=None, **_kwargs):
        captured["query"] = query
        captured["params"] = params or []
        return [{"distinct_signatures": 1, "total_batches": 3, "signature_set": ["1|2|1.5"]}]

    monkeypatch.setattr(spc_charts_dal, "run_sql_async", fake_run_sql_async)

    result = asyncio.run(
        spc_charts_dal.fetch_spec_drift_summary(
            "token",
            "MAT-1",
            "MIC-1",
            "PLANT-1",
            "2026-01-01",
            "2026-01-31",
            operation_id="OP-10",
        )
    )

    assert result["detected"] is False
    assert "operation_id = :operation_id" in captured["query"]
    assert any(param["name"] == "operation_id" and param["value"] == "OP-10" for param in captured["params"])


def test_fetch_spec_drift_summary_falls_back_when_summary_view_missing(monkeypatch):
    calls = []

    async def fake_run_sql_async(_token, query, params=None, **_kwargs):
        calls.append((query, params or []))
        if "spc_spec_drift_summary_v" in query:
            raise RuntimeError("TABLE_OR_VIEW_NOT_FOUND: spc_spec_drift_summary_v")
        return [{"distinct_signatures": 2, "total_batches": 5, "signature_set": ["A", "B"], "change_references": None}]

    monkeypatch.setattr(spc_charts_dal, "run_sql_async", fake_run_sql_async)

    result = asyncio.run(
        spc_charts_dal.fetch_spec_drift_summary(
            "token",
            "MAT-1",
            "MIC-1",
            None,
            None,
            None,
        )
    )

    assert result["detected"] is True
    assert any("spc_spec_drift_summary_v" in query for query, _ in calls)
    assert any("spc_quality_metric_subgroup_v" in query for query, _ in calls)


def test_fetch_normality_summary_maps_non_normal_profile(monkeypatch):
    captured = {}

    async def fake_run_sql_async(_token, query, params=None, **_kwargs):
        captured["query"] = query
        captured["params"] = params or []
        return [{"normality_safe": 1, "normality_type": "non_normal", "normality_method": "shapiro_wilk"}]

    monkeypatch.setattr(spc_charts_dal, "run_sql_async", fake_run_sql_async)

    result = asyncio.run(
        spc_charts_dal.fetch_normality_summary(
            "token",
            "MAT-1",
            "MIC-1",
            "PLANT-1",
            "2026-01-01",
            "2026-01-31",
            operation_id="OP-10",
        )
    )

    assert result["method"] == "shapiro_wilk"
    assert result["is_normal"] is False
    assert result["p_value"] is None
    assert "spc_quality_metrics" in captured["query"]
    assert any(param["name"] == "operation_id" and param["value"] == "OP-10" for param in captured["params"])


def test_fetch_control_limits_queries_governed_metrics(monkeypatch):
    captured = {}

    async def fake_run_sql_async(_token, query, params=None, **_kwargs):
        captured["query"] = query
        captured["params"] = params or []
        return [{
            "cl": "10.5",
            "ucl": "12.1",
            "lcl": "8.9",
            "sigma_within": "0.4",
            "cpk": "1.33",
            "ppk": "1.21",
        }]

    monkeypatch.setattr(spc_charts_dal, "run_sql_async", fake_run_sql_async)

    result = asyncio.run(
        spc_charts_dal.fetch_control_limits(
            "token",
            "MAT-1",
            "MIC-1",
            "PLANT-1",
            "2026-01-01",
            "2026-01-31",
            operation_id="OP-10",
        )
    )

    assert result == {
        "cl": 10.5,
        "ucl": 12.1,
        "lcl": 8.9,
        "sigma_within": 0.4,
        "cpk": 1.33,
        "ppk": 1.21,
    }
    assert "MEASURE(mean_value)" in captured["query"]
    assert "MEASURE(x_bar_ucl)" in captured["query"]
    assert "MEASURE(x_bar_lcl)" in captured["query"]
    assert "spc_quality_metrics" in captured["query"]
    assert any(param["name"] == "operation_id" and param["value"] == "OP-10" for param in captured["params"])


def test_fetch_control_limits_returns_nulls_when_multiple_operations_match(monkeypatch):
    async def fake_run_sql_async(_token, _query, _params=None, **_kwargs):
        return [
            {"cl": "10.5", "ucl": "12.1", "lcl": "8.9", "sigma_within": "0.4", "cpk": "1.33", "ppk": "1.21"},
            {"cl": "11.0", "ucl": "12.4", "lcl": "9.6", "sigma_within": "0.5", "cpk": "1.1", "ppk": "1.0"},
        ]

    monkeypatch.setattr(spc_charts_dal, "run_sql_async", fake_run_sql_async)

    result = asyncio.run(
        spc_charts_dal.fetch_control_limits(
            "token",
            "MAT-1",
            "MIC-1",
            "PLANT-1",
            "2026-01-01",
            "2026-01-31",
        )
    )

    assert result == {
        "cl": None,
        "ucl": None,
        "lcl": None,
        "sigma_within": None,
        "cpk": None,
        "ppk": None,
    }


def test_fetch_normality_summary_warns_when_multiple_operations_match(monkeypatch):
    async def fake_run_sql_async(_token, _query, _params=None, **_kwargs):
        return [
            {"normality_safe": 1, "normality_type": "normal", "normality_method": "governed_profile"},
            {"normality_safe": 1, "normality_type": "non_normal", "normality_method": "governed_profile"},
        ]

    monkeypatch.setattr(spc_charts_dal, "run_sql_async", fake_run_sql_async)

    result = asyncio.run(
        spc_charts_dal.fetch_normality_summary(
            "token",
            "MAT-1",
            "MIC-1",
            "PLANT-1",
            "2026-01-01",
            "2026-01-31",
        )
    )

    assert result["is_normal"] is None
    assert "multiple operations" in (result["warning"] or "")


def test_fetch_p_chart_data_uses_attribute_subgroup_mv(monkeypatch):
    captured = {}

    async def fake_run_sql_async(_token, query, params=None, **_kwargs):
        captured["query"] = query
        captured["params"] = params or []
        return [{"batch_id": "B1", "batch_date": "2026-01-01", "n_inspected": "10", "n_nonconforming": "2", "p_value": "0.2"}]

    monkeypatch.setattr(spc_charts_dal, "run_sql_async", fake_run_sql_async)

    rows = asyncio.run(
        spc_charts_dal.fetch_p_chart_data(
            "token",
            "MAT-1",
            "MIC-1",
            "Defects",
            "PLANT-1",
            "2026-01-01",
            "2026-01-31",
            operation_id="OP-10",
        )
    )

    assert rows[0]["n_inspected"] == 10
    assert rows[0]["n_nonconforming"] == 2
    assert rows[0]["p_value"] == 0.2
    assert "spc_attribute_subgroup_mv" in captured["query"]
    assert "SUM(inspected_count)" in captured["query"]
    assert "SUM(nonconforming_count)" in captured["query"]
    assert "GROUP BY batch_id, batch_date" in captured["query"]
    assert any(param["name"] == "operation_id" and param["value"] == "OP-10" for param in captured["params"])


def test_fetch_count_chart_data_uses_attribute_subgroup_mv(monkeypatch):
    captured = {}

    async def fake_run_sql_async(_token, query, params=None, **_kwargs):
        captured["query"] = query
        captured["params"] = params or []
        return [{"batch_id": "B1", "batch_date": "2026-01-01", "n_inspected": "12", "defect_count": "3"}]

    monkeypatch.setattr(spc_charts_dal, "run_sql_async", fake_run_sql_async)

    rows = asyncio.run(
        spc_charts_dal.fetch_count_chart_data(
            "token",
            "MAT-1",
            "MIC-1",
            "Defects",
            "PLANT-1",
            "2026-01-01",
            "2026-01-31",
            "u",
            operation_id="OP-10",
        )
    )

    assert rows[0]["n_inspected"] == 12
    assert rows[0]["defect_count"] == 3
    assert "spc_attribute_subgroup_mv" in captured["query"]
    assert "SUM(inspected_count)" in captured["query"]
    assert "SUM(nonconforming_count)" in captured["query"]
    assert "GROUP BY batch_id, batch_date" in captured["query"]
    assert any(param["name"] == "operation_id" and param["value"] == "OP-10" for param in captured["params"])


def test_fetch_locked_limits_prefers_unified_mic_key(monkeypatch):
    captured = {}

    async def fake_run_sql_async(_token, query, params=None, **_kwargs):
        captured["query"] = query
        captured["params"] = params or []
        return []

    monkeypatch.setattr(spc_charts_dal, "run_sql_async", fake_run_sql_async)

    result = asyncio.run(
        spc_charts_dal.fetch_locked_limits(
            "token",
            "MAT-1",
            "MIC-1",
            "PLANT-1",
            "imr",
            operation_id="OP-10",
            unified_mic_key="PLANT-1||VISCOSITY||NO_UNIT",
        )
    )

    assert result is None
    assert "AND (unified_mic_key = :unified_mic_key OR mic_id = :mic_id)" in captured["query"]
    assert "ORDER BY CASE WHEN unified_mic_key = :unified_mic_key THEN 0 ELSE 1 END, locked_at DESC" in captured["query"]
    assert any(param["name"] == "mic_id" and param["value"] == "MIC-1" for param in captured["params"])
