import asyncio

from fastapi import HTTPException
from pydantic import ValidationError
from starlette.requests import Request

from backend.dal import spc_analysis_dal, spc_charts_dal, spc_metadata_dal
from backend.routers import exclusions
from backend.routers import spc_common


def test_fetch_characteristics_applies_plant_filter(monkeypatch):
    calls = []

    async def fake_run_sql_async(_token, query, params=None):
        calls.append((query, params or []))
        return []

    monkeypatch.setattr(spc_metadata_dal, "run_sql_async", fake_run_sql_async)

    characteristics, attr_characteristics = asyncio.run(
        spc_metadata_dal.fetch_characteristics("token", "MAT-1", "PLANT-1")
    )

    assert characteristics == []
    assert attr_characteristics == []
    query, params = calls[0]
    assert "PLANT_ID = :plant_id" in query
    assert any(param["name"] == "plant_id" and param["value"] == "PLANT-1" for param in params)


def test_fetch_process_flow_aggregates_multi_plant_rows(monkeypatch):
    async def fake_run_sql_async(_token, query, _params=None):
        if "SELECT DISTINCT" in query and "AS source" in query:
            return [{"source": "MAT-ROOT", "target": "MAT-CHILD"}]
        return [
            {
                "material_id": "MAT-ROOT",
                "material_name": "Root Material",
                "plant_name": None,
                "total_batches": 7,
                "rejected_batches": 1,
                "mic_count": 3,
            },
            {
                "material_id": "MAT-CHILD",
                "material_name": "Child Material",
                "plant_name": None,
                "total_batches": 4,
                "rejected_batches": 0,
                "mic_count": 2,
            },
        ]

    monkeypatch.setattr(spc_analysis_dal, "run_sql_async", fake_run_sql_async)

    result = asyncio.run(
        spc_analysis_dal.fetch_process_flow("token", "MAT-ROOT", None, None)
    )

    root = next(node for node in result["nodes"] if node["material_id"] == "MAT-ROOT")
    assert root["total_batches"] == 7
    assert root["rejected_batches"] == 1
    assert root["plant_name"] is None


def test_handle_sql_error_masks_internal_details():
    try:
        spc_common.handle_sql_error(RuntimeError("Databricks exploded with secret SQL details"))
    except HTTPException as exc:
        assert exc.status_code == 500
        assert "Internal server error; reference id:" in exc.detail
        assert "secret SQL details" not in exc.detail
    else:  # pragma: no cover
        raise AssertionError("Expected HTTPException")


def test_apply_chart_row_formatting_raises_on_bad_numeric_value():
    rows = [
        {
            "batch_id": "BATCH-1",
            "cursor_sample_id": "SAMPLE-7",
            "value": "not-a-number",
            "nominal": "10.0",
            "tolerance": "1.0",
            "lsl": None,
            "usl": None,
            "sample_seq": "1",
            "attribut": "",
        }
    ]

    try:
        spc_charts_dal._apply_chart_row_formatting(rows)
    except ValueError as exc:
        message = str(exc)
        assert "field 'value'" in message
        assert "batch_id='BATCH-1'" in message
        assert "'not-a-number'" in message
    else:  # pragma: no cover
        raise AssertionError("Expected ValueError")


def test_get_exclusions_query_rejects_invalid_stratify_by():
    try:
        exclusions.GetExclusionsQuery(
            material_id="MAT-1",
            mic_id="MIC-1",
            stratify_by="bad_column",
        )
    except ValidationError as exc:
        assert "stratify_by must be one of" in str(exc)
    else:  # pragma: no cover
        raise AssertionError("Expected ValidationError")


def test_get_exclusions_includes_legacy_plant_fallback(monkeypatch):
    calls = []

    async def fake_run_sql_async(_token, query, params=None):
        calls.append((query, params or []))
        return []

    monkeypatch.setattr(exclusions, "run_sql_async", fake_run_sql_async)
    monkeypatch.setattr(exclusions, "resolve_token", lambda *_args, **_kwargs: "token")
    monkeypatch.setattr(exclusions, "check_warehouse_config", lambda: None)

    request = Request({"type": "http", "method": "GET", "headers": []})
    query = exclusions.GetExclusionsQuery(
        material_id="MAT-1",
        mic_id="MIC-1",
        plant_id="PLANT-1",
        stratify_all=True,
        stratify_by="plant_id",
    )

    result = asyncio.run(
        exclusions.get_exclusions(
            request=request,
            query=query,
            x_forwarded_access_token=None,
            authorization=None,
        )
    )

    assert result == {"exclusions": None}
    sql, params = calls[0]
    assert "AND stratify_by IS NULL" in sql
    assert "AND :stratify_by = 'plant_id'" in sql
    assert any(param["name"] == "stratify_by" and param["value"] == "plant_id" for param in params)
