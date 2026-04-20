import asyncio

from backend.dal import spc_analysis_dal
from unittest.mock import AsyncMock


def test_fetch_scorecard_queries_metric_view_and_preserves_capability_fields(monkeypatch):
    calls = []

    async def fake_run_sql_async(_token, query, params=None, **_kwargs):
        calls.append((query, params or []))
        return [
            {
                "mic_id": "MIC-1",
                "mic_name": "Viscosity",
                "batch_count": 5,
                "sample_count": 20,
                "mean_value": 10.0,
                "stddev_overall": 1.5,
                "min_value": 7.5,
                "max_value": 12.5,
                "nominal_target": 10.0,
                "lsl": 7.0,
                "usl": 13.0,
                "ooc_batches": 0,
                "accepted_batches": 5,
                "ooc_rate": 0.0,
                "sigma_within": 1.0,
                "pp": 0.667,
                "ppk": 0.667,
                "cp": 1.0,
                "cpk": 1.0,
                "z_score": 2.0,
                "dpmo": 308538,
                "distinct_spec_count": 1,
                "performance_capability_method": "parametric",
                "mean_out_of_spec_flag": 0,
            }
        ]

    monkeypatch.setattr(spc_analysis_dal, "run_sql_async", fake_run_sql_async)

    rows = asyncio.run(spc_analysis_dal.fetch_scorecard("token", "MAT-1", None, None, None))

    query, _params = calls[0]
    assert "MEASURE(batch_count)" in query
    assert "spc_quality_metrics" in query
    assert rows[0]["spec_type"] == "bilateral_symmetric"
    assert rows[0]["cpk"] == 1.0
    assert rows[0]["ppk"] == 0.667


def test_fetch_scorecard_marks_unspecified_specs(monkeypatch):
    async def fake_run_sql_async(_token, _query, _params=None, **_kwargs):
        return [
            {
                "mic_id": "MIC-2",
                "mic_name": "Density",
                "batch_count": 5,
                "sample_count": 20,
                "mean_value": 10.0,
                "stddev_overall": 1.5,
                "min_value": 7.5,
                "max_value": 12.5,
                "nominal_target": None,
                "lsl": None,
                "usl": None,
                "ooc_batches": 0,
                "accepted_batches": 5,
                "ooc_rate": 0.0,
                "sigma_within": None,
                "pp": None,
                "ppk": None,
                "cp": None,
                "cpk": None,
                "z_score": None,
                "dpmo": None,
                "distinct_spec_count": 0,
                "performance_capability_method": "unknown",
                "mean_out_of_spec_flag": 0,
            }
        ]

    monkeypatch.setattr(spc_analysis_dal, "run_sql_async", fake_run_sql_async)

    rows = asyncio.run(spc_analysis_dal.fetch_scorecard("token", "MAT-1", None, None, None))

    assert rows[0]["spec_type"] == "unspecified"
    assert rows[0]["cpk"] is None
    assert rows[0]["ppk"] is None


def test_fetch_scorecard_marks_out_of_spec_mean_distinctly(monkeypatch):
    async def fake_run_sql_async(_token, _query, _params=None, **_kwargs):
        return [
            {
                "mic_id": "MIC-3",
                "mic_name": "pH",
                "batch_count": 5,
                "sample_count": 20,
                "mean_value": 14.0,
                "stddev_overall": 1.0,
                "min_value": 12.0,
                "max_value": 16.0,
                "nominal_target": 10.0,
                "lsl": 8.0,
                "usl": 12.0,
                "ooc_batches": 4,
                "accepted_batches": 1,
                "ooc_rate": 0.8,
                "sigma_within": 1.0,
                "pp": -0.667,
                "ppk": -0.667,
                "cp": -0.667,
                "cpk": -0.667,
                "z_score": -2.0,
                "dpmo": 933193,
                "distinct_spec_count": 1,
                "performance_capability_method": "parametric",
                "mean_out_of_spec_flag": 1,
            }
        ]

    monkeypatch.setattr(spc_analysis_dal, "run_sql_async", fake_run_sql_async)

    rows = asyncio.run(spc_analysis_dal.fetch_scorecard("token", "MAT-1", None, None, None))

    assert rows[0]["ppk"] < 0
    assert rows[0]["capability_status"] == "out_of_spec_mean"


def _stable_row(ooc_batches: int) -> dict:
    return {
        "mic_id": "MIC-STAB",
        "mic_name": "Temperature",
        "batch_count": 10,
        "sample_count": 30,
        "mean_value": 50.0,
        "stddev_overall": 1.0,
        "min_value": 47.0,
        "max_value": 53.0,
        "nominal_target": 50.0,
        "lsl": 45.0,
        "usl": 55.0,
        "ooc_batches": ooc_batches,
        "accepted_batches": 10 - ooc_batches,
        "ooc_rate": ooc_batches / 10.0,
        "sigma_within": 1.0,
        "pp": 1.67,
        "ppk": 1.67,
        "cp": 1.67,
        "cpk": 1.67,
        "z_score": 5.0,
        "dpmo": 233,
        "distinct_spec_count": 1,
        "performance_capability_method": "parametric",
        "mean_out_of_spec_flag": 0,
    }


def test_fetch_scorecard_marks_stable_when_no_ooc_batches(monkeypatch):
    async def fake_run_sql_async(_token, _query, _params=None, **_kwargs):
        return [_stable_row(ooc_batches=0)]

    monkeypatch.setattr(spc_analysis_dal, "run_sql_async", fake_run_sql_async)
    rows = asyncio.run(spc_analysis_dal.fetch_scorecard("token", "MAT-1", None, None, None))

    assert rows[0]["is_stable"] is True
    assert rows[0]["stability_basis"] == "ooc_batches_rule1_proxy"


