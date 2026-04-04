"""
Unit tests for backend/utils/db.py helper functions.

These tests cover the pure helper functions only (sql_param, tbl, hostname,
resolve_token). They do not exercise run_sql or check_warehouse_config because
those require a live Databricks connection.
"""

import os
import pytest
from unittest.mock import patch

from fastapi import HTTPException


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


class TestTbl:
    def test_returns_backtick_qualified_name(self):
        result = tbl("my_table")
        assert result == "`test_catalog`.`test_schema`.`my_table`"

    def test_includes_all_three_parts(self):
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
