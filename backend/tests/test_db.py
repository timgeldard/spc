"""
Unit tests for backend/utils/db.py helper functions.

These tests cover the pure helper functions only (sql_param, tbl, hostname,
resolve_token). They do not exercise run_sql or check_warehouse_config because
those require a live Databricks connection.
"""

import os
import asyncio
import pytest
from unittest.mock import patch, AsyncMock

from fastapi import HTTPException
import backend.utils.db as db_module


# Provide defaults so the module can be imported without env vars set
os.environ.setdefault("DATABRICKS_HOST", "https://adb-test.azuredatabricks.net/")
os.environ.setdefault("DATABRICKS_WAREHOUSE_HTTP_PATH", "/sql/1.0/warehouses/abc123")
os.environ.setdefault("TRACE_CATALOG", "test_catalog")
os.environ.setdefault("TRACE_SCHEMA", "test_schema")

from backend.utils.db import (
    check_warehouse_config,
    get_data_freshness,
    hostname,
    resolve_token,
    sql_param,
    tbl,
)


class TestSqlParam:
    def test_returns_name_value_type(self):
        result = sql_param("my_param", "my_value")
        assert result == {"name": "my_param", "value": "my_value", "type": "STRING"}

    def test_converts_non_string_value_to_string(self):
        result = sql_param("count", 42)
        assert result["value"] == "42"
        assert result["type"] == "STRING"

    def test_handles_empty_string_value(self):
        result = sql_param("empty", "")
        assert result["value"] == ""

    def test_preserves_none_as_sql_null(self):
        result = sql_param("maybe_null", None)
        assert result == {"name": "maybe_null", "value": None, "type": "STRING"}


class TestTbl:
    def test_returns_backtick_qualified_name(self):
        with patch("backend.utils.db.TRACE_CATALOG", "test_catalog"), patch("backend.utils.db.TRACE_SCHEMA", "test_schema"):
            result = tbl("my_table")
            assert result == "`test_catalog`.`test_schema`.`my_table`"

    def test_includes_all_three_parts(self):
        with patch("backend.utils.db.TRACE_CATALOG", "test_catalog"), patch("backend.utils.db.TRACE_SCHEMA", "test_schema"):
            result = tbl("gold_batch_quality_result_v")
            assert "test_catalog" in result
            assert "test_schema" in result
            assert "gold_batch_quality_result_v" in result


class TestHostname:
    def test_strips_https_scheme(self):
        result = hostname()
        assert not result.startswith("https://")

    def test_strips_trailing_slash(self):
        result = hostname()
        assert not result.endswith("/")

    def test_returns_bare_hostname(self):
        with patch("backend.utils.db.DATABRICKS_HOST", "https://adb-test.azuredatabricks.net/"):
            result = hostname()
            assert result == "adb-test.azuredatabricks.net"


class TestResolveToken:
    def test_returns_forwarded_token_when_present(self):
        token = resolve_token("forwarded-token", None)
        assert token == "forwarded-token"

    def test_extracts_bearer_token_from_authorization(self):
        token = resolve_token(None, "Bearer my-bearer-token")
        assert token == "my-bearer-token"

    def test_prefers_forwarded_over_bearer(self):
        token = resolve_token("forwarded", "Bearer bearer")
        assert token == "forwarded"

    def test_raises_401_when_no_token(self):
        with pytest.raises(HTTPException) as exc_info:
            resolve_token(None, None)
        assert exc_info.value.status_code == 401

    def test_raises_401_when_authorization_not_bearer(self):
        with pytest.raises(HTTPException) as exc_info:
            resolve_token(None, "Basic dXNlcjpwYXNz")
        assert exc_info.value.status_code == 401


class TestCheckWarehouseConfig:
    def test_returns_http_path_when_set(self):
        with patch("backend.utils.db.WAREHOUSE_HTTP_PATH", "/sql/1.0/warehouses/abc123"):
            result = check_warehouse_config()
            assert result == "/sql/1.0/warehouses/abc123"

    def test_raises_500_when_not_set(self):
        with patch("backend.utils.db.WAREHOUSE_HTTP_PATH", ""):
            with pytest.raises(HTTPException) as exc_info:
                check_warehouse_config()
            assert exc_info.value.status_code == 500


