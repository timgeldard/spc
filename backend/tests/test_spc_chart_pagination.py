from fastapi.testclient import TestClient

import backend.main as main_module
import backend.routers.spc_charts as spc_charts_module


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
                    "batch_seq": 1,
                    "sample_seq": 1,
                    "value": 1.23,
                }
            ],
            "next_cursor": "1:1",
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
    assert body["next_cursor"] == "1:1"
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
        "/api/spc/chart-data?limit=1000&include_summary=true&cursor=1:1",
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
