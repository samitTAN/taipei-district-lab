"""FastAPI entry point: uvicorn backend.main:app --reload."""
import json
import os
from functools import lru_cache
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse, HTMLResponse

from backend.legal import LegalRequest, legal_report
from backend.elections import load_election, detail

from backend.domain import LegislatorPlan, BASELINE, NAMES, SEATS, Plan, adjacency, check_plan, VillagePlan, village_catalog, migrate_plan, check_village_plan

ROOT = Path(__file__).resolve().parents[1]


def create_app(data_path: Path | None = None, frontend_dir: Path | None = None, village_path: Path | None = None, election_path: Path | None = None) -> FastAPI:
    data_path = data_path or Path(os.environ.get("DISTRICT_DATA_PATH", ROOT / "data/taipei-districts.json"))
    frontend_dir = frontend_dir or ROOT / "dist"
    village_path = village_path or ROOT / "data/taipei-villages.json"
    election_path = election_path or ROOT / "data/elections/2022-council.json"
    app = FastAPI(
        title="Taipei District Lab API",
        version="0.6.0",
        description="台北市逐里選區探索，方案檢查非法律合規認定。",
    )

    @lru_cache(maxsize=1)
    def geometry():
        try:
            data = json.loads(data_path.read_text(encoding="utf-8"))
            features = data["features"]
            if data["type"] != "FeatureCollection" or len(features) != len(NAMES):
                raise ValueError("Unexpected feature count")
            if {f["properties"]["town"] for f in features} != set(NAMES):
                raise ValueError("Unexpected district coverage")
            adjacency(data)  # Verify that geometry is usable before serving it.
            return data
        except (OSError, ValueError, KeyError, TypeError):
            raise HTTPException(503, "Boundary data unavailable. Run npm run data:prepare.") from None

    @lru_cache(maxsize=1)
    def villages():
        try:
            data = json.loads(village_path.read_text(encoding="utf-8"))
            village_catalog(data)
            return data
        except (OSError, ValueError, KeyError, TypeError):
            raise HTTPException(503, "Official village data unavailable") from None

    @app.get("/api/villages/geometry", tags=["villages"])
    def village_geometry():
        return villages()

    @app.post("/api/plans/migrate", tags=["plans"])
    def migrate(plan: Plan):
        return migrate_plan(plan, villages()).model_dump()

    @app.get("/api/health", tags=["system"])
    def health():
        return {"status": "ok", "version": "0.6.0"}

    @app.get("/api/ready", tags=["system"])
    def ready():
        geometry()
        villages()
        return {"status": "ready"}

    @app.get("/api/districts/current", tags=["districts"])
    def current():
        return {
            "city": "臺北市", "unit": "district", "council_term": 14,
            "assignments": BASELINE, "seats": SEATS,
            "indigenous_districts": [
                {"id": 7, "name": "平地原住民", "seats": 1},
                {"id": 8, "name": "山地原住民", "seats": 1},
            ],
        }

    @app.get("/api/districts/geometry", tags=["districts"])
    def boundaries():
        return geometry()

    @app.get("/api/data/source", tags=["districts"])
    def source():
        return json.loads((ROOT / "data/villages-source.json").read_text(encoding="utf-8"))

    @app.post("/api/plans/validate", tags=["plans"])
    def validate_plan(plan: Plan | VillagePlan | LegislatorPlan):
        if isinstance(plan, VillagePlan):
            try:
                return {"plan": plan.model_dump(), "checks": check_village_plan(plan, villages())}
            except ValueError as error:
                raise HTTPException(422, str(error)) from None
        return {"plan": plan.model_dump(), "checks": check_plan(plan, adjacency(geometry()))}

    @lru_cache(maxsize=1)
    def election():
        try:
            return load_election(election_path)
        except (OSError, ValueError, KeyError, TypeError):
            raise HTTPException(503, "Election data unavailable") from None

    @app.get("/api/elections", tags=["elections"])
    def election_list():
        data = election()
        return [{"id": data["id"], "title": data["title"], "date": data["date"], "scope": data["scope"],
                 "village_count": len(data["villages"]), "station_count": len(data["stations"])} for data in [data, legislative_election()]]

    @app.get("/api/elections/2022-taipei-council-regional", tags=["elections"])
    def all_election_results():
        return election()

    @app.get("/api/elections/2022-taipei-council-regional/villages/{village_id}", tags=["elections"])
    def village_results(village_id: str):
        data = election()
        if village_id not in data["villages"]:
            raise HTTPException(404, "Unknown village")
        return detail(data, data["villages"][village_id])

    @app.get("/api/elections/2022-taipei-council-regional/stations/{station_id}", tags=["elections"])
    def station_results(station_id: str):
        data = election()
        if not station_id.isascii() or not station_id.isdigit() or len(station_id) > 4:
            raise HTTPException(404, "Unknown station")
        station_id = station_id.zfill(4)
        if station_id not in data["stations"]:
            raise HTTPException(404, "Unknown station")
        return detail(data, data["stations"][station_id])

    @lru_cache(maxsize=1)
    def legislative_election():
        try:
            return load_election(ROOT / "data/elections/2024-legislator.json")
        except (OSError, ValueError, KeyError, TypeError):
            raise HTTPException(503, "Legislator election data unavailable") from None

    @app.get("/api/legislator/current", tags=["legislator"])
    def legislative_current():
        return json.loads((ROOT / "data/legislator-config.json").read_text(encoding="utf-8"))

    @app.get("/api/elections/2024-taipei-legislator-regional", tags=["elections"])
    def legislative_results():
        return legislative_election()

    @app.get("/api/elections/2024-taipei-legislator-regional/villages/{village_id}", tags=["elections"])
    def legislative_village(village_id: str):
        data = legislative_election()
        if village_id not in data["villages"]:
            raise HTTPException(404, "Unknown village")
        return detail(data, data["villages"][village_id])

    @app.get("/api/elections/2024-taipei-legislator-regional/stations/{station_id}", tags=["elections"])
    def legislative_station(station_id: str):
        data = legislative_election()
        if not station_id.isascii() or not station_id.isdigit() or len(station_id) > 4:
            raise HTTPException(404, "Unknown station")
        station_id = station_id.zfill(4)
        if station_id not in data["stations"]:
            raise HTTPException(404, "Unknown station")
        return detail(data, data["stations"][station_id])

    @app.get("/api/legal/rules", tags=["legal"])
    def legal_rules(office: str = "council"):
        if office not in {"council", "legislator"}:
            raise HTTPException(422, "Unknown office")
        try:
            return json.loads((ROOT / ("data/legal-legislator.json" if office == "legislator" else "data/legal-rules.json")).read_text(encoding="utf-8"))
        except (OSError, ValueError):
            raise HTTPException(503, "Legal rules unavailable") from None

    @app.post("/api/legal/check", tags=["legal"])
    def legal_check(request: LegalRequest):
        try:
            return legal_report(request, villages(), legal_rules("legislator" if isinstance(request.plan, LegislatorPlan) else "council"))
        except ValueError as error:
            raise HTTPException(422, str(error)) from None

    @app.get("/", response_class=HTMLResponse, include_in_schema=False)
    def index():
        try:
            html = (frontend_dir / "index.html").read_text(encoding="utf-8")
        except OSError:
            raise HTTPException(503, "Frontend unavailable. Run npm run build.") from None
        return html.replace("</head>", '<script>globalThis.DISTRICT_API="/api";</script></head>')

    # Explicit allowlist: never expose source, environment files, or arbitrary paths.
    @app.get("/{asset}", include_in_schema=False)
    def asset(asset: str):
        if asset not in {"app.js", "style.css"}:
            raise HTTPException(404, "Not found")
        path = frontend_dir / asset
        if not path.is_file():
            raise HTTPException(404, "Not found")
        return FileResponse(path)

    return app


app = create_app()
