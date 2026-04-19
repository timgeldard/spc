import asyncio

from backend.dal import spc_metadata_dal


def _characteristic_row(**overrides):
    base = {
        "mic_id": "MIC-A",
        "operation_id": "OP-1",
        "mic_name": "Viscosity",
        "mic_name_normalized": "VISCOSITY",
        "inspection_method": "GAUGE",
        "unified_mic_key": "PLANT-1||VISCOSITY||NO_UNIT",
        "is_attribute": 0,
        "has_quantitative": 1,
        "batch_count": 10,
        "total_samples": 10,
    }
    base.update(overrides)
    return base


def _fake_runner(characteristics_rows, override_rows=None, attribute_rows=None):
    """Build a fake run_sql_async that returns characteristics for the main query
    and overrides for the config-table lookup. The lookup is identified by its
    FROM clause referencing spc_mic_chart_config."""

    async def _run(_token, query, _params=None, **_kwargs):
        if "spc_mic_chart_config" in query:
            return override_rows or []
        if "spc_attribute_quality_metrics" in query:
            return attribute_rows or []
        return characteristics_rows

    return _run


def test_fetch_characteristics_applies_heuristic_when_no_override(monkeypatch):
    rows = [_characteristic_row(total_samples=10, batch_count=10)]  # avg_spb=1.0 → imr
    monkeypatch.setattr(spc_metadata_dal, "run_sql_async", _fake_runner(rows, []))
    chars, _ = asyncio.run(spc_metadata_dal.fetch_characteristics("token", "MAT-1", "PLANT-1"))

    assert chars[0]["chart_type"] == "imr"
    assert chars[0]["chart_type_source"] == "heuristic"


def test_fetch_characteristics_prefers_override_over_heuristic(monkeypatch):
    rows = [_characteristic_row(total_samples=10, batch_count=10)]  # heuristic says imr
    overrides = [
        {"mic_id": "MIC-A", "chart_type": "xbar_s", "plant_id": "PLANT-1", "material_id": "MAT-1"},
    ]
    monkeypatch.setattr(spc_metadata_dal, "run_sql_async", _fake_runner(rows, overrides))
    chars, _ = asyncio.run(spc_metadata_dal.fetch_characteristics("token", "MAT-1", "PLANT-1"))

    assert chars[0]["chart_type"] == "xbar_s"
    assert chars[0]["chart_type_source"] == "override"


def test_fetch_characteristics_more_specific_override_wins(monkeypatch):
    rows = [_characteristic_row(total_samples=10, batch_count=10)]
    overrides = [
        # Global: would set to xbar_r
        {"mic_id": "MIC-A", "chart_type": "xbar_r", "plant_id": None, "material_id": None},
        # Material-specific: would set to imr
        {"mic_id": "MIC-A", "chart_type": "imr", "plant_id": None, "material_id": "MAT-1"},
        # Plant+material-specific: should WIN with xbar_s
        {"mic_id": "MIC-A", "chart_type": "xbar_s", "plant_id": "PLANT-1", "material_id": "MAT-1"},
    ]
    monkeypatch.setattr(spc_metadata_dal, "run_sql_async", _fake_runner(rows, overrides))
    chars, _ = asyncio.run(spc_metadata_dal.fetch_characteristics("token", "MAT-1", "PLANT-1"))

    assert chars[0]["chart_type"] == "xbar_s"
    assert chars[0]["chart_type_source"] == "override"


def test_fetch_characteristics_ignores_unknown_override_chart_type(monkeypatch):
    rows = [_characteristic_row(total_samples=10, batch_count=10)]
    overrides = [
        {"mic_id": "MIC-A", "chart_type": "not_a_real_chart", "plant_id": None, "material_id": None},
    ]
    monkeypatch.setattr(spc_metadata_dal, "run_sql_async", _fake_runner(rows, overrides))
    chars, _ = asyncio.run(spc_metadata_dal.fetch_characteristics("token", "MAT-1", "PLANT-1"))

    # Falls back to heuristic when override value is invalid.
    assert chars[0]["chart_type"] == "imr"
    assert chars[0]["chart_type_source"] == "heuristic"


def test_fetch_characteristics_swallows_missing_config_table(monkeypatch):
    """If migration 019 has not run yet, the lookup raises and we fall back."""
    rows = [_characteristic_row(total_samples=30, batch_count=10)]  # avg_spb=3.0 → xbar_r

    async def _run(_token, query, _params=None, **_kwargs):
        if "spc_mic_chart_config" in query:
            raise RuntimeError("Table not found: spc_mic_chart_config")
        if "spc_attribute_quality_metrics" in query:
            return []
        return rows

    monkeypatch.setattr(spc_metadata_dal, "run_sql_async", _run)
    chars, _ = asyncio.run(spc_metadata_dal.fetch_characteristics("token", "MAT-1", "PLANT-1"))

    assert chars[0]["chart_type"] == "xbar_r"
    assert chars[0]["chart_type_source"] == "heuristic"


def test_fetch_characteristics_override_applies_to_attribute_charts_too(monkeypatch):
    attr_row = {
        "mic_id": "MIC-A",
        "operation_id": "OP-1",
        "mic_name": "Viscosity",
        "inspection_method": "GAUGE",
        "batch_count": 10,
        "total_inspected": 100,
        "total_nonconforming": 5,
        "p_bar": 0.05,
        "chart_type": "p_chart",
    }
    overrides = [
        {"mic_id": "MIC-A", "chart_type": "u_chart", "plant_id": None, "material_id": "MAT-1"},
    ]
    monkeypatch.setattr(spc_metadata_dal, "run_sql_async", _fake_runner([], overrides, [attr_row]))
    _, attr_chars = asyncio.run(spc_metadata_dal.fetch_characteristics("token", "MAT-1", "PLANT-1"))

    assert attr_chars[0]["chart_type"] == "u_chart"
    assert attr_chars[0]["chart_type_source"] == "override"


def test_fetch_characteristics_attribute_override_rejects_variable_chart_type(monkeypatch):
    attr_row = {
        "mic_id": "MIC-A",
        "operation_id": "OP-1",
        "mic_name": "Viscosity",
        "inspection_method": "GAUGE",
        "batch_count": 10,
        "total_inspected": 100,
        "total_nonconforming": 5,
        "p_bar": 0.05,
        "chart_type": "p_chart",
    }
    overrides = [
        # Nonsense: trying to force an attribute MIC to a variable chart.
        {"mic_id": "MIC-A", "chart_type": "imr", "plant_id": None, "material_id": "MAT-1"},
    ]
    monkeypatch.setattr(spc_metadata_dal, "run_sql_async", _fake_runner([], overrides, [attr_row]))
    _, attr_chars = asyncio.run(spc_metadata_dal.fetch_characteristics("token", "MAT-1", "PLANT-1"))

    assert attr_chars[0]["chart_type"] == "p_chart"
    assert attr_chars[0]["chart_type_source"] == "default"
