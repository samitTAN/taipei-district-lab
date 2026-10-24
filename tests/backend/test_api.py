import pytest
from fastapi.testclient import TestClient

from backend.domain import BASELINE
from backend.main import create_app


@pytest.fixture
def client():
    return TestClient(create_app())


@pytest.fixture
def plan():
    return {"version": 1, "city": "臺北市", "unit": "district", "name": "測試方案",
            "count": 6, "assignments": BASELINE.copy()}


def test_current_and_geometry(client):
    assert client.get("/api/health").json()["status"] == "ok"
    assert client.get("/api/ready").status_code == 200
    current = client.get("/api/districts/current").json()
    assert current["assignments"] == BASELINE
    assert sum(current["seats"]) == 59
    geometry = client.get("/api/districts/geometry").json()
    assert len(geometry["features"]) == 12
    assert client.get("/api/data/source").json()["sha256"]


def test_validation_and_connectivity(client, plan):
    response = client.post("/api/plans/validate", json=plan)
    assert response.status_code == 200
    result = response.json()
    assert result["plan"] == plan
    assert result["checks"]["complete"] and result["checks"]["connected"]
    assert not result["checks"]["legal_compliance_assessed"]
    plan["assignments"]["北投區"] = 2
    assert client.post("/api/plans/validate", json=plan).json()["checks"]["disconnected_districts"] == [2]
    plan["assignments"]["北投區"] = 0
    assert client.post("/api/plans/validate", json=plan).json()["checks"]["unassigned"] == ["北投區"]


@pytest.mark.parametrize("field,value", [("count", 13), ("count", True), ("count", "6"),
    ("version", True), ("version", 2), ("name", "x" * 61), ("unit", "village"), ("city", "高雄市")])
def test_reject_invalid_schema(client, plan, field, value):
    plan[field] = value
    assert client.post("/api/plans/validate", json=plan).status_code == 422


@pytest.mark.parametrize("assignments", [{}, {**BASELINE, "不存在區": 1},
    {**BASELINE, "北投區": -1}, {**BASELINE, "北投區": 7}, {**BASELINE, "北投區": True}])
def test_reject_invalid_assignments(client, plan, assignments):
    plan["assignments"] = assignments
    assert client.post("/api/plans/validate", json=plan).status_code == 422


def test_missing_geometry(tmp_path):
    client = TestClient(create_app(data_path=tmp_path / "missing.json"))
    assert client.get("/api/health").status_code == 200
    assert client.get("/api/ready").status_code == 503
    assert client.get("/api/districts/geometry").status_code == 503


def test_bad_geometry(tmp_path):
    file = tmp_path / "invalid.json"
    file.write_text('{"type":"FeatureCollection","features":[]}', encoding="utf-8")
    assert TestClient(create_app(data_path=file)).get("/api/districts/geometry").status_code == 503


def test_frontend_and_api_docs(client):
    assert 'globalThis.DISTRICT_API="/api"' in client.get("/").text
    assert client.get("/app.js").status_code == 200
    assert client.get("/style.css").status_code == 200
    assert client.get("/.env").status_code == 404
    assert client.get("/README.md").status_code == 404
    assert "/api/plans/validate" in client.get("/openapi.json").json()["paths"]


def test_missing_frontend(tmp_path):
    assert TestClient(create_app(frontend_dir=tmp_path)).get("/").status_code == 503
