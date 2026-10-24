import json

from fastapi.testclient import TestClient

from backend.main import ROOT, create_app


def test_public_election_api():
    client = TestClient(create_app())
    path = "/api/elections/2022-taipei-council-regional"
    entry = client.get("/api/elections").json()[0]
    assert entry["station_count"] == 1755 and entry["village_count"] == 456
    data = client.get(path).json()
    station = client.get(path + "/stations/1").json()
    assert station["id"] == "0001"
    assert station["location"]["address"] == "文林北路77號"
    assert sum(c["votes"] for c in station["candidate_results"]) == station["valid"]
    village = client.get(path + "/villages/" + station["village_id"]).json()
    assert "0001" in village["station_ids"]
    assert len(village["candidate_results"]) == 25
    assert station["date"] == "2022-11-26"
    assert data["summary"] == {"valid": 1330504, "invalid": 30994, "ballots": 1361498, "eligible": 2008789, "turnout": 67.78}
    for suffix in ["/villages/unknown", "/stations/9999", "/stations/hello", "/stations/１２"]:
        assert client.get(path + suffix).status_code == 404


def test_election_missing_data_is_explicit(tmp_path):
    client = TestClient(create_app(election_path=tmp_path / "missing.json"))
    assert client.get("/api/elections").status_code == 503
    assert client.get("/api/villages/geometry").status_code == 200


def test_all_election_results_reconcile():
    data = json.loads((ROOT / "data/elections/2022-council.json").read_text())
    villages, stations = data["villages"], data["stations"]
    geo = json.loads((ROOT / "data/taipei-villages.json").read_text())
    assert set(villages) == {f["properties"]["id"] for f in geo["features"]}
    assert sum(len(cs) for cs in data["candidates"].values()) == 112
    assert sum(c["elected"] for cs in data["candidates"].values() for c in cs) == 59
    assigned = []
    for village_id, village in villages.items():
        ss = [stations[s] for s in village["station_ids"]]
        assigned += village["station_ids"]
        assert all(s["village_id"] == village_id for s in ss)
        for field in ["valid", "invalid", "ballots", "eligible"]:
            assert sum(s[field] for s in ss) == village[field]
        assert [sum(s["votes"][i] for s in ss) for i in range(len(village["votes"]))] == village["votes"]
        assert sum(village["votes"]) == village["valid"]
    assert len(assigned) == len(set(assigned)) == len(stations) == 1755
    for station in stations.values():
        assert sum(station["votes"]) == station["valid"]
        assert station["valid"] + station["invalid"] == station["ballots"] <= station["eligible"]
        assert station["location"]["name"] and station["location"]["address"]
    for field in ["valid", "invalid", "ballots", "eligible"]:
        assert sum(v[field] for v in villages.values()) == data["summary"][field]
    assert next(v for v in villages.values() if v["village"] == "糖廍里")["town"] == "萬華區"
