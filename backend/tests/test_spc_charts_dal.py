import asyncio

import pytest

from backend.dal import spc_charts_dal


def test_fetch_chart_data_page_generates_expected_sql(monkeypatch):
    calls = []

    async def fake_run_sql_async(_token, query, params=None):
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
    assert "gold_batch_mass_balance_v" in query
    assert "gold_batch_quality_result_v" in query
    assert "cursor_batch_date_epoch > :cursor_batch_date_epoch" in query
    assert "POSTING_DATE >= :date_from" in query
    assert "POSTING_DATE <= :date_to" in query
    assert "stratify_value" in query
    assert ":date_from" in query and ":date_to" in query
    assert "2026-01-01" not in query
    assert "2026-01-31" not in query
    assert any(param["name"] == "date_from" for param in params)
    assert any(param["name"] == "date_to" for param in params)
    assert any(param["name"] == "cursor_batch_id" and param["value"] == "B1" for param in params)


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
