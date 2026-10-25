"""Rebuild 2024 Taipei legislative results and cross-check the official district ranges.
Usage: python scripts/prepare_legislator.py --results-zip ... --locations-ods ... --ranges-csv ...
"""
import argparse
import csv
import hashlib
import io
import json
import re
import xml.etree.ElementTree as ET
from pathlib import Path
from zipfile import ZipFile
from prepare_election import ROOT, checksum, prepare

SOURCE = ROOT / 'data/elections/2024-legislator-source.json'


def extract_locations(path):
    ns = {'t':'urn:oasis:names:tc:opendocument:xmlns:table:1.0', 'x':'urn:oasis:names:tc:opendocument:xmlns:text:1.0'}
    with ZipFile(path) as z:
        root = ET.fromstring(z.read('content.xml'))
    out = {}
    for row_number, row in enumerate(root.findall('.//t:table-row', ns), 1):
        cells = []
        for c in row:
            value = ''.join(c.itertext()).strip()
            cells.extend([value] * min(int(c.get('{'+ns['t']+'}number-columns-repeated', '1')), 20))
        if not cells:
            continue
        match = re.fullmatch(r'臺北市(.+區)第(\d{4})投開票所', cells[0])
        if not match:
            continue
        town, sid = match.groups()
        if sid in out:
            raise ValueError('Duplicate location')
        out[sid] = {'name':cells[1], 'town':town,
                    'address':cells[2].removeprefix('臺北市'+town),
                    'coverage':cells[3]+' '+cells[4], 'source_row':row_number, 'source_sheet':'工作表1'}
    if set(out) != {f'{i:04}' for i in range(1,1765)}:
        raise ValueError(f'Expected 1764 locations, got {len(out)}')
    return out


def build(zip_path, locations_path, ranges_path):
    source = json.loads(SOURCE.read_text())
    checksum(locations_path.read_bytes(), source['locations']['sha256'])
    checksum(ranges_path.read_bytes(), source['ranges']['sha256'])
    data = prepare(zip_path, extract_locations(locations_path), SOURCE)
    geo = json.loads((ROOT/'data/taipei-villages.json').read_text())
    assigned = {}
    descriptions = {}
    for row in csv.DictReader(io.StringIO(ranges_path.read_text(encoding='utf-8-sig'))):
        if not row['選舉區'].startswith('臺北市'):
            continue
        district = int(re.search(r'第(\d+)選', row['選舉區'])[1])
        descriptions[str(district)] = row['選舉區範圍']
        parts = row['選舉區範圍'].split('－')
        towns = parts[0].split('、')
        for f in geo['features']:
            p = f['properties']
            if p['town'] not in towns:
                continue
            if len(parts)>1 and p['town']==towns[-1] and p['village'] not in re.findall(r'[^、]+?里',re.sub(r'等\d+里$', '', parts[1])):
                continue
            if p['id'] in assigned:
                raise ValueError('Overlapping official ranges')
            assigned[p['id']] = district
    if len(assigned)!=456 or set(assigned.values())!=set(range(1,9)):
        raise ValueError('Incomplete official ranges')
    if any(assigned[id]!=v['district'] for id,v in data['villages'].items()):
        raise ValueError('Official range/election assignment mismatch')
    config = {'office':'legislator','term':11,'count':8,'seats':[1]*8,
              'dataset_version':geo['dataset_version'],'assignments':assigned,
              'descriptions':descriptions,'source':source['ranges']}
    (ROOT/'data/legislator-config.json').write_text(json.dumps(config,ensure_ascii=False,indent=2)+'\n')
    (ROOT/'data/elections/2024-legislator.json').write_text(json.dumps(data,ensure_ascii=False,separators=(',',':')))
    print(f"Verified {len(data['villages'])} villages, {len(data['stations'])} stations; {sum(map(len,data['candidates'].values()))} candidates; official ranges match all villages.")


if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    for arg in ('results-zip','locations-ods','ranges-csv'):
        parser.add_argument('--'+arg,type=Path,required=True)
    args=parser.parse_args()
    build(args.results_zip,args.locations_ods,args.ranges_csv)
