#!/usr/bin/env python3
"""Release 1 live Databricks validation harness.

Runs a small set of real-warehouse smoke checks for:
  1. metric-view support and scorecard measures
  2. multivariate source viability + Hotelling T² computation

Auth is taken from environment variables:
  DATABRICKS_HOST
  DATABRICKS_TOKEN
  DATABRICKS_WAREHOUSE_ID

Optional:
  TRACE_CATALOG (default: connected_plant_uat)
  TRACE_SCHEMA  (default: gold)
"""

from __future__ import annotations

import json
import os
import sys
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any
from urllib import error, request

REPO_ROOT = Path(__file__).resolve().parents[1]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from backend.utils.multivariate import compute_hotelling_t2


@dataclass
class DatabricksConfig:
    host: str
    token: str
    warehouse_id: str
    catalog: str
    schema: str


def get_config() -> DatabricksConfig:
    host = os.getenv("DATABRICKS_HOST", "").rstrip("/")
    token = os.getenv("DATABRICKS_TOKEN", "")
    warehouse_id = os.getenv("DATABRICKS_WAREHOUSE_ID", "")
    catalog = os.getenv("TRACE_CATALOG", "connected_plant_uat")
    schema = os.getenv("TRACE_SCHEMA", "gold")

    missing = [name for name, value in [
        ("DATABRICKS_HOST", host),
        ("DATABRICKS_TOKEN", token),
        ("DATABRICKS_WAREHOUSE_ID", warehouse_id),
    ] if not value]
    if missing:
        raise SystemExit(f"Missing required environment variables: {', '.join(missing)}")

    return DatabricksConfig(host=host, token=token, warehouse_id=warehouse_id, catalog=catalog, schema=schema)


def statements_url(config: DatabricksConfig) -> str:
    return f"{config.host}/api/2.0/sql/statements"


def auth_headers(config: DatabricksConfig) -> dict[str, str]:
    return {
        "Authorization": f"Bearer {config.token}",
        "Content-Type": "application/json",
    }


def wait_for_statement(config: DatabricksConfig, statement_id: str, timeout_s: int = 60) -> dict[str, Any]:
    deadline = time.time() + timeout_s
    url = f"{statements_url(config)}/{statement_id}"
    while time.time() < deadline:
        payload = http_json("GET", url, config)
        state = (payload.get("status") or {}).get("state")
        if state in {"SUCCEEDED", "FAILED", "CANCELED", "CLOSED"}:
            return payload
        time.sleep(1)
    raise TimeoutError(f"Timed out waiting for Databricks SQL statement {statement_id}")


def http_json(method: str, url: str, config: DatabricksConfig, payload: dict[str, Any] | None = None) -> dict[str, Any]:
    body = None if payload is None else json.dumps(payload).encode("utf-8")
    req = request.Request(url, data=body, method=method)
    for key, value in auth_headers(config).items():
        req.add_header(key, value)
    try:
        with request.urlopen(req, timeout=30) as response:
            return json.loads(response.read().decode("utf-8"))
    except error.HTTPError as exc:
        message = exc.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"Databricks HTTP {exc.code}: {message}") from exc


def run_sql(config: DatabricksConfig, sql: str) -> dict[str, Any]:
    payload = {
        "warehouse_id": config.warehouse_id,
        "statement": sql,
        "wait_timeout": "30s",
    }
    result = http_json("POST", statements_url(config), config, payload)
    state = (result.get("status") or {}).get("state")
    if state == "SUCCEEDED":
        return result
    if state not in {"FAILED", "CANCELED", "CLOSED"}:
        result = wait_for_statement(config, result["statement_id"])
        state = (result.get("status") or {}).get("state")
    if state != "SUCCEEDED":
        message = ((result.get("status") or {}).get("error") or {}).get("message") or json.dumps(result)
        raise RuntimeError(f"Databricks SQL failed: {message}")
    return result


def data_rows(result: dict[str, Any]) -> list[list[Any]]:
    return (result.get("result") or {}).get("data_array") or []


def first_value(result: dict[str, Any]) -> Any:
    rows = data_rows(result)
    if not rows or not rows[0]:
        return None
    return rows[0][0]


