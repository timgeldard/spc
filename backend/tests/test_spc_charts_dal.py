import asyncio
import pytest
from unittest.mock import AsyncMock
from backend.dal import spc_charts_dal

def test_fetch_chart_data_page_generates_expected_sql(monkeypatch):
    calls = []
    async def fake_run_sql_async(_token, query, params=None, **_kwargs):
        calls.append((query, params or []))
        return []
    monkeypatch.setattr(spc_charts_dal, "run_sql_async", fake_run_sql_async)

    asyncio.run(
        spc_charts_dal.fetch_chart_data_page(
            "token", "MAT-1", "MIC-1", "Viscosity", "PLANT-1", "2026-01-01", "2026-01-31",
            "operation_id", cursor=spc_charts_dal.encode_chart_cursor(1704067200, "B1", "S1", "LOT1", "OP1"), limit=100,
        )
    )
    query, params = calls[0]
    assert "WITH" in query
    assert "batch_dates AS" in query
    assert "quality_data AS" in query
    assert "spc_batch_dim_mv" in query
    assert "gold_batch_quality_result_v" in query

def test_build_chart_filters_rejects_invalid_stratify_key():
    with pytest.raises(ValueError, match="stratify_by must be one of"):
        spc_charts_dal._build_chart_filters("MAT-1", "MIC-1", None, None, None, None, "bad_column")

def test_fetch_spec_drift_summary_filters_by_operation_id(monkeypatch):
    captured = {}
    async def fake_run_sql_async(_token, query, params=None, **_kwargs):
        captured["query"] = query
        captured["params"] = params or []
        return [{"distinct_signatures": 1, "total_batches": 3, "signature_set": ["1|2|1.5"]}]
    monkeypatch.setattr(spc_charts_dal, "run_sql_async", fake_run_sql_async)

    result = asyncio.run(spc_charts_dal.fetch_spec_drift_summary("token", "MAT-1", "MIC-1", "PLANT-1", "2026-01-01", "2026-01-31", operation_id="OP-10"))
    assert result["detected"] is False
    assert "operation_id = :operation_id" in captured["query"]

def test_fetch_spec_drift_summary_falls_back_when_summary_view_missing(monkeypatch):
    calls = []
    async def fake_run_sql_async(_token, query, params=None, **_kwargs):
        calls.append((query, params or []))
        if "spc_spec_drift_summary_v" in query:
            raise RuntimeError("TABLE_OR_VIEW_NOT_FOUND: spc_spec_drift_summary_v")
        return [{"distinct_signatures": 2, "total_batches": 5, "signature_set": ["A", "B"], "change_references": None}]
    monkeypatch.setattr(spc_charts_dal, "run_sql_async", fake_run_sql_async)

    result = asyncio.run(spc_charts_dal.fetch_spec_drift_summary("token", "MAT-1", "MIC-1", None, None, None))
    assert result["detected"] is True

def test_fetch_normality_summary_maps_non_normal_profile(monkeypatch):
    captured = {}
    async def fake_run_sql_async(_token, query, params=None, **_kwargs):
        captured["query"] = query
        captured["params"] = params or []
        return [{"normality_safe": 1, "normality_type": "non_normal", "normality_method": "shapiro_wilk"}]
    monkeypatch.setattr(spc_charts_dal, "run_sql_async", fake_run_sql_async)

    result = asyncio.run(spc_charts_dal.fetch_normality_summary("token", "MAT-1", "MIC-1", "PLANT-1", "2026-01-01", "2026-01-31", operation_id="OP-10"))
    assert result["is_normal"] is False

def test_fetch_control_limits_queries_governed_metrics(monkeypatch):
    captured = {}
    async def fake_run_sql_async(_token, query, params=None, **_kwargs):
        captured["query"] = query
        captured["params"] = params or []
        return [{"cl": "10.5", "ucl": "12.1", "lcl": "8.9", "sigma_within": "0.4", "cpk": "1.33", "ppk": "1.21"}]
    monkeypatch.setattr(spc_charts_dal, "run_sql_async", fake_run_sql_async)

    result = asyncio.run(spc_charts_dal.fetch_control_limits("token", "MAT-1", "MIC-1", "PLANT-1", "2026-01-01", "2026-01-31", operation_id="OP-10"))
    assert result["cl"] == 10.5

