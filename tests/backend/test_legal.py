import pytest
from fastapi.testclient import TestClient

from backend.main import create_app
from backend.domain import BASELINE


@pytest.fixture
def client():
    return TestClient(create_app())


@pytest.fixture
def payload(client):
    v1 = {"version": 1, "city": "臺北市", "unit": "district", "name": "法規初檢測試", "count": 6, "assignments": BASELINE}
    return {"plan": client.post("/api/plans/migrate", json=v1).json(), "check_deadline": False, "election_year": 2030}


def statuses(report):
    return {item["id"]: item["status"] for item in report["items"]}


def test_no_false_legal_pass(client, payload):
    rules = client.get("/api/legal/rules").json()
    report = client.post("/api/legal/check", json=payload).json()
    assert report["ruleset"] == rules["id"]
    assert report["legal_compliance_assessed"] is False
    assert report["conclusion"] == "requires_review"
    assert statuses(report)["population"] == statuses(report)["seats"] == "unknown"
    assert statuses(report)["authority"] == "review"
    assert statuses(report)["deadline"] == "not_checked"
    assert all(item["source"]["url"].startswith("https://") for item in report["items"])


def test_split_town_is_review_not_automatic_illegality(client, payload):
    plan = payload["plan"]
    key = next(key for key, value in plan["assignments"].items() if value == 1)
    plan["assignments"][key] = 2
    report = client.post("/api/legal/check", json=payload).json()
    assert report["facts"]["split_towns"]
    assert statuses(report)["administrative"] == "review"
    assert report["conclusion"] == "requires_review"


@pytest.mark.parametrize("year,publication,status", [
    (2026, "2025-12-25", "checked"), (2026, "2025-12-26", "issue"),
    (2026, "2026-10-24", "issue"), (2030, "2026-10-24", "checked"),
])
def test_deadline_boundary(client, payload, year, publication, status):
    payload.update(check_deadline=True, election_year=year, publication_date=publication)
    report = client.post("/api/legal/check", json=payload).json()
    assert statuses(report)["deadline"] == status
    assert report["facts"]["deadline"] == f"{year - 1}-12-25"
    assert report["legal_compliance_assessed"] is False


def test_incomplete_draft_is_reported(client, payload):
    payload["plan"]["assignments"][next(iter(payload["plan"]["assignments"]))] = 0
    report = client.post("/api/legal/check", json=payload).json()
    assert statuses(report)["coverage"] == "issue"
    assert report["facts"]["unassigned_count"] == 1


@pytest.mark.parametrize("updates", [
    {"check_deadline": True}, {"check_deadline": True, "publication_date": "2026-13-01"},
    {"publication_date": 1}, {"publication_date": "2026-W43-6"}, {"election_year": True}, {"election_year": 2026.0},
    {"election_year": 2028}, {"check_deadline": "true"},
])
def test_invalid_legal_context(client, payload, updates):
    payload.update(updates)
    assert client.post("/api/legal/check", json=payload).status_code == 422


def test_wrong_dataset_rejected(client, payload):
    payload["plan"]["dataset_version"] = "other"
    assert client.post("/api/legal/check", json=payload).status_code == 422
