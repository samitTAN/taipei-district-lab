"""District plan schema and geometry-based checks, independent of HTTP."""
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, StrictInt, field_validator, model_validator

NAMES = (
    "北投區", "士林區", "內湖區", "南港區", "松山區", "信義區",
    "中山區", "大同區", "中正區", "萬華區", "大安區", "文山區",
)
BASELINE = {name: index // 2 + 1 for index, name in enumerate(NAMES)}
SEATS = (12, 9, 9, 8, 8, 13)


class Plan(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    version: Literal[1]
    city: Literal["臺北市"]
    unit: Literal["district"]
    name: Annotated[str, Field(max_length=60)]
    count: Annotated[StrictInt, Field(ge=1, le=12)]
    assignments: dict[str, StrictInt]

    @field_validator("version", mode="before")
    @classmethod
    def strict_version(cls, value):
        if type(value) is not int:
            raise ValueError("version must be integer 1")
        return value

    @model_validator(mode="after")
    def check_assignments(self):
        if type(self.version) is not int:
            raise ValueError("version must be integer 1")
        if set(self.assignments) != set(NAMES):
            raise ValueError("assignments must contain exactly the 12 Taipei districts")
        if any(value < 0 or value > self.count for value in self.assignments.values()):
            raise ValueError("assignments must be between 0 and count")
        return self


def adjacency(geojson: dict) -> dict[str, set[str]]:
    owners: dict[tuple, set[str]] = {}
    graph = {name: set() for name in NAMES}
    for feature in geojson["features"]:
        name = feature["properties"]["town"]
        geometry = feature["geometry"]
        polygons = geometry["coordinates"] if geometry["type"] == "MultiPolygon" else [geometry["coordinates"]]
        for polygon in polygons:
            for ring in polygon:
                for point in ring:
                    owners.setdefault(tuple(point), set()).add(name)
    for shared in owners.values():
        for name in shared:
            graph[name].update(shared - {name})
    return graph


def check_plan(plan: Plan, graph: dict[str, set[str]]) -> dict:
    missing = [name for name in NAMES if plan.assignments[name] == 0]
    empty, disconnected = [], []
    for district in range(1, plan.count + 1):
        remaining = {name for name in NAMES if plan.assignments[name] == district}
        if not remaining:
            empty.append(district)
            continue
        components = 0
        while remaining:
            components += 1
            queue = [remaining.pop()]
            while queue:
                neighbors = graph[queue.pop()] & remaining
                remaining -= neighbors
                queue.extend(neighbors)
        if components > 1:
            disconnected.append(district)
    return {
        "unassigned": missing,
        "empty_districts": empty,
        "disconnected_districts": disconnected,
        "complete": not missing and not empty,
        "connected": not disconnected,
        "method": "shared-coordinate-including-point-contact",
        "legal_compliance_assessed": False,
    }
