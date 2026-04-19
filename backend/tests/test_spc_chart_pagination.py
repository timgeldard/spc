import asyncio

from fastapi.testclient import TestClient

import backend.main as main_module
import backend.routers.spc_charts as spc_charts_module
from backend.dal import spc_charts_dal


client = TestClient(main_module.app)


def test_chart_data_returns_paginated_shape(monkeypatch):
    monkeypatch.setattr(spc_charts_module, "resolve_token", lambda *_args, **_kwargs: "token")
    monkeypatch.setattr(spc_charts_module, "check_warehouse_config", lambda: "/sql/1.0/warehouses/test")

    async def fake_fetch_chart_data_page(*_args, **_kwargs):
        return {
            "data": [
                {
                    "batch_id": "B1",
                    "batch_date": "2026-04-01",
                    "sample_seq": 1,
                    "value": 1.23,
                }
            ],
            "next_cursor": "1711929600:B1:1:LOT-1:OP-1",
            "has_more": True,
        }

    async def fake_fetch_normality_summary(*_args, **_kwargs):
        return {"method": "shapiro_wilk", "p_value": None, "alpha": 0.05, "is_normal": True, "warning": None}

    async def passthrough_attach(payload, *_args, **_kwargs):
        return payload

    monkeypatch.setattr(spc_charts_module, "fetch_chart_data_page", fake_fetch_chart_data_page)
    monkeypatch.setattr(spc_charts_module, "fetch_normality_summary", fake_fetch_normality_summary)
    monkeypatch.setattr(spc_charts_module, "attach_data_freshness", passthrough_attach)

    response = client.post(
        "/api/spc/chart-data?limit=1000&include_summary=true",
        headers={"x-forwarded-access-token": "not-a-real-jwt"},
        json={
            "material_id": "MAT-1",
            "mic_id": "MIC-1",
            "mic_name": "Moisture",
            "date_from": None,
            "date_to": None,
            "plant_id": None,
            "stratify_by": None,
        },
    )

    assert response.status_code == 200
    body = response.json()
    assert body["data"][0]["batch_id"] == "B1"
    assert body["next_cursor"] == "1711929600:B1:1:LOT-1:OP-1"
    assert body["has_more"] is True
    assert body["count"] == 1
    assert body["limit"] == 1000
    assert body["normality"]["method"] == "shapiro_wilk"


def test_chart_data_rejects_invalid_cursor(monkeypatch):
    monkeypatch.setattr(spc_charts_module, "resolve_token", lambda *_args, **_kwargs: "token")
    monkeypatch.setattr(spc_charts_module, "check_warehouse_config", lambda: "/sql/1.0/warehouses/test")

    response = client.post(
        "/api/spc/chart-data?cursor=bad-cursor",
        headers={"x-forwarded-access-token": "not-a-real-jwt"},
        json={
            "material_id": "MAT-1",
            "mic_id": "MIC-1",
            "mic_name": "Moisture",
            "date_from": None,
            "date_to": None,
            "plant_id": None,
            "stratify_by": None,
        },
    )

    assert response.status_code == 422
    assert "cursor" in response.json()["detail"]


def test_chart_data_skips_normality_fetch_on_non_initial_pages(monkeypatch):
    monkeypatch.setattr(spc_charts_module, "resolve_token", lambda *_args, **_kwargs: "token")
    monkeypatch.setattr(spc_charts_module, "check_warehouse_config", lambda: "/sql/1.0/warehouses/test")

    async def fake_fetch_chart_data_page(*_args, **_kwargs):
        return {
            "data": [],
            "next_cursor": None,
            "has_more": False,
        }

    async def unexpected_fetch_normality_summary(*_args, **_kwargs):  # pragma: no cover
        raise AssertionError("normality summary query should not run for follow-on pages")

    async def passthrough_attach(payload, *_args, **_kwargs):
        return payload

    monkeypatch.setattr(spc_charts_module, "fetch_chart_data_page", fake_fetch_chart_data_page)
    monkeypatch.setattr(spc_charts_module, "fetch_normality_summary", unexpected_fetch_normality_summary)
    monkeypatch.setattr(spc_charts_module, "attach_data_freshness", passthrough_attach)

    response = client.post(
        "/api/spc/chart-data?limit=1000&include_summary=true&cursor=1711929600:B1:1:LOT-1:OP-1",
        headers={"x-forwarded-access-token": "not-a-real-jwt"},
        json={
            "material_id": "MAT-1",
            "mic_id": "MIC-1",
            "mic_name": "Moisture",
            "date_from": None,
            "date_to": None,
            "plant_id": None,
            "stratify_by": None,
        },
    )

    assert response.status_code == 200
    assert response.json()["normality"] is None


