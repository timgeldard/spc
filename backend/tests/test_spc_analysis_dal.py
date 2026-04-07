import asyncio

from backend.dal import spc_analysis_dal


def test_fetch_scorecard_uses_sample_stddev_and_calculates_cpk(monkeypatch):
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
                "tolerance_half_width": 3.0,
                "lsl_spec": None,
                "usl_spec": None,
                "ooc_batches": 0,
                "accepted_batches": 5,
                "distinct_nominal_count": 1,
                "distinct_tolerance_count": 1,
                "r_bar": 1.128,
                "avg_n": 2.0,
            }
        ]

    monkeypatch.setattr(spc_analysis_dal, "run_sql_async", fake_run_sql_async)

    rows = asyncio.run(spc_analysis_dal.fetch_scorecard("token", "MAT-1", None, None, None))

    query, _params = calls[0]
    assert "STDDEV_SAMP" in query
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
                "tolerance_half_width": None,
                "lsl_spec": None,
                "usl_spec": None,
                "ooc_batches": 0,
                "accepted_batches": 5,
                "distinct_nominal_count": 0,
                "distinct_tolerance_count": 0,
                "r_bar": None,
                "avg_n": None,
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
                "tolerance_half_width": 2.0,
                "lsl_spec": None,
                "usl_spec": None,
                "ooc_batches": 4,
                "accepted_batches": 1,
                "distinct_nominal_count": 1,
                "distinct_tolerance_count": 1,
                "r_bar": 1.128,
                "avg_n": 2.0,
            }
        ]

    monkeypatch.setattr(spc_analysis_dal, "run_sql_async", fake_run_sql_async)

    rows = asyncio.run(spc_analysis_dal.fetch_scorecard("token", "MAT-1", None, None, None))

    assert rows[0]["ppk"] < 0
    assert rows[0]["capability_status"] == "out_of_spec_mean"
