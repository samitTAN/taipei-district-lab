import pytest
from fastapi.testclient import TestClient

from backend.main import create_app


@pytest.fixture
def client():
    return TestClient(create_app())


def plan(client):
    config = client.get('/api/legislator/current').json()
    return {'version':3,'office':'legislator','city':'臺北市','unit':'village',
            'dataset_version':config['dataset_version'],'name':'立委草案',
            'count':8,'assignments':config['assignments']}


def test_legislative_baseline_and_plan_validation(client):
    p = plan(client)
    config = client.get('/api/legislator/current').json()
    assert config['seats'] == [1]*8
    response = client.post('/api/plans/validate',json=p)
    assert response.status_code == 200
    checks = response.json()['checks']
    assert checks['complete'] and checks['connected']
    assert not checks['legal_compliance_assessed']
    for update in [{'count':7},{'count':9},{'version':2},{'office':'council'},
                   {'assignments':{}},{'dataset_version':'wrong'}]:
        assert client.post('/api/plans/validate',json={**p,**update}).status_code == 422
    p['assignments'][next(iter(p['assignments']))] = 0
    response = client.post('/api/plans/validate',json=p).json()
    assert not response['checks']['complete']


def test_legislator_legal_rules_do_not_apply_council_deadlines(client):
    p = plan(client)
    response = client.post('/api/legal/check',json={'plan':p})
    assert response.status_code == 200
    data = response.json()
    assert data['ruleset'] == 'tw-taipei-legislator-20261024'
    statuses = {i['id']:i['status'] for i in data['items']}
    assert statuses['seats']=='checked'
    assert statuses['deadline']=='review'
    assert statuses['population']=='unknown'
    assert statuses['administrative']=='review'
    assert data['facts']['split_towns']==['中正區','士林區','松山區']
    assert data['facts']['deadline'] is None
    assert not data['legal_compliance_assessed']
    assert client.post('/api/legal/check',json={'plan':p,'check_deadline':True,'publication_date':'2026-10-24'}).status_code==422
    assert client.get('/api/legal/rules?office=legislator').json()['id']==data['ruleset']
    assert client.get('/api/legal/rules?office=unknown').status_code==422


def test_legislative_election_api_and_complete_accounting(client):
    path='/api/elections/2024-taipei-legislator-regional'
    data=client.get(path).json()
    baseline=client.get('/api/legislator/current').json()['assignments']
    assert data['date']=='2024-01-13'
    assert len(data['villages'])==456 and len(data['stations'])==1764
    assert sum(map(len,data['candidates'].values()))==53
    assert all(sum(c['elected'] for c in cs)==1 for cs in data['candidates'].values())
    assert set(data['candidates'])==set(map(str,range(1,9)))
    station_ids=[]
    for id,v in data['villages'].items():
        assert baseline[id]==v['district']
        ss=[data['stations'][s] for s in v['station_ids']]
        station_ids.extend(v['station_ids'])
        assert all(s['village_id']==id and s['district']==v['district'] for s in ss)
        for field in ['valid','invalid','ballots','eligible']:
            assert sum(s[field] for s in ss)==v[field]
        assert [sum(s['votes'][i] for s in ss) for i in range(len(v['votes']))]==v['votes']
        assert sum(v['votes'])==v['valid']
    assert len(station_ids)==len(set(station_ids))==1764
    for s in data['stations'].values():
        assert sum(s['votes'])==s['valid']
        assert s['valid']+s['invalid']==s['ballots']<=s['eligible']
        assert s['location']['name'] and s['location']['address']
    for field in ['valid','invalid','ballots','eligible']:
        assert sum(v[field] for v in data['villages'].values())==data['summary'][field]
    station=client.get(path+'/stations/1764').json()
    assert station['id']=='1764' and station['election_id']==data['id']
    assert sum(c['votes'] for c in station['candidate_results'])==station['valid']
    assert client.get(path+'/villages/'+station['village_id']).status_code==200
    for suffix in ['/stations/1765','/stations/１２','/stations/hello','/villages/unknown']:
        assert client.get(path+suffix).status_code==404
    assert len(client.get('/api/elections').json())==2
