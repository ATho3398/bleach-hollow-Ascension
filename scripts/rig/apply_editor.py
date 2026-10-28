#!/usr/bin/env python3
"""관절 편집기(시험 페이지)에서 '값 복사'한 내용을 게임 뼈대 데이터에 넣는다 (GDD 96장).

사용: python3 scripts/rig/apply_editor.py '<복사한 JSON>'   (또는 파일 경로)
     편집기 서버 저장(아티팩트 db 문서 rig/editor — {"json": "<전체 상태>"})도 그대로 받는다: 모든 몸·외형의 자리, 관절, 앞뒤 순서를 한 번에 넣는다.
바뀌는 것: src/data/art/rig/humanoid.json 의 bones[].pivot, slots 순서, bodies.<몸>.<부위>.at, looks.<외형>.hair·hair_back.at
칼·칼집 자리(weapon·scabbard)는 모든 외형 공통이라 받은 값을 모든 외형에 넣는다. 쉬는 각도(restRot)는 건드리지 않는다.
"""
import json
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from paths import DRAFT_RIG_JSON  # noqa: E402
RIG_JSON = DRAFT_RIG_JSON  # 고정 = 작업본에만 (게임 넣기는 promote.py)

arg = sys.argv[1]
data = json.load(open(arg, encoding='utf-8')) if os.path.exists(arg) else json.loads(arg)
rig = json.load(open(RIG_JSON, encoding='utf-8'))
data = data.get('data', data)
if isinstance(data.get('json'), str):
    data = json.loads(data['json'])
if 'bodies' in data:
    # 전체 상태: 관절·앞뒤 순서·모든 몸 부위 자리·외형 층 자리
    piv = {b['id']: b['pivot'] for b in data['bones']}
    for b in rig['bones']:
        if b['id'] in piv:
            b['pivot'] = piv[b['id']]
    if data.get('slotsEdited'):
        order = [x['id'] for x in data['slots']]
        by = {s['id']: s for s in rig['slots']}
        slots = [by[i] for i in order if i in by] + [s for s in rig['slots'] if s['id'] not in order]
        # 겉옷 층은 늘 제 부위 바로 위(지금은 비어 있어 그림은 안 바뀜)
        for o, part in (('outer_torso', 'torso'), ('outer_arm_L', 'arm_L'), ('outer_arm_R', 'arm_R')):
            ids = [s['id'] for s in slots]
            if o in ids and part in ids:
                so = slots.pop(ids.index(o))
                slots.insert([s['id'] for s in slots].index(part) + 1, so)
        rig['slots'] = slots
    # 몸별 관절(자리·기본 각도): 빈 칸은 뺀다
    bj = {k: v for k, v in (data.get('bodyJoints') or {}).items() if isinstance(v, dict) and k in rig['bodies']}
    bj = {k: {kk: vv for kk, vv in v.items() if vv} for k, v in bj.items()}
    bj = {k: v for k, v in bj.items() if v}
    note = (rig.get('bodyJoints') or {}).get('note')
    rig['bodyJoints'] = ({'note': note} if note else {}) | bj
    for body, parts in data['bodies'].items():
        for k, v in parts.items():
            if body in rig['bodies'] and k in rig['bodies'][body]:
                rig['bodies'][body][k]['at'] = v['at']
    for lid, lk in data.get('looks', {}).items():
        for k, v in lk.items():
            if lid in rig['looks'] and isinstance(v, dict) and isinstance(rig['looks'][lid].get(k), dict):
                rig['looks'][lid][k]['at'] = v['at']
    sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
    from feet_weapon import dump  # noqa: E402
    dump(rig)
    print('적용(전체 상태): 관절', len(piv), '몸', len(data['bodies']), '외형', len(data.get('looks', {})))
    sys.exit(0)
piv = {b['id']: b['pivot'] for b in data['bones']}
for b in rig['bones']:
    if b['id'] in piv:
        b['pivot'] = piv[b['id']]
order = data.get('slots')
if order:
    by = {s['id']: s for s in rig['slots']}
    rig['slots'] = [by[i] for i in order if i in by] + [s for s in rig['slots'] if s['id'] not in order]
for part, at in data.get('parts', {}).items():
    rig['bodies'][data['body']][part]['at'] = at
for k in ('hair', 'hair_back'):
    if data.get('look') and data.get(k) and k in rig['looks'][data['look']]:
        rig['looks'][data['look']][k]['at'] = data[k]
for k in ('weapon', 'scabbard'):
    if data.get(k):
        for lk in rig['looks'].values():
            if k in lk:
                lk[k]['at'] = data[k]
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from feet_weapon import dump  # noqa: E402
dump(rig)
print('적용:', data['body'], '관절', len(piv), '부위 자리', len(data.get('parts', {})))
