"""Build verified 2022 Taipei regional council village/station results from CEC sources."""
import argparse
import csv
import hashlib
import io
import json
import re
from pathlib import Path
from zipfile import ZipFile

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "data/elections/2022-council-source.json"


def checksum(raw, expected):
    if hashlib.sha256(raw).hexdigest() != expected:
        raise ValueError("Source checksum mismatch: review the new source before importing")


def extract_locations(pdf_path):
    import pdfplumber  # Only required when rebuilding source data.
    out = {}
    clean = lambda text: re.sub(r"\s+", "", text or "")
    with pdfplumber.open(pdf_path) as pdf:
        for page_number, page in enumerate(pdf.pages, 1):
            for table in page.extract_tables():
                for row in table:
                    if len(row) < 6 or not (row[0] or "").strip().isdigit():
                        continue
                    key = f"{int(row[0].strip()):04}"
                    if key in out:
                        raise ValueError(f"Duplicate station location {key}")
                    out[key] = {"name": clean(row[1]), "address": clean(row[2]),
                                "coverage": clean(row[3]), "town": clean(row[5]) + "區",
                                "source_page": page_number}
    if set(out) != {f"{n:04}" for n in range(1, 1756)}:
        raise ValueError("Expected precisely 1755 station location records")
    return out


def decoded_member(name):
    try:
        return name.encode("cp437").decode("big5", errors="replace")
    except UnicodeEncodeError:
        return name


def prepare(zip_path, locations):
    source = json.loads(SOURCE.read_text(encoding="utf-8"))
    raw = zip_path.read_bytes()
    checksum(raw, source["sha256"])
    archive = ZipFile(io.BytesIO(raw))
    rows = {}
    for name, entry in source["members"].items():
        # The source ZIP encodes its Chinese member paths as Big5 without the UTF-8 flag.
        member = next(n for n in archive.namelist() if decoded_member(n) == entry["path"])
        content = archive.read(member)
        checksum(content, entry["sha256"])
        rows[name] = list(csv.reader(io.StringIO(content.decode("utf-8-sig"))))
    geography = json.loads((ROOT / "data/taipei-villages.json").read_text(encoding="utf-8"))
    lookup = {(f["properties"]["town"], f["properties"]["village"]): f["properties"]["id"] for f in geography["features"]}
    base = {tuple(r[:5]): r[5].replace("糖\ue02d里", "糖蔀里") for r in rows["elbase.csv"] if r[0] == "63"}
    parties = {r[0]: r[1] for r in rows["elpaty.csv"] if len(r) == 2}
    candidates = {}
    for r in rows["elcand.csv"]:
        if r[0] != "63":
            continue
        district = str(int(r[2]))
        candidates.setdefault(district, []).append({"number": int(r[5]), "name": r[6], "party": parties[r[7]], "elected": r[14].strip() in {"*", "!"}})
    for cs in candidates.values():
        cs.sort(key=lambda c: c["number"])
    villages, stations = {}, {}
    aggregates = {}
    city_summary = None
    for r in rows["elprof.csv"]:
        if r[0] != "63":
            continue
        stats = {"valid": int(r[6]), "invalid": int(r[7]), "ballots": int(r[8]), "eligible": int(r[9])}
        if stats["valid"] + stats["invalid"] != stats["ballots"] or stats["ballots"] > stats["eligible"]:
            raise ValueError("Invalid official ballot accounting")
        stats["turnout"] = round(stats["ballots"] / stats["eligible"] * 100, 2) if stats["eligible"] else None
        if r[2] == "00" and r[3] == "000":
            city_summary = stats
        if r[4] == "0000":
            if r[3] == "000" and r[2] != "00":
                aggregates[str(int(r[2]))] = stats
            continue
        town = base[tuple(r[:4] + ["0000"])]
        village = base[tuple(r[:5])]
        village_id = lookup[(town, village)]
        district = str(int(r[2]))
        record = {**stats, "village_id": village_id, "district": int(district), "votes": [0] * len(candidates[district])}
        if r[5] == "0000":
            if village_id in villages:
                raise ValueError("Duplicate village")
            villages[village_id] = {**record, "town": town, "village": village.replace("糖蔀里", "糖廍里"), "station_ids": []}
        else:
            if r[5] in stations or locations[r[5]]["town"] not in {town, "區"}:
                raise ValueError("Station ID/location district mismatch")
            stations[r[5]] = {**record, "id": r[5], "location": {**locations[r[5]], "town": town}}
    if len(villages) != 456 or len(stations) != 1755 or sum(map(len, candidates.values())) != 112:
        raise ValueError("Unexpected regional election coverage")
    seen = set()
    totals = {d: [0] * len(cs) for d, cs in candidates.items()}
    for r in rows["elctks.csv"]:
        if r[0] != "63":
            continue
        district = str(int(r[2])); number = int(r[6]); votes = int(r[7])
        key = tuple(r[:7])
        if key in seen or votes < 0:
            raise ValueError("Duplicate or negative candidate vote record")
        seen.add(key)
        index = next(i for i, c in enumerate(candidates[district]) if c["number"] == number)
        if r[3] == "000" and r[4] == "0000" and r[5] == "0000":
            totals[district][index] = votes
        elif r[4] != "0000":
            if r[5] != "0000":
                record = stations[r[5]]
            else:
                town = base[tuple(r[:4] + ["0000"])]; village = base[tuple(r[:5])]
                record = villages[lookup[(town, village)]]
            record["votes"][index] = votes
    for station in stations.values():
        villages[station["village_id"]]["station_ids"].append(station["id"])
    for v in villages.values():
        v["station_ids"].sort()
        ss = [stations[key] for key in v["station_ids"]]
        if not ss or sum(v["votes"]) != v["valid"]:
            raise ValueError("Missing station or village vote mismatch")
        for field in ["valid", "invalid", "ballots", "eligible"]:
            if sum(s[field] for s in ss) != v[field]:
                raise ValueError(f"Station/village {field} reconciliation failed")
        if [sum(s["votes"][i] for s in ss) for i in range(len(v["votes"]))] != v["votes"]:
            raise ValueError("Station/village candidate reconciliation failed")
    for d, total in totals.items():
        vs = [v for v in villages.values() if v["district"] == int(d)]
        if [sum(v["votes"][i] for v in vs) for i in range(len(total))] != total:
            raise ValueError("Village/district candidate reconciliation failed")
        if sum(total) != aggregates[d]["valid"]:
            raise ValueError("District vote total mismatch")
    for field in ["valid", "invalid", "ballots", "eligible"]:
        if sum(v[field] for v in villages.values()) != city_summary[field]:
            raise ValueError("Village/city reconciliation failed")
    return {"id": source["id"], "title": source["title"], "date": source["date"],
            "map_dataset_version": geography["dataset_version"], "scope": "regional", "summary": city_summary,
            "candidates": candidates, "villages": villages, "stations": stations,
            "sources": {"results": source["catalog"], "archive": source["url"], "locations": source["locations"]["announcement"], "location_date": source["locations"]["announcement_date"]}}


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--results-zip", type=Path, required=True)
    parser.add_argument("--locations-pdf", type=Path, required=True)
    args = parser.parse_args()
    source = json.loads(SOURCE.read_text(encoding="utf-8"))
    checksum(args.locations_pdf.read_bytes(), source["locations"]["sha256"])
    data = prepare(args.results_zip, extract_locations(args.locations_pdf))
    (ROOT / "data/elections/2022-council.json").write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"Verified {len(data['villages'])} villages, {len(data['stations'])} stations, 112 candidates; station/village/district/city sums reconcile.")
