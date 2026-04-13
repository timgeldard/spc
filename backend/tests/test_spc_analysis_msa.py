from fastapi.testclient import TestClient

from backend.main import app


client = TestClient(app)


def test_msa_calculate_requires_token():
    response = client.post(
        "/api/spc/msa/calculate",
        json={
            "measurement_data": [[[10, 10], [20, 20]], [[10, 10], [20, 20]]],
            "tolerance": 20,
            "method": "average_range",
        },
    )

    assert response.status_code == 401


def test_msa_calculate_returns_grr_payload():
    response = client.post(
        "/api/spc/msa/calculate",
        headers={"x-forwarded-access-token": "token"},
        json={
            "measurement_data": [[[10, 10], [20, 20]], [[10, 10], [20, 20]]],
            "tolerance": 20,
            "method": "average_range",
        },
    )

    assert response.status_code == 200
    body = response.json()
    assert body["method"] == "average_range"
    assert body["ev"] == 0
    assert body["grr"] == 0
    assert body["pv"] > 0


def test_msa_calculate_rejects_inconsistent_cube():
    response = client.post(
        "/api/spc/msa/calculate",
        headers={"x-forwarded-access-token": "token"},
        json={
            "measurement_data": [[[10, 10], [20]], [[10, 10], [20, 20]]],
            "tolerance": 20,
            "method": "average_range",
        },
    )

    assert response.status_code == 422
