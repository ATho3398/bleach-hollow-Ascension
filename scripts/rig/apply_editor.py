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


MARK = os.path.join(DRAFT_DIR, 'editor-page.json')


def load_mark() -> dict:
    return json.load(open(MARK, encoding='utf-8')) if os.path.exists(MARK) else {}


def save_mark(m: dict) -> None:
    if m.get('commit'):
        open(MARK, 'w', encoding='utf-8').write(json.dumps(m, ensure_ascii=False, indent=1) + '\n')


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
    # 이 편집기 페이지에서 앞 고정들이 넣은 항목(GDD 115-A 61): 편집기에서 되돌렸으면(= 페이지 값) 작업본도 되돌린다
    mark = load_mark()
    prev = (mark.get('applied') or {}).get(RIG_ID) or {}
    prev_j = {tuple(x) for x in prev.get('joints', [])}
    prev_at = {tuple(x) for x in prev.get('at', [])}
    prev_lk = {tuple(x) for x in prev.get('looks', [])}
    prev_m = {tuple(x) for x in prev.get('motions', [])}
    prev_b = set(prev.get('bones', []))
    prev_o = set(prev.get('orders', []))
    prev_bs = set(prev.get('bodySlots', []))
    done = {'joints': set(), 'at': set(), 'looks': set(), 'motions': set(), 'bones': set(), 'orders': set(), 'slots': set(), 'bodySlots': set()}
    bpiv = {b['id']: b['pivot'] for b in base['bones']}
    piv = {b['id']: b['pivot'] for b in data['bones']}
    for b in rig['bones']:
        if b['id'] in piv and (piv[b['id']] != bpiv.get(b['id']) or b['id'] in prev_b):
            b['pivot'] = piv[b['id']]
            done['bones'].add(b['id'])
    # 모든 동작의 기본 앞뒤 순서: 편집기에서 페이지 순서와 다르게 바꿨거나(또는 앞 고정에서 넣었으면) 그때만
    if data.get('slotsEdited') and ([x['id'] for x in data['slots']] != [x['id'] for x in base['slots']] or 'slots' in prev.get('slots', [])):
        done['slots'].add('slots')
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
    # 몸별 앞뒤 순서(GDD 115-A 74 — 편집기 '기본 자세(이 몸)'의 앞·뒤로 보내기): 페이지 값과 다르거나 앞 고정에서 넣은 몸만, 그 몸에만
    eb, b0s = data.get('bodySlots') or {}, base.get('bodySlots') or {}
    for b in sorted(set(eb) | set(b0s) | prev_bs):
        if eb.get(b) == b0s.get(b) and b not in prev_bs:
            continue
        done['bodySlots'].add(b)
        if eb.get(b):
            rig.setdefault('bodySlots', {})[b] = list(eb[b])
        else:
            (rig.get('bodySlots') or {}).pop(b, None)
    if 'bodySlots' in rig and not rig['bodySlots']:
        rig.pop('bodySlots')
    # 몸별 관절(자리·기본 각도·보정 이동): 몸·종류·뼈마다 편집기에서 고친 것(+ 앞 고정에서 넣은 것)만(빈 값 = 지움)
    def norm(j):
        j = j if isinstance(j, dict) else {}
        return {kind: {b: v for b, v in (j.get(kind) or {}).items() if v} for kind in ('pivots', 'rot', 'shift')}
    edited_j = {}  # 이번에 작업본에 넣은 항목(되돌림 포함) — 알몸이면 같은 성별 몸에 옮김
    own_j = {}  # 지금 편집기 값이 페이지 값과 다른 항목 = 그 몸에서 따로 고친 것(알몸 값으로 안 덮음)
    cur = rig.setdefault('bodyJoints', {})
    for body in data['bodies']:
        if body not in rig['bodies']:
            continue
        e, b0 = norm((data.get('bodyJoints') or {}).get(body)), norm((base.get('bodyJoints') or {}).get(body))
        for kind in ('pivots', 'rot', 'shift'):
            for bone in set(e[kind]) | set(b0[kind]) | {x[2] for x in prev_j if x[0] == body and x[1] == kind}:
                if e[kind].get(bone) == b0[kind].get(bone) and (body, kind, bone) not in prev_j:
                    continue
                edited_j.setdefault(body, set()).add((kind, bone))
                if e[kind].get(bone) != b0[kind].get(bone):
                    own_j.setdefault(body, set()).add((kind, bone))
                done['joints'].add((body, kind, bone))
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
            if body in rig['bodies'] and k in rig['bodies'][body] and (v['at'] != b0.get('at') or (body, k) in prev_at):
                rig['bodies'][body][k]['at'] = v['at']
                done['at'].add((body, k))
    for lid, lk in data.get('looks', {}).items():
        for k, v in lk.items():
            l0 = ((base.get('looks') or {}).get(lid) or {}).get(k)
            if lid in rig['looks'] and isinstance(v, dict) and isinstance(rig['looks'][lid].get(k), dict) \
                    and (not (isinstance(l0, dict) and l0.get('at') == v.get('at')) or (lid, k) in prev_lk):
                rig['looks'][lid][k]['at'] = v['at']
                done['looks'].add((lid, k))
    # 머리·무기 바꿔 끼우기(GDD 115-A 113): 편집기에서 '머리 변경'·'무기 변경'으로 고른 외형은 그 층(그림·자리·크기)을 통째로 넣고, 없앤 층은 지운다.
    # 고른 종류(hairKind·weaponKind)·무기 기준 자리(weaponBase)도 같이. 뒷머리 나누기 전 원본(segmentSrc)은 목록(parts.hair.<id>.src)에서
    for lid, lk in data.get('looks', {}).items():
        cur, l0 = rig['looks'].get(lid), (base.get('looks') or {}).get(lid) or {}
        if cur is None:
            continue
        for kind, layers in (('hairKind', ('hair', 'hair_back', 'hair_back2', 'hair_back3')), ('weaponKind', ('weapon', 'scabbard'))):
            if kind not in lk or (lk.get(kind) == l0.get(kind) and (lid, kind) not in prev_lk):
                continue
            for k in layers:
                if isinstance(lk.get(k), dict):
                    cur[k] = lk[k]
                else:
                    cur.pop(k, None)
            cur[kind] = lk[kind]
            if kind == 'weaponKind' and lk.get('weaponBase'):
                cur['weaponBase'] = lk['weaponBase']
            if kind == 'hairKind':
                src = (((rig.get('parts') or {}).get('hair') or {}).get(lk[kind]) or {}).get('src')
                seg = rig.setdefault('segmentSrc', {})
                if src:
                    seg.setdefault(lid, {}).update(json.loads(json.dumps(src)))
                elif isinstance(seg.get(lid), dict):
                    seg[lid].pop('hair_back', None)
            done['looks'].add((lid, kind))
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
    # 동작 키 고친 것(GDD 115-A 55, 편집기 '이 동작에만'): '<묶음>/<동작>' → 뼈 → 키 목록 — 그 뼈 트랙을 통째로 바꾼다.
    # 앞 고정에서 넣었는데 지금 편집기에 없는 뼈 트랙 = 편집기에서 되돌린 것 → 페이지를 만든 데이터의 트랙으로(GDD 115-A 61)
    medits = data.get('motionEdits') or {}
    morder = data.get('motionOrder') or {}  # 이 동작에만 쓰는 앞뒤 순서(GDD 115-A 62)
    mp = os.path.join(DRAFT_DIR, 'motions.json' if RIG_ID == 'humanoid' else f'{RIG_ID}-motions.json')
    undo = sorted(x for x in prev_m if x[1] not in (medits.get(x[0]) or {}))
    undo_o = sorted(k for k in prev_o if k not in morder)
    if medits or undo or morder or undo_o:
        mo = json.load(open(mp, encoding='utf-8'))
        mo0 = editor_base(mp) or {}
        n = 0
        def target_of(m, key, make):
            setn, mid = key.split('/', 1)
            if setn:
                return m.setdefault('sets', {}).setdefault(setn, {}).setdefault(mid, {'tracks': {}}) if make else ((m.get('sets') or {}).get(setn) or {}).get(mid)
            return m.get(mid)
        for key, edits in medits.items():
            target = target_of(mo, key, True)
            if not isinstance(target, dict):
                print('동작 없음(건너뜀):', key)
                continue
            target.setdefault('tracks', {}).update(edits)
            if key.split('/', 1)[0]:  # 묶음 동작: 고정한 뼈 표시 — creature_motions.py 가 다시 만들어도 이 트랙은 그대로 둠(115-A 80)
                target['edited'] = sorted(set(target.get('edited') or []) | set(edits))
            n += len(edits)
            done['motions'] |= {(key, bone) for bone in edits}
        for key, bone in undo:
            target = target_of(mo, key, False)
            if not isinstance(target, dict):
                continue
            src = ((target_of(mo0, key, False) or {}).get('tracks') or {}).get(bone)
            if src is None:
                (target.get('tracks') or {}).pop(bone, None)
            else:
                target.setdefault('tracks', {})[bone] = src
            if bone in (target.get('edited') or []):
                target['edited'] = [b for b in target['edited'] if b != bone] or None
                if target['edited'] is None:
                    del target['edited']
            done['motions'].add((key, bone))
        for key, order in morder.items():
            target = target_of(mo, key, True)
            if isinstance(target, dict):
                target['order'] = list(order)
                done['orders'].add(key)
        for key in undo_o:
            target = target_of(mo, key, False)
            if not isinstance(target, dict):
                continue
            src = (target_of(mo0, key, False) or {}).get('order')
            if src is None:
                target.pop('order', None)
            else:
                target['order'] = src
            done['orders'].add(key)
        s2 = json.dumps(mo, ensure_ascii=False, indent=1)
        s2 = re.sub(r'\[\s+(-?[\d.]+),\s+(-?[\d.]+),\s+(-?[\d.]+),\s+(-?[\d.]+)\s+\]', r'[\1, \2, \3, \4]', s2)
        s2 = re.sub(r'\[\s+(-?[\d.]+),\s+(-?[\d.]+)\s+\]', r'[\1, \2]', s2)
        open(mp, 'w', encoding='utf-8').write(s2 + '\n')
        print('동작 키 적용: 뼈 트랙', n, '· 되돌림', len(undo), '· 동작 앞뒤 순서', len(morder), '(되돌림', len(undo_o), ') →', os.path.basename(mp))
    # 남녀 알몸 = 같은 성별 몸 전부(GDD 115-A 60, body_sync.py): 알몸에서 고친 관절·기본 각도·동작 뼈 트랙을 그대로 덮는다.
    # 받는 몸에서 따로 고친 항목(이 페이지에서)은 그 몸 값 유지(사용자 "캐릭별로 좀 이상하면, 그 캐릭만 따로 내가 잡을테니까")
    if RIG_ID == 'humanoid':
        from body_sync import GROUPS, sync  # noqa: E402
        bm = rig.get('bodyMotions') or {}
        def medited(body, only_now=False):
            sn = bm.get(body, body)
            items = {(k, b) for k, ed in medits.items() for b in ed} if only_now else done['motions']
            return {(k.split('/', 1)[1], bone) for k, bone in items if k.split('/', 1)[0] == sn}
        def oedited(body, only_now=False):
            sn = bm.get(body, body)
            return {k.split('/', 1)[1] for k in (morder if only_now else done['orders']) if k.split('/', 1)[0] == sn}
        for src in ('bare', 'female'):
            jit, mit, oit = edited_j.get(src, set()), medited(src), oedited(src)
            if jit or mit or oit:
                keep = {d: (own_j.get(d, set()), medited(d, True), oedited(d, True)) for d in GROUPS[src]}
                res = sync(src, jit, mit, keep, orders=oit)
                print('알몸 그대로', src, '→', ', '.join(f'{d} 관절 {a}·트랙 {b}' for d, (a, b) in res.items()))
    # 이 페이지에서 넣은 항목 기록(편집기를 다시 올리면 mark_editor.py 가 비움)
    mark.setdefault('applied', {})[RIG_ID] = {k: sorted(list(x) if isinstance(x, tuple) else x for x in v) for k, v in done.items() if v}
    save_mark(mark)
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
