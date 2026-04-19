import asyncio

import pytest

from backend.utils import schema_contract


@pytest.fixture(autouse=True)
def _clear_cache():
    schema_contract.clear_cache()
    yield
    schema_contract.clear_cache()


def _all_columns_row(table_name: str, columns: list[str]) -> list[dict]:
    return [{"table_name": table_name, "column_name": c} for c in columns]


def _full_schema_rows() -> list[dict]:
    contract = schema_contract._load_contract()
    rows: list[dict] = []
    for view, spec in contract["views"].items():
        rows.extend(_all_columns_row(view, list(spec["required_columns"].keys())))
    return rows


def test_assert_gold_view_schema_ok_when_all_columns_present():
    async def fake_run(_token, _query, **kwargs):
        return _full_schema_rows()

    result = asyncio.run(
        schema_contract.assert_gold_view_schema(
            "token", "cat", "schema", run_sql_async=fake_run
        )
    )
    assert result.ok is True
    assert result.missing_views == []
    assert result.missing_columns == {}
    assert result.version == "1"


def test_assert_gold_view_schema_flags_missing_column():
    contract = schema_contract._load_contract()
    rows = _full_schema_rows()
    # Drop TARGET_VALUE from gold_batch_quality_result_v.
    rows = [
        r for r in rows
        if not (r["table_name"] == "gold_batch_quality_result_v" and r["column_name"] == "TARGET_VALUE")
    ]

    async def fake_run(_token, _query, **kwargs):
        return rows

    result = asyncio.run(
        schema_contract.assert_gold_view_schema(
            "token", "cat", "schema", run_sql_async=fake_run
        )
    )
    assert result.ok is False
    assert "gold_batch_quality_result_v" in result.missing_columns
    assert "TARGET_VALUE" in result.missing_columns["gold_batch_quality_result_v"]


def test_assert_gold_view_schema_flags_missing_view():
    rows = [r for r in _full_schema_rows() if r["table_name"] != "gold_material"]

    async def fake_run(_token, _query, **kwargs):
        return rows

    result = asyncio.run(
        schema_contract.assert_gold_view_schema(
            "token", "cat", "schema", run_sql_async=fake_run
        )
    )
    assert result.ok is False
    assert "gold_material" in result.missing_views


def test_assert_gold_view_schema_case_insensitive_on_column_names():
    # Live warehouse might report lowercase, depending on engine settings.
    contract = schema_contract._load_contract()
    rows: list[dict] = []
    for view, spec in contract["views"].items():
        for col in spec["required_columns"].keys():
            rows.append({"table_name": view, "column_name": col.lower()})

    async def fake_run(_token, _query, **kwargs):
        return rows

    result = asyncio.run(
        schema_contract.assert_gold_view_schema(
            "token", "cat", "schema", run_sql_async=fake_run
        )
    )
    assert result.ok is True


def test_assert_gold_view_schema_result_is_cached():
    calls = {"n": 0}

    async def fake_run(_token, _query, **kwargs):
        calls["n"] += 1
        return _full_schema_rows()

    first = asyncio.run(
        schema_contract.assert_gold_view_schema(
            "token", "cat", "schema", run_sql_async=fake_run
        )
    )
    second = asyncio.run(
        schema_contract.assert_gold_view_schema(
            "token", "cat", "schema", run_sql_async=fake_run
        )
    )
    assert first.ok is True and second.ok is True
    # Only one SQL call made due to cache.
    assert calls["n"] == 1


def test_detect_optional_columns_returns_present_subset():
    async def fake_run(_token, _query, **kwargs):
        return [{"column_name": "USAGE_DECISION_CODE"}]

    present = asyncio.run(
        schema_contract.detect_optional_columns(
            "token", "cat", "schema", "gold_batch_quality_result_v",
            run_sql_async=fake_run,
        )
    )
    assert present == {"USAGE_DECISION_CODE"}


def test_detect_optional_columns_empty_when_none_present():
    async def fake_run(_token, _query, **kwargs):
        return []

    present = asyncio.run(
        schema_contract.detect_optional_columns(
            "token", "cat", "schema", "gold_batch_quality_result_v",
            run_sql_async=fake_run,
        )
    )
    assert present == set()


def test_detect_optional_columns_tolerates_probe_failure():
    async def failing(_token, _query):
        raise RuntimeError("information_schema unreachable")

    present = asyncio.run(
        schema_contract.detect_optional_columns(
            "token", "cat", "schema", "gold_batch_quality_result_v",
            run_sql_async=failing,
        )
    )
    # Absence of signal is treated as "column not present" so features stay
    # dormant rather than crashing on unrelated probe flakes.
    assert present == set()


def test_detect_optional_columns_returns_empty_for_view_without_optionals():
    async def fake_run(_token, _query, **kwargs):
        return [{"column_name": "ANYTHING"}]

    # gold_material has no optional_columns in the contract.
    present = asyncio.run(
        schema_contract.detect_optional_columns(
            "token", "cat", "schema", "gold_material",
            run_sql_async=fake_run,
        )
    )
    assert present == set()


def test_clear_cache_forces_requery():
    calls = {"n": 0}

    async def fake_run(_token, _query, **kwargs):
        calls["n"] += 1
        return _full_schema_rows()

    asyncio.run(
        schema_contract.assert_gold_view_schema(
            "token", "cat", "schema", run_sql_async=fake_run
        )
    )
    schema_contract.clear_cache()
    asyncio.run(
        schema_contract.assert_gold_view_schema(
            "token", "cat", "schema", run_sql_async=fake_run
        )
    )
    assert calls["n"] == 2
