"""Convert the pinned official Taipei SHP archive to attributed WGS84 GeoJSON."""
import argparse
import hashlib
import io
import json
from pathlib import Path
from urllib.request import urlopen
from zipfile import ZipFile

import shapefile
from pyproj import CRS, Transformer
from shapely.geometry import mapping, shape
from shapely.ops import transform, unary_union

ROOT = Path(__file__).resolve().parents[1]
EXPECTED = {"北投區": 42, "士林區": 51, "內湖區": 39, "南港區": 20,
            "松山區": 33, "信義區": 41, "中山區": 42, "大同區": 25,
            "中正區": 31, "萬華區": 36, "大安區": 53, "文山區": 43}


def convert(raw, source):
    if hashlib.sha256(raw).hexdigest() != source["sha256"]:
        raise ValueError("Source checksum changed; review the official archive before updating metadata")
    archive = ZipFile(io.BytesIO(raw))
    base = next(n[:-4] for n in archive.namelist() if n.endswith(".shp"))
    crs = CRS.from_wkt(archive.read(base + ".prj").decode("utf-8"))
    if crs.to_epsg() != 3826:
        raise ValueError(f"Unexpected source CRS: {crs}")
    project = Transformer.from_crs(crs, 4326, always_xy=True).transform
    reader = shapefile.Reader(shp=io.BytesIO(archive.read(base + ".shp")),
                              shx=io.BytesIO(archive.read(base + ".shx")),
                              dbf=io.BytesIO(archive.read(base + ".dbf")), encoding="utf-8")
    records = []
    for record in reader.iterShapeRecords():
        attrs = record.record.as_dict()
        geom = shape(record.shape.__geo_interface__)
        if not geom.is_valid or geom.is_empty or geom.geom_type not in {"Polygon", "MultiPolygon"}:
            raise ValueError(f"Invalid official geometry: {attrs['TVNAME']}")
        records.append((str(attrs["CPTVID"]), attrs["TNAME"], attrs["VNAME"], geom))
    records.sort(key=lambda r: r[0])
    counts = {town: sum(r[1] == town for r in records) for town in EXPECTED}
    if len(records) != 456 or len({r[0] for r in records}) != 456 or counts != EXPECTED:
        raise ValueError(f"Unexpected village coverage: {counts}")
    neighbors = {r[0]: [] for r in records}
    # Use full source geometry in meters. Point-only contact is not adjacency.
    for i, (key, _, _, geom) in enumerate(records):
        for other, _, _, other_geom in records[i + 1:]:
            if geom.boundary.intersection(other_geom.boundary).length > 0.1:
                neighbors[key].append(other)
                neighbors[other].append(key)
    features = []
    for key, town, village, geom in records:
        point = transform(project, geom.representative_point())
        features.append({"type": "Feature", "properties": {
            "id": key, "town": town, "village": village, "label": town + village,
            "center": [point.x, point.y], "neighbors": sorted(neighbors[key]),
        }, "geometry": mapping(transform(project, geom))})
    return {"type": "FeatureCollection", "dataset_version": source["id"], "features": features}


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", type=Path, help="Already downloaded official ZIP")
    parser.add_argument("--output", type=Path, default=ROOT / "data/taipei-villages.json")
    args = parser.parse_args()
    source = json.loads((ROOT / "data/villages-source.json").read_text())
    raw = args.source.read_bytes() if args.source else urlopen(source["url"], timeout=60).read()
    result = convert(raw, source)
    args.output.write_text(json.dumps(result, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    # Dissolve villages into official district outlines for the v1 API.
    districts = [{"type": "Feature", "properties": {"town": town, "county": "臺北市"},
                  "geometry": mapping(unary_union([shape(f["geometry"]) for f in result["features"] if f["properties"]["town"] == town]))}
                 for town in EXPECTED]
    (args.output.parent / "taipei-districts.json").write_text(json.dumps({"type": "FeatureCollection", "features": districts}, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"Prepared {len(result['features'])} official villages; {sum(len(f['properties']['neighbors']) for f in result['features']) // 2} shared-edge pairs")