class TestGetDataFreshness:
    def test_returns_empty_sources_when_no_safe_views(self):
        result = get_data_freshness("token", ["bad-view-name"])
        assert result["sources"] == []

    def test_queries_information_schema_for_safe_views(self):
        mock_rows = [{"source_view": "gold_batch_quality_result_v", "last_altered_utc": "2026-01-01"}]
        with patch("backend.utils.db.run_sql", return_value=mock_rows) as mocked_run_sql:
            result = get_data_freshness("token", ["gold_batch_quality_result_v"])
            assert result["sources"] == mock_rows
            mocked_run_sql.assert_called_once()


class TestSqlCacheBehavior:
    def test_statement_prefix_detects_read_only_and_write(self):
        assert db_module._is_read_only_statement("SELECT 1")
        assert db_module._is_read_only_statement("  WITH cte AS (SELECT 1) SELECT * FROM cte")
        assert db_module._is_write_statement("INSERT INTO t VALUES (1)")
        assert not db_module._is_read_only_statement("INSERT INTO t VALUES (1)")

    def test_sql_cache_tier_classifies_known_hot_paths(self):
        assert db_module._sql_cache_tier("SELECT * FROM connected_plant_uat.gold.spc_characteristic_dim_mv") == "metadata"
        assert db_module._sql_cache_tier("SELECT * FROM connected_plant_uat.gold.spc_quality_metrics") == "scorecard"
        assert db_module._sql_cache_tier("SELECT * FROM connected_plant_uat.gold.spc_batch_dim_mv") == "chart"

    def test_run_sql_async_clears_cache_after_write(self):
        db_module._clear_sql_cache()
        cache_key = db_module._sql_cache_key("token", "SELECT 1", None)
        with db_module._metadata_cache_lock:
            db_module._metadata_cache[cache_key] = [{"cached": "metadata"}]
        with db_module._scorecard_cache_lock:
            db_module._scorecard_cache[cache_key] = [{"cached": "scorecard"}]
        with db_module._chart_cache_lock:
            db_module._chart_cache[cache_key] = [{"cached": "chart"}]

        with patch("backend.utils.db.run_sql", return_value=[]) as mocked_run_sql:
            asyncio.run(db_module.run_sql_async("token", "INSERT INTO t VALUES (1)", audit=False))

        mocked_run_sql.assert_called_once()
        with db_module._metadata_cache_lock:
            assert db_module._metadata_cache.get(cache_key) is None
        with db_module._scorecard_cache_lock:
            assert db_module._scorecard_cache.get(cache_key) is None
        with db_module._chart_cache_lock:
            assert db_module._chart_cache.get(cache_key) is None

    def test_run_sql_async_emits_query_audit_for_uncached_read(self):
        captured = []

        async def fake_insert_query_audit(token, *, endpoint, params, row_count, duration_ms):
            captured.append({
                "token": token,
                "endpoint": endpoint,
                "params": params,
                "row_count": row_count,
                "duration_ms": duration_ms,
            })

        async def exercise():
            db_module._clear_sql_cache()
            with patch("backend.utils.db.run_sql", return_value=[{"ok": 1}]), patch(
                "backend.utils.db.insert_spc_query_audit",
                fake_insert_query_audit,
            ):
                rows = await db_module.run_sql_async(
                    "token",
                    "SELECT * FROM test_catalog.test_schema.spc_batch_dim_mv WHERE material_id = :material_id",
                    [db_module.sql_param("material_id", "MAT-1")],
                    endpoint_hint="spc.charts.chart-data",
                )
                await asyncio.sleep(0)
                return rows

        rows = asyncio.run(exercise())

        assert rows == [{"ok": 1}]
        assert captured
        assert captured[0]["endpoint"] == "spc.charts.chart-data"
        assert captured[0]["row_count"] == 1

    def test_run_sql_async_skips_query_audit_for_query_audit_table(self):
        captured = []

        async def fake_insert_query_audit(*_args, **_kwargs):
            captured.append("called")

        async def exercise():
            with patch("backend.utils.db.run_sql", return_value=[]), patch(
                "backend.utils.db.insert_spc_query_audit",
                fake_insert_query_audit,
            ):
                await db_module.run_sql_async(
                    "token",
                    f"INSERT INTO {db_module.tbl('spc_query_audit')} (query_id) VALUES ('1')",
                )
                await asyncio.sleep(0)

        asyncio.run(exercise())
        assert captured == []


