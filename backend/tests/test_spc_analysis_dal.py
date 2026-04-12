import asyncio

from backend.dal import spc_analysis_dal


def test_fetch_scorecard_queries_metric_view_and_preserves_capability_fields(monkeypatch):
    calls = []

    async def fake_run_sql_async(_token, query, params=None):
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
    async def fake_run_sql_async(_token, _query, _params=None):
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
    async def fake_run_sql_async(_token, _query, _params=None):
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
