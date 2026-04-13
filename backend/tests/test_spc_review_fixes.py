import asyncio

from fastapi import HTTPException
from pydantic import ValidationError
from starlette.requests import Request

from backend.dal import spc_analysis_dal, spc_charts_dal, spc_metadata_dal, spc_shared
from backend.routers import exclusions
from backend.routers import spc_common
from backend.schemas.spc_schemas import ProcessFlowRequest


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
    calls = []

    async def fake_run_sql_async(_token, query, _params=None):
        calls.append((query, _params or []))
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
        spc_analysis_dal.fetch_process_flow("token", "MAT-ROOT", None, None, 8, 6)
    )

    root = next(node for node in result["nodes"] if node["material_id"] == "MAT-ROOT")
    assert root["total_batches"] == 7
    assert root["rejected_batches"] == 1
    assert root["plant_name"] is None
    assert result["upstream_depth"] == 8
    assert result["downstream_depth"] == 6
    edge_query, edge_params = calls[0]
    assert "u.depth < :upstream_depth" in edge_query
    assert "d.depth < :downstream_depth" in edge_query
    assert any(param["name"] == "upstream_depth" and param["value"] == "8" for param in edge_params)
    assert any(param["name"] == "downstream_depth" and param["value"] == "6" for param in edge_params)


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


def test_infer_spec_type_distinguishes_unspecified_and_asymmetric_specs():
    assert spc_shared.infer_spec_type(None, None) == "unspecified"
    assert spc_shared.infer_spec_type(13.0, 7.0, 10.0) == "bilateral_symmetric"
    assert spc_shared.infer_spec_type(14.0, 7.0, 10.0) == "bilateral_asymmetric"
    assert spc_shared.infer_spec_type(12.0, None, 10.0) == "unilateral_upper"
    assert spc_shared.infer_spec_type(None, 8.0, 10.0) == "unilateral_lower"


def test_process_flow_request_allows_configurable_lineage_depth():
    request = ProcessFlowRequest(material_id="MAT-1", upstream_depth=10, downstream_depth=9)

    assert request.upstream_depth == 10
    assert request.downstream_depth == 9


def test_process_flow_request_rejects_out_of_range_lineage_depth():
    try:
        ProcessFlowRequest(material_id="MAT-1", upstream_depth=0)
    except ValidationError as exc:
        assert "lineage depth must be between 1 and 12" in str(exc)
    else:  # pragma: no cover
        raise AssertionError("Expected ValidationError")


def test_fetch_compare_scorecard_runs_parallel_queries(monkeypatch):
    async def fake_fetch_scorecard(_token, material_id, _plant_id, _date_from, _date_to):
        return [{"mic_id": f"MIC-{material_id}", "mic_name": f"MIC {material_id}", "ppk": 1.2, "batch_count": 4, "ooc_rate": 0.0}]

    async def fake_run_sql_async(_token, _query, _params=None):
        return [
            {"material_id": "MAT-1", "material_name": "Material 1"},
            {"material_id": "MAT-2", "material_name": "Material 2"},
        ]

    monkeypatch.setattr(spc_analysis_dal, "fetch_scorecard", fake_fetch_scorecard)
    monkeypatch.setattr(spc_analysis_dal, "run_sql_async", fake_run_sql_async)

    result = asyncio.run(
        spc_analysis_dal.fetch_compare_scorecard("token", ["MAT-1", "MAT-2"], None, None, None)
    )

    assert [entry["material_id"] for entry in result["materials"]] == ["MAT-1", "MAT-2"]
    assert result["materials"][0]["material_name"] == "Material 1"