def test_chart_data_survives_spec_drift_summary_failure(monkeypatch):
    monkeypatch.setattr(spc_charts_module, "resolve_token", lambda *_args, **_kwargs: "token")
    monkeypatch.setattr(spc_charts_module, "check_warehouse_config", lambda: "/sql/1.0/warehouses/test")

    async def fake_fetch_chart_data_page(*_args, **_kwargs):
        return {
            "data": [{"batch_id": "B1", "batch_date": "2026-04-01", "sample_seq": 1, "value": 1.23}],
            "next_cursor": None,
            "has_more": False,
        }

    async def fake_fetch_normality_summary(*_args, **_kwargs):
        return {"method": "shapiro_wilk", "p_value": None, "alpha": 0.05, "is_normal": True, "warning": None}

    async def failing_fetch_spec_drift_summary(*_args, **_kwargs):
        raise RuntimeError("warehouse side-car summary unavailable")

    async def passthrough_attach(payload, *_args, **_kwargs):
        return payload

    monkeypatch.setattr(spc_charts_module, "fetch_chart_data_page", fake_fetch_chart_data_page)
    monkeypatch.setattr(spc_charts_module, "fetch_normality_summary", fake_fetch_normality_summary)
    monkeypatch.setattr(spc_charts_module, "fetch_spec_drift_summary", failing_fetch_spec_drift_summary)
    monkeypatch.setattr(spc_charts_module, "attach_data_freshness", passthrough_attach)

    response = client.post(
        "/api/spc/chart-data?include_summary=true",
        headers={"x-forwarded-access-token": "not-a-real-jwt"},
        json={"material_id": "MAT-1", "mic_id": "MIC-1"},
    )

    assert response.status_code == 200
    assert response.json()["spec_drift"] is None


def test_encode_and_decode_chart_cursor_round_trip():
    cursor = spc_charts_dal.encode_chart_cursor(1711929600, "BATCH:01", "SAMPLE/1", "LOT:9", "OP/4")
    assert cursor == "1711929600:BATCH%3A01:SAMPLE%2F1:LOT%3A9:OP%2F4"
    assert spc_charts_dal.decode_chart_cursor(cursor) == (
        1711929600,
        "BATCH:01",
        "SAMPLE/1",
        "LOT:9",
        "OP/4",
    )


def test_fetch_chart_data_page_builds_next_cursor_before_row_cleanup(monkeypatch):
    async def fake_run_sql_async(_token, _query, _params=None, **_kwargs):
        return [
            {
                "batch_id": "B1",
                "batch_date": "2026-04-01",
                "sample_seq": "1",
                "attribut": "",
                "value": "1.1",
                "nominal": "1.0",
                "tolerance": "0.1",
                "lsl": None,
                "usl": None,
                "valuation": "A",
                "cursor_batch_date_epoch": 1711929600,
                "cursor_sample_id": "S1",
                "cursor_inspection_lot_id": "LOT-1",
                "cursor_operation_id": "OP-1",
            },
            {
                "batch_id": "B1",
                "batch_date": "2026-04-01",
                "sample_seq": "2",
                "attribut": "",
                "value": "1.2",
                "nominal": "1.0",
                "tolerance": "0.1",
                "lsl": None,
                "usl": None,
                "valuation": "A",
                "cursor_batch_date_epoch": 1711929600,
                "cursor_sample_id": "S1",
                "cursor_inspection_lot_id": "LOT-2",
                "cursor_operation_id": "OP-2",
            },
        ]

    monkeypatch.setattr(spc_charts_dal, "run_sql_async", fake_run_sql_async)

    page = asyncio.run(
        spc_charts_dal.fetch_chart_data_page(
            "token",
            "MAT-1",
            "MIC-1",
            None,
            None,
            None,
            None,
            None,
            cursor=None,
            limit=1,
        )
    )

    assert page["has_more"] is True
    assert page["next_cursor"] == "1711929600:B1:S1:LOT-1:OP-1"
    assert "cursor_batch_date_epoch" not in page["data"][0]
    assert "cursor_inspection_lot_id" not in page["data"][0]


def test_fetch_chart_data_page_uses_full_cursor_tie_breakers(monkeypatch):
    captured: dict[str, object] = {}

    async def fake_run_sql_async(_token, query, params=None, **_kwargs):
        captured["query"] = query
        captured["params"] = params or []
        return []

    monkeypatch.setattr(spc_charts_dal, "run_sql_async", fake_run_sql_async)

    asyncio.run(
        spc_charts_dal.fetch_chart_data_page(
            "token",
            "MAT-1",
            "MIC-1",
            None,
            None,
            None,
            None,
            None,
            cursor="1711929600:B1:S1:LOT-9:OP-4",
            limit=1000,
        )
    )

    query = str(captured["query"])
    params = list(captured["params"])
    assert "cursor_inspection_lot_id > :cursor_inspection_lot_id" in query
    assert "cursor_operation_id > :cursor_operation_id" in query
    assert any(param["name"] == "cursor_inspection_lot_id" and param["value"] == "LOT-9" for param in params)
    assert any(param["name"] == "cursor_operation_id" and param["value"] == "OP-4" for param in params)


