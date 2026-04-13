"""
Unit tests for backend/utils/db.py helper functions.

These tests cover the pure helper functions only (sql_param, tbl, hostname,
resolve_token). They do not exercise run_sql or check_warehouse_config because
those require a live Databricks connection.
"""

import os
import asyncio
import pytest
from unittest.mock import patch

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

    def test_run_sql_async_clears_cache_after_write(self):
        db_module._clear_sql_cache()
        cache_key = db_module._sql_cache_key("token", "SELECT 1", None)
        with db_module._sql_cache_lock:
            db_module._sql_cache[cache_key] = [{"cached": True}]

        with patch("backend.utils.db.run_sql", return_value=[]) as mocked_run_sql:
            asyncio.run(db_module.run_sql_async("token", "INSERT INTO t VALUES (1)"))

        mocked_run_sql.assert_called_once()
        with db_module._sql_cache_lock:
            assert db_module._sql_cache.get(cache_key) is None
