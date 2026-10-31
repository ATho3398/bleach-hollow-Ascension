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
import subprocess
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from paths import DRAFT_DIR, DRAFT_RIG_JSON  # noqa: E402
RIG_JSON = DRAFT_RIG_JSON  # 고정 = 작업본에만 (게임 넣기는 promote.py)


def editor_base(rig_path: str):
    """편집기 페이지를 만든 데이터(GDD 115-A 60): editor-page.json 의 commit 에서 그 뼈대 파일. 없으면 None"""
    mark = os.path.join(DRAFT_DIR, 'editor-page.json')
    if not os.path.exists(mark):
        return None
    commit = json.load(open(mark, encoding='utf-8')).get('commit')
    rel = os.path.relpath(rig_path, ROOT)
    try:
        out = subprocess.check_output(['git', '-C', ROOT, 'show', f'{commit}:{rel}'], stderr=subprocess.DEVNULL)
    except subprocess.CalledProcessError:
        return None
    return json.loads(out)


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
    # 고친 항목만 넣는다(GDD 115-A 60): 편집기 값 ≠ 편집기 페이지를 만든 데이터(editor-page.json 의 커밋) 인 것만.
    # 편집기 페이지가 작업본보다 옛것이어도(고정 안 한 값 때문에 못 다시 올림) 그 뒤 작업본에 들어간 값이 옛 값으로 돌아가지 않게.
    base = editor_base(RIG_JSON) or json.loads(json.dumps(rig))
    bpiv = {b['id']: b['pivot'] for b in base['bones']}
    piv = {b['id']: b['pivot'] for b in data['bones']}
    for b in rig['bones']:
        if b['id'] in piv and piv[b['id']] != bpiv.get(b['id']):
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
    # 몸별 관절(자리·기본 각도): 몸·종류·뼈마다 편집기에서 고친 것만(빈 값 = 지움)
    def norm(j):
        j = j if isinstance(j, dict) else {}
        return {kind: {b: v for b, v in (j.get(kind) or {}).items() if v} for kind in ('pivots', 'rot')}
    edited_j = {}
    cur = rig.setdefault('bodyJoints', {})
    for body in data['bodies']:
        if body not in rig['bodies']:
            continue
        e, b0 = norm((data.get('bodyJoints') or {}).get(body)), norm((base.get('bodyJoints') or {}).get(body))
        for kind in ('pivots', 'rot'):
            for bone in set(e[kind]) | set(b0[kind]):
                if e[kind].get(bone) == b0[kind].get(bone):
                    continue
                edited_j.setdefault(body, set()).add((kind, bone))
                ck = cur.setdefault(body, {}).setdefault(kind, {})
                if e[kind].get(bone):
                    ck[bone] = e[kind][bone]
                else:
                    ck.pop(bone, None)
                if not ck:
                    cur[body].pop(kind)
                if not cur[body]:
                    cur.pop(body)
    for body, parts in data['bodies'].items():
        for k, v in parts.items():
            b0 = ((base.get('bodies') or {}).get(body) or {}).get(k) or {}
            if body in rig['bodies'] and k in rig['bodies'][body] and v['at'] != b0.get('at'):
                rig['bodies'][body][k]['at'] = v['at']
    for lid, lk in data.get('looks', {}).items():
        for k, v in lk.items():
            l0 = ((base.get('looks') or {}).get(lid) or {}).get(k)
            if lid in rig['looks'] and isinstance(v, dict) and isinstance(rig['looks'][lid].get(k), dict) \
                    and not (isinstance(l0, dict) and l0.get('at') == v.get('at')):
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
    # 남녀 알몸 = 같은 성별 몸 전부(GDD 115-A 60, body_sync.py): 알몸에서 고친 관절·기본 각도·동작 뼈 트랙을 그대로 덮는다.
    # 받는 몸에서 같은 고정에 따로 고친 항목은 그 몸 값 유지(사용자 "캐릭별로 좀 이상하면, 그 캐릭만 따로 내가 잡을테니까")
    if RIG_ID == 'humanoid':
        from body_sync import GROUPS, sync  # noqa: E402
        bm = rig.get('bodyMotions') or {}
        def medited(body):
            sn = bm.get(body, body)
            return {(k.split('/', 1)[1], bone) for k, ed in medits.items() if k.split('/', 1)[0] == sn for bone in ed}
        for src in ('bare', 'female'):
            jit, mit = edited_j.get(src, set()), medited(src)
            if jit or mit:
                keep = {d: (edited_j.get(d, set()), medited(d)) for d in GROUPS[src]}
                res = sync(src, jit, mit, keep)
                print('알몸 그대로', src, '→', ', '.join(f'{d} 관절 {a}·트랙 {b}' for d, (a, b) in res.items()))
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