def test_fetch_scorecard_marks_unstable_when_any_ooc_batch(monkeypatch):
    async def fake_run_sql_async(_token, _query, _params=None, **_kwargs):
        return [_stable_row(ooc_batches=1)]

    monkeypatch.setattr(spc_analysis_dal, "run_sql_async", fake_run_sql_async)
    rows = asyncio.run(spc_analysis_dal.fetch_scorecard("token", "MAT-1", None, None, None))

    # One OOC batch is a WECO rule-1 violation — capability should be flagged.
    assert rows[0]["is_stable"] is False
    assert rows[0]["stability_basis"] == "ooc_batches_rule1_proxy"


async def test_fetch_process_flow(monkeypatch):
    calls = []
    async def fake_run_sql_async(_token, query, params=None, **kwargs):
        calls.append((query, params or []))
        if "spc_lineage_graph_mv" in query:
            return [{"source": "M1", "target": "M2"}]
        return [{"material_id": "M1", "total_batches": 10, "rejected_batches": 1, "mic_count": 5}]

    monkeypatch.setattr(spc_analysis_dal, "run_sql_async", fake_run_sql_async)
    res = await spc_analysis_dal.fetch_process_flow("token", "MAT-1", None, None)
    assert len(res["nodes"]) > 0
    assert len(res["edges"]) > 0


async def test_fetch_multivariate(monkeypatch):
    async def fake_run_sql_async(_token, query, params=None, **kwargs):
        return [
            {"batch_id": "B1", "batch_date": "2026-04-01", "mic_id": "M1", "mic_name": "NM1", "avg_result": 10.0},
            {"batch_id": "B1", "batch_date": "2026-04-01", "mic_id": "M2", "mic_name": "NM2", "avg_result": 20.0},
        ]
    monkeypatch.setattr(spc_analysis_dal, "run_sql_async", fake_run_sql_async)
    monkeypatch.setattr(spc_analysis_dal, "compute_hotelling_t2", lambda rows, mic_ids: {"scores": []})
    res = await spc_analysis_dal.fetch_multivariate("token", "MAT-1", ["M1", "M2"], None, None, None)
    assert "scores" in res
    assert res["material_id"] == "MAT-1"


async def test_fetch_multivariate_too_large(monkeypatch):
    async def fake_run_sql_async(_token, query, params=None, **kwargs):
        return [{"batch_id": "B1"}] * (spc_analysis_dal._MULTIVARIATE_MAX_SOURCE_ROWS + 1)
    monkeypatch.setattr(spc_analysis_dal, "run_sql_async", fake_run_sql_async)
    import pytest
    with pytest.raises(ValueError, match="too large for interactive analysis"):
        await spc_analysis_dal.fetch_multivariate("token", "MAT-1", ["M1"], None, None, None)


async def test_fetch_compare_scorecard(monkeypatch):
    async def fake_run_sql_async(_token, query, params=None, **kwargs):
        if "spc_quality_metrics" in query:
            return [{"material_id": "M1", "mic_id": "MIC1", "mic_name": "Moisture", "ppk": 1.2, "batch_count": 5, "ooc_rate": 0.0}]
        return [{"material_id": "M1", "material_name": "Name1"}]
    monkeypatch.setattr(spc_analysis_dal, "run_sql_async", fake_run_sql_async)
    res = await spc_analysis_dal.fetch_compare_scorecard("token", ["M1"], None, None, None)
    assert len(res["materials"]) == 1
    assert res["materials"][0]["material_name"] == "Name1"


async def test_save_msa_session(monkeypatch):
    mock_run = AsyncMock(return_value=[])
    monkeypatch.setattr(spc_analysis_dal, "run_sql_async", mock_run)
    res = await spc_analysis_dal.save_msa_session("token", "M1", "MIC1", 2, 2, 2, 10.0, 0.1, 0.1, 5, "{}")
    assert res["saved"] is True
    assert "session_id" in res


async def test_fetch_correlation(monkeypatch):
    async def fake_run_sql_async(_token, query, params=None, **kwargs):
        return [
            {"mic_a": "A", "mic_name_a": "NA", "mic_b": "B", "mic_name_b": "NB", "pearson_r": 0.8, "shared_batches": 10}
        ]
    monkeypatch.setattr(spc_analysis_dal, "run_sql_async", fake_run_sql_async)
    res = await spc_analysis_dal.fetch_correlation("token", "M1", None, None, None, 5)
    assert len(res["pairs"]) == 1
    assert res["pair_count"] == 1
    assert len(res["mics"]) == 2


async def test_fetch_correlation_scatter(monkeypatch):
    async def fake_run_sql_async(_token, query, params=None, **kwargs):
        return [
            {"batch_id": "B1", "batch_date": "2026-04-01", "x": 10.0, "y": 20.0, "mic_a_name": "NX", "mic_b_name": "NY"}
        ]
    monkeypatch.setattr(spc_analysis_dal, "run_sql_async", fake_run_sql_async)
    res = await spc_analysis_dal.fetch_correlation_scatter("token", "M1", "MIC1", "MIC2", None, None, None)
    assert len(res["points"]) == 1
    assert res["n"] == 1
    assert res["mic_a_name"] == "NX"
