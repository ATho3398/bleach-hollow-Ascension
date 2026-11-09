#!/usr/bin/env python3
"""늘어진 부위를 마디로 나누기 (GDD 115-A 88, 사용자 2026-11-09 "뒷머리 파트를 나누던가 … 좀 더 찰랑거리게 … 망토도 마찬가지").
외형 층 부위(뒷머리 hair_back·망토 cape)를 관절에서 아래로 가로 띠 N 개로 잘라 <슬롯>·<슬롯>2·<슬롯>3 마디로 만든다.
- 마디 그림: <원본 그림>_s1·_s2·_s3 (원본 그림은 그대로 둔다 — 가이드·가져오기·다시 나누기의 원본, 뼈대 데이터 segmentSrc 에 적음)
- 아래 마디 관절 = 자르는 줄의 그림 가운데. 아래 마디는 윗줄 1칸을 겹쳐 가져가 돌려도 틈이 안 난다(위 마디 뒤에 그림)
- 뼈 <슬롯>2(부모 <슬롯>)·<슬롯>3(부모 <슬롯>2), 슬롯은 원래 슬롯 바로 뒤(먼저 그림), 몸별 관절(bodyJoints)·몸별 앞뒤 순서·동작 앞뒤 순서에도 넣음
- 따라가기(rig.sway)는 엔진(pose.ts samplePose)이 함: 부모가 움직인 대로 늦게 따라오고 아래로 늘어짐 — 동작 키 필요 없음
다시 돌리면 segmentSrc 의 원본에서 다시 나눈다(원본 그림을 바꿨으면 segmentSrc 를 지우고 돌림).
사용: python3 scripts/rig/split_chain.py
"""
import json
import os
import sys

import numpy as np
from PIL import Image

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from paths import DRAFT_ART, DRAFT_MOTIONS, DRAFT_RIG_JSON  # noqa: E402
from feet_weapon import dump  # noqa: E402

# 슬롯 → (마디 수 고르기: 그림 아래 길이(관절 아래 칸 수)가 이만큼 넘으면 3마디, 아니면 2), 따라가기 값
CHAINS = {
    'hair_back': {'long': 30, 'sway': {'lag': 90, 'swing': 1.4, 'hang': 0.3}, 'names': ('뒷머리 2', '뒷머리 끝')},
    'cape': {'long': 30, 'sway': {'lag': 80, 'swing': 1.2, 'hang': 0.35}, 'names': ('망토 2', '망토 끝')},
}


def pivot_of(rig, body, bone):
    bj = rig.get('bodyJoints', {}).get(body)
    p = (bj.get('pivots') or {}).get(bone) if isinstance(bj, dict) else None
    return p or next(b for b in rig['bones'] if b['id'] == bone)['pivot']


def split(rig, look_id, slot, part, piv):
    a = np.array(Image.open(os.path.join(DRAFT_ART, part['art'] + '.png')).convert('RGBA'))
    ax, ay = part['at']
    ys = np.nonzero(a[..., 3].any(axis=1))[0]
    bottom = ay + int(ys.max())
    span = bottom - piv[1]
    n = 3 if span > CHAINS[slot]['long'] else 2
    cuts = [piv[1] + round(span * k / n) for k in range(1, n)]  # 캔버스 y (이 줄부터 아래 마디)
    edges = [-10**6] + cuts + [10**6]
    segs, pivots = [], []
    for k in range(n):
        y0, y1 = edges[k] - (1 if k else 0), edges[k + 1]  # 아래 마디는 윗줄 1칸 겹침
        m = np.zeros_like(a)
        for yy in range(a.shape[0]):
            cy = ay + yy
            if y0 <= cy < y1:
                m[yy] = a[yy]
        oy, ox = np.nonzero(m[..., 3])
        if not len(oy):
            return None
        crop = m[oy.min():oy.max() + 1, ox.min():ox.max() + 1]
        art = f"{part['art']}_s{k + 1}"
        Image.fromarray(crop).save(os.path.join(DRAFT_ART, art + '.png'))
        segs.append({'art': art, 'at': [ax + int(ox.min()), ay + int(oy.min())], 'size': [int(crop.shape[1]), int(crop.shape[0])]})
        if k:
            cy = edges[k]
            rows = a[max(0, cy - ay - 1):cy - ay + 1, :, 3]
            xs = np.nonzero(rows.any(axis=0))[0]
            # 가장 긴 이어진 칸 무리의 가운데(떨어진 조각 말고 몸통 줄기)
            runs, s0 = [], xs[0]
            for i in range(1, len(xs) + 1):
                if i == len(xs) or xs[i] != xs[i - 1] + 1:
                    runs.append((s0, xs[i - 1]))
                    if i < len(xs):
                        s0 = xs[i]
            r0, r1 = max(runs, key=lambda r: r[1] - r[0])
            pivots.append([ax + int(round((r0 + r1) / 2)), cy])
    return segs, pivots


