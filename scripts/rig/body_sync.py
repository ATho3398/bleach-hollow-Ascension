#!/usr/bin/env python3
"""알몸 기준 그대로 복사 (GDD 115-A 59·60): 남자 알몸 → 남자 몸 전부, 여자 알몸 → 여자 몸 전부.
사용자 원문(2026-11-01 00:09): "앞으로, 남녀 알몸으로 모션 잡을테니까, 그 모션 맞춰서 사신, 아란칼 각각 남체 여체 다 맞춰"
사용자 원문(2026-11-01 02:2x): "남자 알몸각도와 관절 위치=모든 남자에 적용 / 여자 알몸=모든 여자에 적용 / 이렇게 하라니까;;
  그리고 뭔가 캐릭별로 좀 이상하면, 그 캐릭만 따로 내가 잡을테니까"

복사하는 것(숫자 그대로, 몸 그림 차이 계산 없음):
- 몸별 관절(bodyJoints): 관절 자리(pivots)·기본 각도(rot). 외형 층 관절(머리카락·뒷머리·망토·겉옷)은 외형마다 모양이 달라 받는 몸 값 유지
- 동작: 기준 몸의 동작 묶음(bodyMotions)을 받는 몸의 묶음에 — 해방(release1)·필살기 포함, 모든 뼈
부위 그림 자리(bodies.<몸>.<부위>.at)는 몸마다 그림이 달라 옮기지 않는다.

사용: python3 scripts/rig/body_sync.py <bare|female>   — 통째 복사(받는 몸의 관절·동작 묶음 = 기준 몸)
편집기 고정(apply_editor.py)은 sync(src, 고친 항목) 으로 기준 몸에서 고친 항목만 덮는다(받는 몸에서 같은 고정에 따로 고친 항목은 그 몸 값 유지).
"""
from __future__ import annotations

import copy
import json
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from paths import DRAFT_DIR, DRAFT_RIG_JSON  # noqa: E402
from feet_weapon import dump  # noqa: E402

GROUPS = {'bare': ['shinigami', 'student', 'arrancar'], 'female': ['shinigami_f', 'student_f', 'arrancar_f']}
LOOK_BONES = {'hair', 'hair_back', 'cape'}
MOTIONS_JSON = os.path.join(DRAFT_DIR, 'motions.json')
KINDS = ('pivots', 'rot')


def body_bone(b: str) -> bool:
    return b not in LOOK_BONES and not b.startswith('outer')


def write_motions(mo: dict) -> None:
    s = json.dumps(mo, ensure_ascii=False, indent=1)
    s = re.sub(r'\[\s+(-?[\d.]+),\s+(-?[\d.]+),\s+(-?[\d.]+),\s+(-?[\d.]+)\s+\]', r'[\1, \2, \3, \4]', s)
    s = re.sub(r'\[\s+(-?[\d.]+),\s+(-?[\d.]+)\s+\]', r'[\1, \2]', s)
    open(MOTIONS_JSON, 'w', encoding='utf-8').write(s + '\n')


def copy_joints(rig: dict, src: str, dst: str, items: set | None, keep: set) -> int:
    """items = {(kind, bone)} 또는 None(전부). keep = 받는 몸에서 따로 고친 항목(안 덮음)"""
    bj = rig.setdefault('bodyJoints', {})
    s, d = bj.get(src) or {}, bj.setdefault(dst, {})
    n = 0
    for kind in KINDS:
        sk, dk = s.get(kind) or {}, d.setdefault(kind, {})
        bones = (set(sk) | set(dk)) if items is None else {b for k, b in items if k == kind}
        for b in sorted(bones):
            if not body_bone(b) or (kind, b) in keep:
                continue
            if sk.get(b):
                if dk.get(b) != sk[b]:
                    dk[b] = copy.deepcopy(sk[b])
                    n += 1
            elif b in dk:
                dk.pop(b)
                n += 1
        if not dk:
            d.pop(kind)
    if not d:
        bj.pop(dst)
    return n


def copy_motions(rig: dict, mo: dict, src: str, dst: str, items: set | None, keep: set) -> int:
    """items = {(동작, 뼈)} 또는 None(묶음 통째). keep = 받는 몸에서 따로 고친 (동작, 뼈)"""
    bm = rig.setdefault('bodyMotions', {})
    sset = mo['sets'].get(bm.get(src, src), {})
    sn = bm.setdefault(dst, dst)
    dset = mo['sets'].setdefault(sn, {})
    if items is None:
        items = {(m, b) for m, v in sset.items() if m != 'note' for b in v.get('tracks', {})}
        items |= {(m, b) for m, v in dset.items() if m != 'note' for b in v.get('tracks', {})}
    n = 0
    for mid, b in sorted(items):
        if (mid, b) in keep:
            continue
        sm = sset.get(mid)
        if sm is None:
            tr = dset.get(mid, {}).get('tracks', {})
            if b in tr:
                tr.pop(b)
                n += 1
            if mid in dset and not tr:
                dset.pop(mid)
            continue
        tgt = dset.setdefault(mid, {})
        for k, v in sm.items():
            if k not in ('tracks', 'note'):
                tgt[k] = copy.deepcopy(v)
        tr = tgt.setdefault('tracks', {})
        if b in sm.get('tracks', {}):
            if tr.get(b) != sm['tracks'][b]:
                tr[b] = copy.deepcopy(sm['tracks'][b])
                n += 1
        elif b in tr:
            tr.pop(b)
            n += 1
    return n


def sync(src: str, joints: set | None = None, motions: set | None = None, keep: dict | None = None, full: bool = False) -> dict:
    """기준 몸 src 의 값을 같은 성별 몸에. full = 통째, 아니면 joints·motions 에 든 항목만.
    keep = {받는 몸: (관절 항목 set, 동작 항목 set)} — 받는 몸에서 따로 고친 것"""
    rig = json.load(open(DRAFT_RIG_JSON, encoding='utf-8'))
    mo = json.load(open(MOTIONS_JSON, encoding='utf-8'))
    keep = keep or {}
    out = {}
    for dst in GROUPS[src]:
        if dst not in rig['bodies']:
            continue
        kj, km = keep.get(dst, (set(), set()))
        nj = copy_joints(rig, src, dst, None if full else (joints or set()), kj)
        nm = copy_motions(rig, mo, src, dst, None if full else (motions or set()), km)
        out[dst] = (nj, nm)
    write_motions(mo)
    dump(rig)
    return out


if __name__ == '__main__':
    src = sys.argv[1]
    for dst, (nj, nm) in sync(src, full=True).items():
        print(f'{src} → {dst}: 관절·기본 각도 {nj}개, 동작 뼈 트랙 {nm}개')
