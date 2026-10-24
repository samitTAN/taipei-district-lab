"""Public historical election results. No user-level political data."""
import json
from pathlib import Path


def load_election(path: Path) -> dict:
    data = json.loads(path.read_text(encoding="utf-8"))
    if data["id"] != "2022-taipei-council-regional" or len(data["villages"]) != 456 or len(data["stations"]) != 1755:
        raise ValueError("Unexpected election coverage")
    return data


def detail(data: dict, record: dict) -> dict:
    candidates = data["candidates"][str(record["district"]) ]
    return {**record, "election_id": data["id"], "date": data["date"],
            "candidate_results": [
                {**candidate, "votes": votes, "vote_share": round(votes / record["valid"] * 100, 2) if record["valid"] else None}
                for candidate, votes in zip(candidates, record["votes"])
            ]}