def main():
    rig = json.load(open(DRAFT_RIG_JSON, encoding='utf-8'))
    mo = json.load(open(DRAFT_MOTIONS, encoding='utf-8'))
    src = rig.setdefault('segmentSrc', {'note': '마디로 나누기 전 원본 부위(scripts/rig/split_chain.py, GDD 115-A 88) — 외형 → 슬롯 → 원본 그림. 가이드·가져오기는 이 원본을 쓴다'})
    bone_ids = [b['id'] for b in rig['bones']]
    slot_ids = [s['id'] for s in rig['slots']]
    for slot, cfg in CHAINS.items():
        segs_ids = [slot, slot + '2', slot + '3']
        made = {}
        for lid, look in rig['looks'].items():
            part = (src.get(lid) or {}).get(slot) or (look.get(slot) if isinstance(look.get(slot), dict) else None)
            if not part:
                continue
            src.setdefault(lid, {})[slot] = dict(part)
            piv = pivot_of(rig, look['body'], slot)
            out = split(rig, lid, slot, part, piv)
            if not out:
                continue
            segs, pivots = out
            for i, sg in enumerate(segs):
                look[segs_ids[i]] = sg
            for extra in segs_ids[len(segs):]:
                look.pop(extra, None)
            made.setdefault(look['body'], []).append((lid, pivots))
            print(f'{lid} {slot}: {len(segs)}마디, 관절 {pivots}')
        if not made:
            continue
        # 뼈(부모 뒤) — 전역 기본 관절 = 처음 나눈 것, 몸마다 bodyJoints
        first = next(iter(made.values()))[0][1]
        for i, nid in enumerate(segs_ids[1:], start=1):
            if nid not in bone_ids:
                at = bone_ids.index(segs_ids[i - 1]) + 1
                rig['bones'].insert(at, {'id': nid, 'parent': segs_ids[i - 1], 'pivot': first[min(i - 1, len(first) - 1)]})
                bone_ids.insert(at, nid)
        for body, lst in made.items():
            pivs = max((p for _, p in lst), key=len)
            bj = rig.setdefault('bodyJoints', {}).setdefault(body, {})
            for i, p in enumerate(pivs, start=1):
                bj.setdefault('pivots', {})[segs_ids[i]] = p
        # 슬롯: 원래 슬롯 바로 앞(뒤에 그림) — 끝 마디가 가장 뒤
        for nid in segs_ids[1:]:
            if nid not in slot_ids:
                at = slot_ids.index(slot)
                rig['slots'].insert(at, {'id': nid, 'bone': nid})
                slot_ids.insert(at, nid)
        for order in list((rig.get('bodySlots') or {}).values()):
            if slot in order:
                for nid in segs_ids[1:]:
                    if nid not in order:
                        order.insert(order.index(slot), nid)
        rig.setdefault('sway', {})
        for nid in segs_ids[1:]:
            rig['sway'][nid] = dict(cfg['sway'])
        # 편집기: 이름·묶음·같이 옮기기
        ed = rig.setdefault('edit', {})
        for nid, nm in zip(segs_ids[1:], cfg['names']):
            ed.setdefault('names', {})[nid] = nm
        for g in ed.get('groups', []):
            if slot in g[1]:
                for nid in segs_ids[1:]:
                    if nid not in g[1]:
                        g[1].insert(g[1].index(slot) + 1 + segs_ids[1:].index(nid), nid)
        fol = ed.setdefault('follow', {})
        for k, v in fol.items():
            if slot in v:
                for nid in segs_ids[1:]:
                    if nid not in v:
                        v.append(nid)
        fol[slot] = segs_ids[1:]
        fol[segs_ids[1]] = segs_ids[2:]
    # 동작의 앞뒤 순서 목록에도(빠지면 맨 앞에 그려짐)
    def fix_order(m):
        od = m.get('order')
        if not od:
            return
        for slot in CHAINS:
            if slot in od:
                for nid in (slot + '2', slot + '3'):
                    if nid in slot_ids and nid not in od:
                        od.insert(od.index(slot), nid)
    for k, m in mo.items():
        if isinstance(m, dict) and 'tracks' in m:
            fix_order(m)
    for st in mo.get('sets', {}).values():
        for m in st.values():
            if isinstance(m, dict):
                fix_order(m)
    dump(rig)
    from body_sync import write_motions
    write_motions(mo)


if __name__ == '__main__':
    main()
