#!/usr/bin/env python3
"""알몸 기준 동작 옮기기 (GDD 115-A 58·59): 사용자가 남녀 알몸으로 잡은 동작을 같은 성별 몸에 맞춘다.
사용자 원문(2026-11-01): "앞으로, 남녀 알몸으로 모션 잡을테니까, 그 모션 맞춰서 사신, 아란칼 각각 남체 여체 다 맞춰"

기준 몸(알몸)의 동작 묶음에 있는 동작마다:
- 오른팔(arm_R·forearm_R): 몸 그림마다 팔 쉬는 각이 달라, 첫 키에서 위팔·아래팔이 기준 몸과 같은 방향이 되도록 몸마다 각도 차이를 계산해 더함
- 그 밖의 뼈: 기준 몸 값 그대로(필살기 왼팔·아래팔·칼은 몸마다 계산한 값 유지 — 손이 칼집 입구, 115-A 56)
- 받는 몸의 동작 묶음(bodyMotions)에 넣는다(없으면 몸 이름으로 만든다). 기본 동작은 건드리지 않음
해방(release1)은 몸마다 따로라 옮기지 않는다.
사용: python3 scripts/rig/body_sync.py <bare|female> [동작 ...]   (동작을 안 주면 기준 몸 묶음의 동작 전부)
"""
from __future__ import annotations

import json
import math
import os
import re
import sys

import numpy as np
from PIL import Image

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from paths import DRAFT_ART, DRAFT_DIR, DRAFT_RIG_JSON  # noqa: E402
from feet_weapon import dump  # noqa: E402

GROUPS = {'bare': ['shinigami', 'student', 'arrancar'], 'female': ['shinigami_f', 'student_f', 'arrancar_f']}
SKIP = {'release1'}
KEEP = {'ultimate': {'arm_L', 'forearm_L', 'weapon'}}
MOTIONS_JSON = os.path.join(DRAFT_DIR, 'motions.json')


def arm_dirs(rig: dict, body: str) -> tuple[float, float]:
    """동작 0 일 때 오른 위팔(어깨→팔꿈치)·아래팔(팔꿈치→손 = 아래팔 그림에서 팔꿈치에서 가장 먼 칸) 방향(도, 몸 기본 각도 포함)"""
    bones = {b['id']: b for b in rig['bones']}
    bj = (rig.get('bodyJoints') or {}).get(body) or {}
    pv, rt = bj.get('pivots') or {}, bj.get('rot') or {}
    sh = pv.get('arm_R', bones['arm_R']['pivot'])
    el = pv.get('forearm_R', bones['forearm_R']['pivot'])
    part = rig['bodies'][body]['forearm_R']
    a = np.array(Image.open(os.path.join(DRAFT_ART, part['art'] + '.png')))[..., 3] > 0
    ys, xs = np.nonzero(a)
    xs = xs + part['at'][0] + .5
    ys = ys + part['at'][1] + .5
    k = ((xs - el[0]) ** 2 + (ys - el[1]) ** 2).argmax()
    up = math.degrees(math.atan2(el[1] - sh[1], el[0] - sh[0]))
    lo = math.degrees(math.atan2(ys[k] - el[1], xs[k] - el[0]))
    t, u, f = rt.get('torso', 0), rt.get('arm_R', 0), rt.get('forearm_R', 0)
    return up + t + u, lo + t + u + f


def write_motions(mo: dict) -> None:
    s = json.dumps(mo, ensure_ascii=False, indent=1)
    s = re.sub(r'\[\s+(-?[\d.]+),\s+(-?[\d.]+),\s+(-?[\d.]+),\s+(-?[\d.]+)\s+\]', r'[\1, \2, \3, \4]', s)
    s = re.sub(r'\[\s+(-?[\d.]+),\s+(-?[\d.]+)\s+\]', r'[\1, \2]', s)
    open(MOTIONS_JSON, 'w', encoding='utf-8').write(s + '\n')


def sync(src: str, mids: list[str] | None = None) -> list[str]:
    rig = json.load(open(DRAFT_RIG_JSON, encoding='utf-8'))
    mo = json.load(open(MOTIONS_JSON, encoding='utf-8'))
    bm = rig.setdefault('bodyMotions', {})
    sset = mo['sets'].get(bm.get(src, src), {})
    mids = [m for m in (mids or [k for k in sset if k != 'note']) if m in sset and m not in SKIP]
    su, sf = arm_dirs(rig, src)
    done = []
    for mid in mids:
        base = mo.get(mid, {}).get('tracks', {})
        dur = mo.get(mid, {}).get('duration') or sset[mid].get('duration', 1000)
        st = {**base, **sset[mid].get('tracks', {})}  # 기준 몸이 실제로 쓰는 트랙
        for b in ('arm_R', 'forearm_R'):
            st.setdefault(b, [[0, 0, 0, 0], [dur, 0, 0, 0]])
        a0, f0 = st['arm_R'][0][1], st['forearm_R'][0][1]
        for body in GROUPS[src]:
            if body not in rig['bodies']:
                continue
            u, f = arm_dirs(rig, body)
            da = round(su - u)
            df = round(sf - f) - da
            tr = {b: json.loads(json.dumps(v)) for b, v in sset[mid].get('tracks', {}).items() if b not in KEEP.get(mid, set())}
            tr['arm_R'] = [[k[0], k[1] + da, k[2], k[3]] for k in st['arm_R']]
            tr['forearm_R'] = [[k[0], k[1] + df, k[2], k[3]] for k in st['forearm_R']]
            sn = bm.setdefault(body, body)
            tgt = mo['sets'].setdefault(sn, {}).setdefault(mid, {})
            tgt.setdefault('tracks', {}).update(tr)
            for k, v in sset[mid].items():
                if k not in ('tracks', 'note'):
                    tgt[k] = v
        done.append(mid)
    write_motions(mo)
    dump(rig)
    return done


if __name__ == '__main__':
    src = sys.argv[1]
    print(src, '→', GROUPS[src], ':', ' '.join(sync(src, sys.argv[2:] or None)))