def test_fetch_p_chart_data_uses_attribute_subgroup_mv(monkeypatch):
    captured = {}
    async def fake_run_sql_async(_token, query, params=None, **_kwargs):
        captured["query"] = query
        captured["params"] = params or []
        return [{"batch_id": "B1", "batch_date": "2026-01-01", "n_inspected": "10", "n_nonconforming": "2", "p_value": "0.2"}]
    monkeypatch.setattr(spc_charts_dal, "run_sql_async", fake_run_sql_async)

    rows = asyncio.run(spc_charts_dal.fetch_p_chart_data("token", "MAT-1", "MIC-1", "Defects", "PLANT-1", "2026-01-01", "2026-01-31", operation_id="OP-10"))
    assert rows[0]["n_inspected"] == 10

def test_fetch_count_chart_data_uses_attribute_subgroup_mv(monkeypatch):
    captured = {}
    async def fake_run_sql_async(_token, query, params=None, **_kwargs):
        captured["query"] = query
        captured["params"] = params or []
        return [{"batch_id": "B1", "batch_date": "2026-01-01", "n_inspected": "12", "defect_count": "3"}]
    monkeypatch.setattr(spc_charts_dal, "run_sql_async", fake_run_sql_async)

    rows = asyncio.run(spc_charts_dal.fetch_count_chart_data("token", "MAT-1", "MIC-1", "Defects", "PLANT-1", "2026-01-01", "2026-01-31", "u", operation_id="OP-10"))
    assert rows[0]["n_inspected"] == 12

def test_fetch_locked_limits_prefers_unified_mic_key(monkeypatch):
    captured = {}
    async def fake_run_sql_async(_token, query, params=None, **_kwargs):
        captured["query"] = query
        captured["params"] = params or []
        return []
    monkeypatch.setattr(spc_charts_dal, "run_sql_async", fake_run_sql_async)

    result = asyncio.run(spc_charts_dal.fetch_locked_limits("token", "MAT-1", "MIC-1", "PLANT-1", "imr", operation_id="OP-10", unified_mic_key="U-1"))
    assert result is None

def test_fetch_chart_data_page_stratification(monkeypatch):
    calls = []
    async def fake_run_sql_async(_token, query, params=None, **_kwargs):
        calls.append(query)
        return []
    monkeypatch.setattr(spc_charts_dal, "run_sql_async", fake_run_sql_async)

    asyncio.run(spc_charts_dal.fetch_chart_data_page("t", "M", "MI", "N", "P", None, None, stratify_by="inspection_lot_id"))
    assert "CAST(r.INSPECTION_LOT_ID AS STRING) AS stratify_value" in calls[0]

async def test_fetch_chart_data_values(monkeypatch):
    async def fake_run_sql_async(_token, query, params=None, **kwargs):
        return [{"value": "10.5"}, {"value": "11.0"}]
    monkeypatch.setattr(spc_charts_dal, "run_sql_async", fake_run_sql_async)
    res = await spc_charts_dal.fetch_chart_data_values("token", "M1", "MIC1", "NM1", None, None, None)
    assert res == [10.5, 11.0]

async def test_save_locked_limits(monkeypatch):
    mock_run = AsyncMock(return_value=[])
    monkeypatch.setattr(spc_charts_dal, "run_sql_async", mock_run)
    await spc_charts_dal.save_locked_limits("token", "M1", "MIC1", "P1", "imr", 10, 12, 8, None, None, 1.0, None, None)
    assert mock_run.called

async def test_delete_locked_limits(monkeypatch):
    mock_run = AsyncMock(return_value=[])
    monkeypatch.setattr(spc_charts_dal, "run_sql_async", mock_run)
    res = await spc_charts_dal.delete_locked_limits("token", "M1", "MIC1", "P1", "imr")
    assert res["deleted"] is True

async def test_fetch_data_quality_summary(monkeypatch):
    async def fake_run_sql_async(_token, query, params=None, **kwargs):
        if "USAGE_DECISION_CODE" in query:
            return [{"code": "A", "n": 5}]
        return [{
            "n_samples": 10, "n_batches": 5, "n_missing_values": 0, "n_unparseable_values": 0,
            "mean_value": 10.0, "stddev_value": 1.0, "n_outliers_3sigma": 0,
            "first_batch_date": "2026-04-01", "last_batch_date": "2026-04-05",
            "median_gap_days": 1.0, "p95_gap_days": 1.0, "max_gap_days": 1.0
        }]
    monkeypatch.setattr(spc_charts_dal, "run_sql_async", fake_run_sql_async)
    monkeypatch.setattr(spc_charts_dal, "detect_optional_columns", AsyncMock(return_value={"USAGE_DECISION_CODE"}))
    res = await spc_charts_dal.fetch_data_quality_summary("token", "M1", "MIC1", "P1", None, None)
    assert res["n_samples"] == 10
    assert res["disposition_breakdown"] == {"A": 5}
