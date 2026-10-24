"""Bounded legal preflight: explicit findings and unknowns, never a legality certificate."""
from datetime import date
from typing import Literal

from pydantic import BaseModel, ConfigDict, StrictBool, field_validator, model_validator

from backend.domain import Plan, VillagePlan, check_village_plan, migrate_plan


class LegalRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    plan: Plan | VillagePlan
    check_deadline: StrictBool = False
    election_year: Literal[2026, 2030] = 2030
    publication_date: date | None = None

    @field_validator("election_year", mode="before")
    @classmethod
    def strict_year(cls, value):
        if type(value) is not int:
            raise ValueError("Election year must be integer 2026 or 2030")
        return value

    @field_validator("publication_date", mode="before")
    @classmethod
    def iso_date(cls, value):
        if value is None or type(value) is date:
            return value
        if not isinstance(value, str) or len(value) != 10:
            raise ValueError("Use YYYY-MM-DD")
        parsed = date.fromisoformat(value)
        if parsed.isoformat() != value:
            raise ValueError("Use YYYY-MM-DD")
        return parsed

    @model_validator(mode="after")
    def deadline_context(self):
        if self.check_deadline and self.publication_date is None:
            raise ValueError("Publication date required for deadline check")
        return self


def legal_report(request: LegalRequest, geo: dict, rules: dict) -> dict:
    plan = migrate_plan(request.plan, geo) if isinstance(request.plan, Plan) else request.plan
    checks = check_village_plan(plan, geo)
    towns = {}
    for feature in geo["features"]:
        p = feature["properties"]
        value = plan.assignments[p["id"]]
        if value:
            towns.setdefault(p["town"], set()).add(value)
    split = sorted(town for town, assigned in towns.items() if len(assigned) > 1)
    deadline = f"{request.election_year - 1}-12-25" if request.check_deadline else None
    late = request.check_deadline and request.publication_date.isoformat() > deadline
    statuses = {
        "coverage": "issue" if not checks["complete"] else "checked",
        "administrative": "review" if split else "checked",
        "connectivity": "review" if not checks["connected"] else "checked",
        "population": "unknown", "seats": "unknown",
        "deadline": "issue" if late else "checked" if request.check_deadline else "not_checked",
        "authority": "review",
    }
    return {
        "ruleset": rules["id"], "checked_on": rules["checked_on"],
        "legal_compliance_assessed": False,
        "conclusion": "issues_found" if "issue" in statuses.values() else "requires_review",
        "items": [{**item, "status": statuses[item["id"]], "source": rules["sources"][item["source"]]} for item in rules["items"]],
        "facts": {"unassigned_count": len(checks["unassigned"]), "empty_districts": checks["empty_districts"],
                  "split_towns": split, "disconnected_districts": checks["disconnected_districts"],
                  "deadline": deadline, "publication_date": request.publication_date.isoformat() if request.check_deadline else None,
                  "term_end": f"{request.election_year}-12-25" if request.check_deadline else None},
        "limitations": rules["limitations"],
    }
