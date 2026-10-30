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
from paths import DRAFT_DIR, DRAFT_RIG_JSON  # noqa: E402
RIG_JSON = DRAFT_RIG_JSON  # 고정 = 작업본에만 (게임 넣기는 promote.py)

arg = sys.argv[1]
data = json.load(open(arg, encoding='utf-8')) if os.path.exists(arg) else json.loads(arg)
rig = json.load(open(RIG_JSON, encoding='utf-8'))
data = data.get('data', data)
if isinstance(data.get('json'), str):
    data = json.loads(data['json'])
# 뼈대마다 따로(GDD 96장 41): 편집기 상태의 id 가 사람형이 아니면 그 뼈대 파일
RIG_ID = data.get('id') or data.get('rig') or 'humanoid'
if RIG_ID != 'humanoid':
    RIG_JSON = os.path.join(DRAFT_DIR, f'{RIG_ID}.json')
    rig = json.load(open(RIG_JSON, encoding='utf-8'))
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
    # 편집기 상태에 있는 몸만 바꾼다(편집기보다 나중에 생긴 몸의 관절은 그대로)
    cur = rig.get('bodyJoints') or {}
    for k in data['bodies']:
        if k in rig['bodies']:
            cur.pop(k, None)
    rig['bodyJoints'] = cur | bj
    for body, parts in data['bodies'].items():
        for k, v in parts.items():
            if body in rig['bodies'] and k in rig['bodies'][body]:
                rig['bodies'][body][k]['at'] = v['at']
    for lid, lk in data.get('looks', {}).items():
        for k, v in lk.items():
            if lid in rig['looks'] and isinstance(v, dict) and isinstance(rig['looks'][lid].get(k), dict):
                rig['looks'][lid][k]['at'] = v['at']
    # '이 동작에만' 묶음이 아직 없는 몸 = 몸 이름으로 새 묶음 → 그 몸이 그 묶음을 쓰게
    for key in (data.get('motionEdits') or {}):
        setn = key.split('/', 1)[0]
        if setn in rig.get('bodies', {}) and setn not in (rig.get('bodyMotions') or {}).values():
            rig.setdefault('bodyMotions', {}).setdefault(setn, setn)
    if RIG_ID != 'humanoid':
        open(RIG_JSON, 'w', encoding='utf-8').write(json.dumps(rig, ensure_ascii=False, indent=1) + '\n')
    else:
        sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
        from feet_weapon import dump  # noqa: E402
        dump(rig)
    # 동작 키 고친 것(GDD 115-A 55, 편집기 '이 동작에만'): '<묶음>/<동작>' → 뼈 → 키 목록 — 그 뼈 트랙을 통째로 바꾼다
    medits = data.get('motionEdits') or {}
    if medits:
        mp = os.path.join(DRAFT_DIR, 'motions.json' if RIG_ID == 'humanoid' else f'{RIG_ID}-motions.json')
        mo = json.load(open(mp, encoding='utf-8'))
        n = 0
        for key, edits in medits.items():
            setn, mid = key.split('/', 1)
            if setn:
                target = mo.setdefault('sets', {}).setdefault(setn, {}).setdefault(mid, {'tracks': {}})
            else:
                target = mo.get(mid)
            if not isinstance(target, dict):
                print('동작 없음(건너뜀):', key)
                continue
            target.setdefault('tracks', {}).update(edits)
            n += len(edits)
        s2 = json.dumps(mo, ensure_ascii=False, indent=1)
        s2 = re.sub(r'\[\s+(-?[\d.]+),\s+(-?[\d.]+),\s+(-?[\d.]+),\s+(-?[\d.]+)\s+\]', r'[\1, \2, \3, \4]', s2)
        s2 = re.sub(r'\[\s+(-?[\d.]+),\s+(-?[\d.]+)\s+\]', r'[\1, \2]', s2)
        open(mp, 'w', encoding='utf-8').write(s2 + '\n')
        print('동작 키 적용: 뼈 트랙', n, '→', os.path.basename(mp))
    print(RIG_ID, '적용(전체 상태): 관절', len(piv), '몸', len(data['bodies']), '외형', len(data.get('looks', {})))
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
