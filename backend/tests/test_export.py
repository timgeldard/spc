import json
from fastapi.testclient import TestClient

import backend.main as main_module
import backend.routers.export as export_module


client = TestClient(main_module.app)


def test_openapi_includes_export_route():
    response = client.get("/openapi.json")
    assert response.status_code == 200
    data = response.json()
    assert "/api/spc/export" in data["paths"]


def test_export_scorecard_csv_returns_200(monkeypatch):
    monkeypatch.setattr(export_module, "resolve_token", lambda *_args, **_kwargs: "token")
    monkeypatch.setattr(export_module, "check_warehouse_config", lambda: "/sql/1.0/warehouses/test")

    async def fake_fetch_scorecard(_token, _body):
        return [{
            "mic_id": "MIC-1",
            "mic_name": "Moisture",
            "batch_count": 4,
            "mean_value": 10.1,
            "stddev_overall": 0.2,
            "pp": 1.5,
            "ppk": 1.4,
            "z_score": 4.2,
            "dpmo": 63,
            "ooc_rate": 0.0,
            "capability_status": "good",
        }]

    monkeypatch.setattr(export_module, "_fetch_scorecard", fake_fetch_scorecard)

    response = client.post(
        "/api/spc/export",
        headers={"x-forwarded-access-token": "not-a-real-jwt"},
        json={
            "export_type": "csv",
            "export_scope": "scorecard",
            "material_id": "MAT-1",
        },
    )

    assert response.status_code == 200
    assert response.headers["content-type"].startswith("text/csv")
    assert "attachment; filename=spc_scorecard.csv" == response.headers["content-disposition"]
    body = response.text
    assert "MIC ID,Characteristic" in body
    assert "MIC-1,Moisture" in body


def test_export_attribute_chart_csv_returns_200(monkeypatch):
    monkeypatch.setattr(export_module, "resolve_token", lambda *_args, **_kwargs: "token")
    monkeypatch.setattr(export_module, "check_warehouse_config", lambda: "/sql/1.0/warehouses/test")

    async def fake_fetch_attribute_chart_data(_token, body):
        assert body.operation_id == "OP-10"
        assert body.chart_type == "p_chart"
        return [{
            "batch_id": "B1",
            "batch_date": "2026-04-01",
            "batch_seq": 1,
            "n_inspected": 24,
            "n_nonconforming": 2,
            "p_value": 0.0833,
        }]

    monkeypatch.setattr(export_module, "_fetch_attribute_chart_data", fake_fetch_attribute_chart_data)

    response = client.post(
        "/api/spc/export",
        headers={"x-forwarded-access-token": "not-a-real-jwt"},
        json={
            "export_type": "csv",
            "export_scope": "attribute_chart",
            "material_id": "MAT-1",
            "mic_id": "MIC-1",
            "operation_id": "OP-10",
            "chart_type": "p_chart",
        },
    )

    assert response.status_code == 200
    assert response.headers["content-type"].startswith("text/csv")
    assert response.headers["content-disposition"] == "attachment; filename=spc_attribute_chart_data.csv"
    assert "Batch ID,Batch Date,Batch Seq,Inspected,Nonconforming,P Value" in response.text


def test_export_np_chart_csv_uses_nonconforming_columns(monkeypatch):
    monkeypatch.setattr(export_module, "resolve_token", lambda *_args, **_kwargs: "token")
    monkeypatch.setattr(export_module, "check_warehouse_config", lambda: "/sql/1.0/warehouses/test")

    async def fake_fetch_attribute_chart_data(_token, _body):
        return [{
            "batch_id": "B2",
            "batch_date": "2026-04-02",
            "batch_seq": 2,
            "n_inspected": 30,
            "n_nonconforming": 3,
            "defect_count": 99,
        }]

    monkeypatch.setattr(export_module, "_fetch_attribute_chart_data", fake_fetch_attribute_chart_data)

    response = client.post(
        "/api/spc/export",
        headers={"x-forwarded-access-token": "not-a-real-jwt"},
        json={
            "export_type": "csv",
            "export_scope": "attribute_chart",
            "material_id": "MAT-1",
            "mic_id": "MIC-1",
            "chart_type": "np_chart",
        },
    )

    assert response.status_code == 200
    assert "Batch ID,Batch Date,Batch Seq,Inspected,Nonconforming" in response.text
    assert "B2,2026-04-02,2,30,3" in response.text
    assert "99" not in response.text


def test_export_chart_data_forwards_operation_scope(monkeypatch):
    monkeypatch.setattr(export_module, "resolve_token", lambda *_args, **_kwargs: "token")
    monkeypatch.setattr(export_module, "check_warehouse_config", lambda: "/sql/1.0/warehouses/test")

    async def fake_fetch_chart_data(_token, body):
        assert body.operation_id == "OP-20"
        return [{
            "batch_id": "B1",
            "batch_date": "2026-04-01",
            "batch_seq": 1,
            "sample_seq": 1,
            "value": 10.0,
            "nominal": 10.0,
            "tolerance": 0.1,
            "valuation": "A",
        }]

    monkeypatch.setattr(export_module, "_fetch_chart_data", fake_fetch_chart_data)

    response = client.post(
        "/api/spc/export",
        headers={"x-forwarded-access-token": "not-a-real-jwt"},
        json={
            "export_type": "csv",
            "export_scope": "chart_data",
            "material_id": "MAT-1",
            "mic_id": "MIC-1",
            "operation_id": "OP-20",
        },
    )

    assert response.status_code == 200
    assert response.headers["content-disposition"] == "attachment; filename=spc_chart_data.csv"


