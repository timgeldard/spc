import asyncio

import pytest

from backend.dal import spc_analysis_dal
from backend.utils.multivariate import compute_hotelling_t2


def test_compute_hotelling_t2_flags_injected_multivariate_anomaly():
    rows = []
    for i in range(12):
        batch_id = f"B-{i:02d}"
        base_temp = 50.0 + (i * 0.2)
        base_pressure = 100.0 + (i * 0.3)
        if i == 11:
            base_temp += 18.0
            base_pressure += 24.0

        rows.append({
            "batch_id": batch_id,
            "batch_date": f"2026-01-{i + 1:02d}",
            "mic_id": "TEMP",
            "mic_name": "Temperature",
            "avg_result": base_temp,
        })
        rows.append({
            "batch_id": batch_id,
            "batch_date": f"2026-01-{i + 1:02d}",
            "mic_id": "PRESS",
            "mic_name": "Pressure",
            "avg_result": base_pressure,
        })

    result = compute_hotelling_t2(rows, ["TEMP", "PRESS"], alpha=0.05)

    assert result["n_observations"] == 12
    assert result["n_variables"] == 2
    assert result["ucl"] > 0
    assert result["correlation"]["pair_count"] == 1
    assert result["anomalies"]
    top = result["anomalies"][0]
    assert top["batch_id"] == "B-11"
    contributor_ids = [item["mic_id"] for item in top["top_contributors"]]
    assert contributor_ids == ["PRESS", "TEMP"] or contributor_ids == ["TEMP", "PRESS"]


def test_fetch_multivariate_rejects_oversized_source_payload(monkeypatch):
    async def fake_run_sql_async(_token, _query, _params=None, **kwargs):
        return [{"batch_id": f"B-{i}", "batch_date": "2026-01-01", "mic_id": "TEMP", "mic_name": "Temperature", "avg_result": 1.0} for i in range(spc_analysis_dal._MULTIVARIATE_MAX_SOURCE_ROWS + 1)]

    monkeypatch.setattr(spc_analysis_dal, "run_sql_async", fake_run_sql_async)

    with pytest.raises(ValueError, match="too large for interactive analysis"):
        asyncio.run(
            spc_analysis_dal.fetch_multivariate(
                "token",
                "MAT-1",
                ["TEMP", "PRESS"],
                None,
                None,
                None,
            )
        )