def validate_metric_view(config: DatabricksConfig) -> dict[str, Any]:
    sample_material_sql = f"""
        SELECT material_id
        FROM `{config.catalog}`.`{config.schema}`.`spc_quality_metrics`
        GROUP BY material_id
        HAVING COUNT(*) > 0
        ORDER BY material_id
        LIMIT 1
    """
    sample_material = first_value(run_sql(config, sample_material_sql))
    if not sample_material:
        raise RuntimeError("No metric-view material found in spc_quality_metrics")

    scorecard_sql = f"""
        SELECT
            material_id,
            mic_id,
            mic_name,
            MEASURE(batch_count) AS batch_count,
            MEASURE(rejected_batches) AS rejected_batches,
            MEASURE(ooc_rate) AS ooc_rate,
            MEASURE(ppk) AS ppk,
            MEASURE(cpk) AS cpk
        FROM `{config.catalog}`.`{config.schema}`.`spc_quality_metrics`
        WHERE material_id = '{sample_material}'
        GROUP BY ALL
        HAVING MEASURE(batch_count) >= 3
        ORDER BY MEASURE(batch_count) DESC, mic_name
        LIMIT 10
    """
    scorecard = run_sql(config, scorecard_sql)
    rows = data_rows(scorecard)
    if not rows:
        raise RuntimeError(f"Metric-view smoke test returned no scorecard rows for material {sample_material}")

    return {
        "sample_material_id": sample_material,
        "row_count": len(rows),
        "first_row": rows[0],
    }


def validate_multivariate(config: DatabricksConfig) -> dict[str, Any]:
    candidate_sql = f"""
        SELECT material_id
        FROM `{config.catalog}`.`{config.schema}`.`spc_correlation_source_v`
        GROUP BY material_id
        HAVING COUNT(DISTINCT mic_id) >= 2 AND COUNT(DISTINCT batch_id) >= 8
        ORDER BY COUNT(DISTINCT batch_id) DESC, material_id
        LIMIT 1
    """
    sample_material = first_value(run_sql(config, candidate_sql))
    if not sample_material:
        raise RuntimeError("No multivariate candidate material found in spc_correlation_source_v")

    mic_sql = f"""
        SELECT mic_id
        FROM `{config.catalog}`.`{config.schema}`.`spc_correlation_source_v`
        WHERE material_id = '{sample_material}'
        GROUP BY mic_id
        ORDER BY COUNT(DISTINCT batch_id) DESC, mic_id
        LIMIT 2
    """
    mic_rows = data_rows(run_sql(config, mic_sql))
    selected_mics = [row[0] for row in mic_rows if row and row[0]]
    if len(selected_mics) < 2:
        raise RuntimeError(f"Material {sample_material} does not have 2 usable MICs for multivariate validation")

    row_sql = f"""
        SELECT
            batch_id,
            CAST(batch_date AS STRING) AS batch_date,
            mic_id,
            mic_name,
            avg_result
        FROM `{config.catalog}`.`{config.schema}`.`spc_correlation_source_v`
        WHERE material_id = '{sample_material}'
          AND mic_id IN ('{selected_mics[0]}', '{selected_mics[1]}')
        ORDER BY batch_date, batch_id, mic_id
    """
    rows = data_rows(run_sql(config, row_sql))
    if not rows:
        raise RuntimeError(f"No multivariate source rows returned for material {sample_material}")

    records = [
        {
            "batch_id": row[0],
            "batch_date": row[1],
            "mic_id": row[2],
            "mic_name": row[3],
            "avg_result": row[4],
        }
        for row in rows
    ]
    result = compute_hotelling_t2(records, selected_mics)
    return {
        "sample_material_id": sample_material,
        "selected_mics": selected_mics,
        "n_observations": result["n_observations"],
        "n_anomalies": len(result["anomalies"]),
        "ucl": result["ucl"],
    }


def main() -> int:
    config = get_config()
    summary = {
        "catalog": config.catalog,
        "schema": config.schema,
        "warehouse_id": config.warehouse_id,
        "metric_view": validate_metric_view(config),
        "multivariate": validate_multivariate(config),
    }
    print(json.dumps(summary, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