class TestSqlRuntimeTuning:
    def test_statement_prefix_runtime_constants_are_configurable(self):
        assert db_module._SQL_MAX_WORKERS >= 1
        assert db_module._SQL_POLL_MAX_ATTEMPTS >= 1
        assert db_module._SQL_POLL_INITIAL_DELAY_S >= 1
        assert db_module._SQL_POLL_MAX_DELAY_S >= db_module._SQL_POLL_INITIAL_DELAY_S


class TestSqlExecutorSelection:
    def test_normalize_statement_for_connector_preserves_parameter_order(self):
        statement, positional = db_module._normalize_statement_for_connector(
            "SELECT * FROM t WHERE material_id = :material_id AND plant_id = :plant_id AND material_id <> :material_id",
            [
                db_module.sql_param("material_id", "MAT-1"),
                db_module.sql_param("plant_id", "PLANT-2"),
            ],
        )

        assert statement == "SELECT * FROM t WHERE material_id = ? AND plant_id = ? AND material_id <> ?"
        assert positional == ["MAT-1", "PLANT-2", "MAT-1"]

    def test_normalize_statement_for_connector_rejects_missing_parameter(self):
        with pytest.raises(RuntimeError, match="Missing SQL parameter 'material_id'"):
            db_module._normalize_statement_for_connector("SELECT * FROM t WHERE material_id = :material_id", [])

    def test_get_sql_executor_returns_rest_by_default(self):
        with patch.dict("os.environ", {}, clear=False):
            executor = db_module._get_sql_executor()
        assert isinstance(executor, db_module._RestStatementExecutor)

    def test_get_sql_executor_falls_back_to_rest_when_connector_missing(self):
        with patch.dict("os.environ", {"SPC_SQL_EXECUTOR": "connector"}, clear=False), patch("backend.utils.db.databricks_sql", None):
            executor = db_module._get_sql_executor()
        assert isinstance(executor, db_module._RestStatementExecutor)

class TestErrorClassifiers:
    def test_classify_sql_runtime_error_maps_403(self):
        exc = Exception("PERMISSION DENIED: Access denied")
        err = db_module.classify_sql_runtime_error(exc)
        assert err.status_code == 403

    def test_classify_sql_runtime_error_maps_401(self):
        exc = Exception("UNAUTHORIZED: Invalid token")
        err = db_module.classify_sql_runtime_error(exc)
        assert err.status_code == 401

    def test_classify_sql_runtime_error_maps_503_for_missing_table(self):
        exc = Exception("TABLE OR VIEW NOT FOUND")
        err = db_module.classify_sql_runtime_error(exc, missing_table_detail="Init required")
        assert err.status_code == 503
        assert err.detail == "Init required"

class TestObservability:
    def test_increment_observability_counter(self, caplog):
        with caplog.at_level("INFO"):
            db_module.increment_observability_counter("test.counter", tags={"t1": "v1"})
            assert "metric.increment name=test.counter" in caplog.text
            assert '"t1":"v1"' in caplog.text

    def test_send_operational_alert(self, caplog):
        with caplog.at_level("WARNING"):
            db_module.send_operational_alert(subject="Sub", body="Body")
            assert "operational_alert.pending" in caplog.text
            assert "subject=Sub" in caplog.text

async def test_attach_data_freshness_success():
    payload = {"data": 1}
    token = "token"
    views = ["v1"]
    mock_freshness = {"sources": [{"source_view": "v1", "last_altered_utc": "2026"}]}
    
    with patch("backend.utils.db.get_data_freshness", return_value=mock_freshness):
        res = await db_module.attach_data_freshness(payload, token, views)
        assert res["data_freshness"] == mock_freshness

async def test_insert_spc_audit_event(monkeypatch):
    mock_run = AsyncMock(return_value=[])
    monkeypatch.setattr(db_module, "run_sql_async", mock_run)
    
    await db_module.insert_spc_audit_event("token", event_type="test", detail={"material_id": "M1"})
    assert mock_run.called
    assert "INSERT INTO" in mock_run.call_args[0][1]

async def test_insert_spc_exclusion_snapshot(monkeypatch):
    mock_run = AsyncMock(return_value=[])
    monkeypatch.setattr(db_module, "run_sql_async", mock_run)
    
    payload = {
        "event_id": "uuid", "material_id": "M1", "mic_id": "MIC1", "chart_type": "imr",
        "justification": "test", "excluded_count": 1, "excluded_points": []
    }
    await db_module.insert_spc_exclusion_snapshot("token", payload)
    assert mock_run.called