def test_fetch_chart_data_page_orderby_uses_cursor_columns(monkeypatch):
    """Regression: ORDER BY must use the string-casted cursor columns, NOT the
    raw INSPECTION_LOT_ID / OPERATION_ID, so that keyset pagination does not
    skip rows at page boundaries. Missing samples manifest as missing points
    in the X-R chart (subgroups lose members)."""
    captured: dict[str, object] = {}

    async def fake_run_sql_async(_token, query, params=None, **_kwargs):
        captured["query"] = query
        captured["params"] = params or []
        return []

    monkeypatch.setattr(spc_charts_dal, "run_sql_async", fake_run_sql_async)

    asyncio.run(
        spc_charts_dal.fetch_chart_data_page(
            "token", "MAT-1", "MIC-1", None, None, None, None, None,
            cursor="1711929600:B1:S1:LOT-9:OP-4", limit=1000,
        )
    )

    query = str(captured["query"]).lower()
    # The ORDER BY must reference the cursor-shaped (string-cast) columns so
    # that its sort order matches the cursor WHERE clause. Bare references to
    # INSPECTION_LOT_ID / OPERATION_ID in ORDER BY indicate the old bug.
    order_by_section = query.split("order by", 1)[-1]
    assert "cursor_inspection_lot_id" in order_by_section
    assert "cursor_operation_id" in order_by_section
    # Guard against regression: the raw columns must not appear in ORDER BY.
    # (They do appear earlier in the CTE SELECT, which is fine.)
    # We assert substring absence on the ORDER BY fragment only.
    order_by_only = order_by_section.split("limit", 1)[0]
    assert "`inspection_lot_id`" not in order_by_only
    assert "`operation_id`" not in order_by_only


def test_chart_data_rejects_invalid_stratify_key(monkeypatch):
    monkeypatch.setattr(spc_charts_module, "resolve_token", lambda *_args, **_kwargs: "token")
    monkeypatch.setattr(spc_charts_module, "check_warehouse_config", lambda: "/sql/1.0/warehouses/test")

    response = client.post(
        "/api/spc/chart-data",
        headers={"x-forwarded-access-token": "not-a-real-jwt"},
        json={
            "material_id": "MAT-1",
            "mic_id": "MIC-1",
            "mic_name": "Moisture",
            "stratify_by": "bad_column",
        },
    )

    assert response.status_code == 422
    assert "stratify_by" in str(response.json()["detail"])


def test_control_limits_endpoint_returns_governed_metrics(monkeypatch):
    monkeypatch.setattr(spc_charts_module, "resolve_token", lambda *_args, **_kwargs: "token")
    monkeypatch.setattr(spc_charts_module, "check_warehouse_config", lambda: "/sql/1.0/warehouses/test")

    async def fake_fetch_control_limits(*_args, **_kwargs):
        return {
            "cl": 10.5,
            "ucl": 12.1,
            "lcl": 8.9,
            "sigma_within": 0.4,
            "cpk": 1.33,
            "ppk": 1.21,
        }

    async def passthrough_attach(payload, *_args, **_kwargs):
        return payload

    monkeypatch.setattr(spc_charts_module, "fetch_control_limits", fake_fetch_control_limits)
    monkeypatch.setattr(spc_charts_module, "attach_data_freshness", passthrough_attach)

    response = client.post(
        "/api/spc/control-limits",
        headers={"x-forwarded-access-token": "not-a-real-jwt"},
        json={
            "material_id": "MAT-1",
            "mic_id": "MIC-1",
            "plant_id": "PLANT-1",
            "date_from": "2026-01-01",
            "date_to": "2026-01-31",
            "operation_id": "OP-10",
        },
    )

    assert response.status_code == 200
    assert response.json()["control_limits"] == {
        "cl": 10.5,
        "ucl": 12.1,
        "lcl": 8.9,
        "sigma_within": 0.4,
        "cpk": 1.33,
        "ppk": 1.21,
    }


def test_fetch_chart_data_page_selects_stratify_value(monkeypatch):
    captured: dict[str, object] = {}

    async def fake_run_sql_async(_token, query, params=None, **_kwargs):
        captured["query"] = query
        captured["params"] = params or []
        return []

    monkeypatch.setattr(spc_charts_dal, "run_sql_async", fake_run_sql_async)

    asyncio.run(
        spc_charts_dal.fetch_chart_data_page(
            "token",
            "MAT-1",
            "MIC-1",
            None,
            None,
            None,
            None,
            "operation_id",
            cursor=None,
            limit=1000,
        )
    )

    query = str(captured["query"])
    assert "stratify_value" in query
    assert "CAST(r.OPERATION_ID AS STRING)" in query
