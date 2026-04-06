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

    async def fake_fetch_chart_data_values(*_args, **_kwargs):
        return [1.23, 1.25, 1.22]

    async def passthrough_attach(payload, *_args, **_kwargs):
        return payload

    monkeypatch.setattr(spc_charts_module, "fetch_chart_data_page", fake_fetch_chart_data_page)
    monkeypatch.setattr(spc_charts_module, "fetch_chart_data_values", fake_fetch_chart_data_values)
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
            "stratify_all": False,
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
            "stratify_all": False,
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

    async def unexpected_fetch_chart_data_values(*_args, **_kwargs):  # pragma: no cover
        raise AssertionError("normality values query should not run for follow-on pages")

    async def passthrough_attach(payload, *_args, **_kwargs):
        return payload

    monkeypatch.setattr(spc_charts_module, "fetch_chart_data_page", fake_fetch_chart_data_page)
    monkeypatch.setattr(spc_charts_module, "fetch_chart_data_values", unexpected_fetch_chart_data_values)
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
            "stratify_all": False,
        },
    )

    assert response.status_code == 200
    assert response.json()["normality"] is None


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
    async def fake_run_sql_async(_token, _query, _params=None):
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
            False,
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

    async def fake_run_sql_async(_token, query, params=None):
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
            False,
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