def test_export_attribute_chart_requires_chart_type():
    response = client.post(
        "/api/spc/export",
        headers={"x-forwarded-access-token": "not-a-real-jwt"},
        json={
            "export_type": "csv",
            "export_scope": "attribute_chart",
            "material_id": "MAT-1",
            "mic_id": "MIC-1",
        },
    )

    assert response.status_code == 422
    assert "chart_type is required" in response.text


def test_export_scorecard_excel_returns_200(monkeypatch):
    monkeypatch.setattr(export_module, "resolve_token", lambda *_args, **_kwargs: "token")
    monkeypatch.setattr(export_module, "check_warehouse_config", lambda: "/sql/1.0/warehouses/test")

    async def fake_fetch_scorecard(_token, _body):
        return [{
            "mic_id": "MIC-1",
            "mic_name": "Moisture",
            "batch_count": 4,
            "mean_value": 10.1,
            "stddev_overall": 0.2,
            "pp": 1.5,
            "ppk": 1.4,
            "z_score": 4.2,
            "dpmo": 63,
            "ooc_rate": 0.0,
            "capability_status": "good",
        }]

    monkeypatch.setattr(export_module, "_fetch_scorecard", fake_fetch_scorecard)

    response = client.post(
        "/api/spc/export",
        headers={"x-forwarded-access-token": "not-a-real-jwt"},
        json={
            "export_type": "excel",
            "export_scope": "scorecard",
            "material_id": "MAT-1",
        },
    )

    assert response.status_code == 200
    assert "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" in response.headers["content-type"]
    assert "attachment; filename=spc_scorecard.xlsx" == response.headers["content-disposition"]
    # Check that we got some binary content
    assert len(response.content) > 100


def test_export_signals_csv_returns_200(monkeypatch):
    monkeypatch.setattr(export_module, "resolve_token", lambda *_args, **_kwargs: "token")
    monkeypatch.setattr(export_module, "check_warehouse_config", lambda: "/sql/1.0/warehouses/test")

    signals = [
        {"rule": "1", "chart": "X", "indices": [0], "description": "Rule 1 breach"},
        {"rule": "2", "chart": "R", "indices": [1, 2, 3], "description": "Rule 2 breach"},
    ]

    response = client.post(
        "/api/spc/export",
        headers={"x-forwarded-access-token": "not-a-real-jwt"},
        json={
            "export_type": "csv",
            "export_scope": "signals",
            "material_id": "MAT-1",
            "signals_json": json.dumps(signals),
        },
    )

    assert response.status_code == 200
    assert "attachment; filename=spc_signals.csv" == response.headers["content-disposition"]
    assert "Rule 1 breach" in response.text
    assert "Rule 2 breach" in response.text


def test_export_signals_excel_returns_200(monkeypatch):
    monkeypatch.setattr(export_module, "resolve_token", lambda *_args, **_kwargs: "token")
    monkeypatch.setattr(export_module, "check_warehouse_config", lambda: "/sql/1.0/warehouses/test")

    signals = [
        {"rule": "1", "chart": "X", "indices": [0], "description": "Rule 1 breach"},
    ]

    response = client.post(
        "/api/spc/export",
        headers={"x-forwarded-access-token": "not-a-real-jwt"},
        json={
            "export_type": "excel",
            "export_scope": "signals",
            "material_id": "MAT-1",
            "signals_json": json.dumps(signals),
        },
    )

    assert response.status_code == 200
    assert "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" in response.headers["content-type"]
    assert "attachment; filename=spc_signals.xlsx" == response.headers["content-disposition"]


def test_export_rejects_invalid_scope():
    response = client.post(
        "/api/spc/export",
        headers={"x-forwarded-access-token": "jwt"},
        json={
            "export_type": "csv",
            "export_scope": "invalid",
            "material_id": "MAT-1",
        },
    )
    assert response.status_code == 422
    assert "export_scope must be" in response.text


def test_export_signals_requires_valid_json():
    response = client.post(
        "/api/spc/export",
        headers={"x-forwarded-access-token": "jwt"},
        json={
            "export_type": "csv",
            "export_scope": "signals",
            "material_id": "MAT-1",
            "signals_json": "not-json",
        },
    )
    assert response.status_code == 422
    assert "signals_json must be valid JSON" in response.text


def test_export_sanitize_spreadsheet_value():
    from backend.routers.export import sanitize_spreadsheet_value
    assert sanitize_spreadsheet_value("=SUM(A1:A2)") == "'=SUM(A1:A2)"
    assert sanitize_spreadsheet_value("+10") == "'+10"
    assert sanitize_spreadsheet_value("-10") == "'-10"
    assert sanitize_spreadsheet_value("@Something") == "'@Something"
    assert sanitize_spreadsheet_value("Normal Value") == "Normal Value"
    assert sanitize_spreadsheet_value(123) == 123
    assert sanitize_spreadsheet_value("") == ""
    assert sanitize_spreadsheet_value(None) is None
