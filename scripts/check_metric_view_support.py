#!/usr/bin/env python3
"""Canary support check for Databricks metric views.

Creates and drops a temporary metric view in the requested catalog/schema.
This is more reliable than parsing current_version() output because Databricks
SQL reports DBSQL engine versions rather than DBR-style semantic versions.
"""

from __future__ import annotations

import argparse
import json
import subprocess
import sys
import time
import uuid


def build_statement(catalog: str, schema: str, name: str, genie_metadata: bool) -> str:
    version = "1.1" if genie_metadata else "1.0"
    dimension_display_name = "\n    display_name: Canary ID" if genie_metadata else ""
    measure_display_name = "\n    display_name: Canary Count" if genie_metadata else ""
    return f"""CREATE OR REPLACE VIEW `{catalog}`.`{schema}`.`{name}`
WITH METRICS
LANGUAGE YAML
AS $$
version: {version}
comment: "Codex metric-view support canary"
source: SELECT 1 AS canary_id

dimensions:
  - name: canary_id
    expr: canary_id{dimension_display_name}

measures:
  - name: canary_count
    expr: COUNT(1){measure_display_name}
$$"""


def run_statement(profile: str, warehouse_id: str, statement: str) -> dict:
    payload = json.dumps(
        {
            "warehouse_id": warehouse_id,
            "statement": statement,
            "wait_timeout": "30s",
        }
    )
    proc = subprocess.run(
        [
            "databricks",
            "api",
            "post",
            "/api/2.0/sql/statements",
            "--profile",
            profile,
            "--json",
            payload,
            "-o",
            "json",
        ],
        capture_output=True,
        text=True,
        check=False,
    )
    if proc.returncode != 0:
        raise RuntimeError(proc.stderr.strip() or proc.stdout.strip() or "databricks api post failed")
    return json.loads(proc.stdout)


def extract_error(result: dict) -> str:
    status = result.get("status", {})
    error = status.get("error") or {}
    return error.get("message") or status.get("message") or "Unknown metric view support error"


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--catalog", required=True)
    parser.add_argument("--schema", required=True)
    parser.add_argument("--warehouse-id", required=True)
    parser.add_argument("--profile", required=True)
    parser.add_argument("--genie-metadata", default="true")
    args = parser.parse_args()

    genie_metadata = args.genie_metadata.lower() == "true"
    canary_name = f"spc_metric_view_canary_{int(time.time())}_{uuid.uuid4().hex[:8]}"
    create_sql = build_statement(args.catalog, args.schema, canary_name, genie_metadata)
    drop_sql = f"DROP VIEW IF EXISTS `{args.catalog}`.`{args.schema}`.`{canary_name}`"

    create_error: str | None = None
    try:
        result = run_statement(args.profile, args.warehouse_id, create_sql)
        state = (result.get("status") or {}).get("state")
        if state != "SUCCEEDED":
            create_error = extract_error(result)
            lowered = create_error.lower()
            if "permission" in lowered or "not authorized" in lowered or "privilege" in lowered:
                print(
                    "Metric-view canary failed due to privileges: "
                    f"{create_error}\n"
                    "Grant CREATE TABLE/USE SCHEMA/USE CATALOG as required and retry.",
                    file=sys.stderr,
                )
            elif genie_metadata:
                print(
                    "Metric-view canary failed with Genie metadata enabled: "
                    f"{create_error}\n"
                    "Retry with GENIE_METADATA=false to test baseline metric-view support.",
                    file=sys.stderr,
                )
            else:
                print(f"Metric-view canary failed: {create_error}", file=sys.stderr)
            return 1

        print(
            "Metric-view support check passed "
            f"({'with' if genie_metadata else 'without'} Genie metadata)."
        )
        return 0
    finally:
        try:
            run_statement(args.profile, args.warehouse_id, drop_sql)
        except Exception as exc:  # pragma: no cover - best-effort cleanup
            if create_error is None:
                print(f"Warning: failed to clean up metric-view canary: {exc}", file=sys.stderr)


if __name__ == "__main__":
    raise SystemExit(main())
