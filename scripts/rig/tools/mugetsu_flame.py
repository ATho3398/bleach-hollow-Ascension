#!/usr/bin/env python3
"""무월 검은 불꽃 — 불 나오는 자리를 인형 조각에 붙이기 (GDD 115-A 135, 사용자 2026-11-14 "불꽃은 바로 넣어").
자료 = 도트 세션 docs/art-samples/mugetsu-flame/ (emitters.json 43곳 = 몸 그림 mugetsu.png 좌표, 계산식 live.py). 여기 사본: docs/design/user-art/mugetsu-ref/flame/emitters.json
몸 그림 (0,0) = 인형 캔버스 (39,0) (쉬는 자세 합성과 색이 가장 많이 맞는 자리).
자리마다 가장 가까운 조각에 붙인다: 팔(arm) → 오른 위팔·아래팔·칼, 나머지(바지 가장자리·엉덩이·바지 안쪽) → 하카마 4조각. 조각 안 좌표(lx, ly)로 적어 조각이 움직이면 같이 간다.
사용: python3 scripts/rig/tools/mugetsu_flame.py → docs/design/rig-draft/mugetsu-flame.json  (인형 조각 자리를 고친 뒤에는 다시 돌린다)
"""
import json
import os
import sys

import numpy as np
from PIL import Image

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from paths import DRAFT_DIR, ROOT  # noqa: E402

OFF = (39, 0)
PANTS = ['thigh_f', 'shin_f', 'thigh_b', 'shin_b']
ARM = ['arm_sword', 'forearm_sword', 'sword']


def main():
    rig = json.load(open(os.path.join(DRAFT_DIR, 'mugetsu.json'), encoding='utf-8'))
    parts = rig['bodies']['parts']
    pix = {}
    for s in PANTS + ARM:
        p = parts[s]
        a = np.array(Image.open(os.path.join(DRAFT_DIR, 'mugetsu', p['art'] + '.png')).convert('RGBA'))[..., 3] > 127
        ys, xs = np.nonzero(a)
        pix[s] = np.stack([xs + p['at'][0] + 0.5, ys + p['at'][1] + 0.5], 1)
    out = []
    for e in json.load(open(os.path.join(ROOT, 'docs/design/user-art/mugetsu-ref/flame/emitters.json'), encoding='utf-8')):
        cx, cy = e['x'] + OFF[0], e['y'] + OFF[1]
        cand = ARM if 'arm' in e else PANTS
        slot = min(cand, key=lambda s: ((pix[s] - (cx, cy)) ** 2).sum(1).min())
        at = parts[slot]['at']
        r = {'slot': slot, 'x': round(cx - at[0], 1), 'y': round(cy - at[1], 1)}
        for k in ('out', 'size', 'rise', 'licks', 'taper', 'sway', 'wl', 'lean', 'beat'):
            r[k] = round(e[k], 3)
        if e.get('inner'):
            r['inner'] = True
            r['order'] = e['slot']
        out.append(r)
    # 불꽃 팔(live.py ARMS): 몸 그림 (16,41) → (9,68) → (−27,105) 선을 0.7칸마다 찍어 가까운 팔·칼 조각에 붙인다. sp = 어깨에서부터 거리(0~1)
    import math
    ARMLINE = [(16, 41), (9, 68), (-27, 105)]
    pts, s = [], 0.0
    for (x0, y0), (x1, y1) in zip(ARMLINE, ARMLINE[1:]):
        d = math.hypot(x1 - x0, y1 - y0)
        n = int(d / 0.7)
        pts += [(x0 + (x1 - x0) * i / n + OFF[0], y0 + (y1 - y0) * i / n + OFF[1], s + d * i / n) for i in range(n)]
        s += d
    trail = []
    for cx, cy, sp in pts:
        slot = min(ARM, key=lambda q: ((pix[q] - (cx, cy)) ** 2).sum(1).min())
        # 선이 아니라 조각 위에 놓이게: 그 조각에서 가장 가까운 칸으로
        nx, ny = pix[slot][((pix[slot] - (cx, cy)) ** 2).sum(1).argmin()]
        at = parts[slot]['at']
        trail.append([slot, round(float(nx) - at[0], 1), round(float(ny) - at[1], 1), round(sp / s, 3), round(sp, 1)])
    spec = {'note': '무월 검은 불꽃(GDD 115-A 135, 작업본만) — scripts/rig/tools/mugetsu_flame.py 가 만듦. emitters = 조각(slot) 안 좌표 x·y 에 붙은 불 나오는 자리, 값은 도트 세션 live.py 그대로. '
                    'mask = 안쪽 불이 보이는 조각(하카마). 앞뒤 순서(바깥 불 = 몸 뒤, 안쪽 불 = 하카마 위)·동작별 불 세기는 임시(사용자 미정).',
            'look': 'ichigo-mugetsu', 'pad': [40, 44, 30, 4], 'mask': PANTS, 'trail': trail, 'emitters': out}
    open(os.path.join(DRAFT_DIR, 'mugetsu-flame.json'), 'w', encoding='utf-8').write(json.dumps(spec, ensure_ascii=False, indent=1) + '\n')
    from collections import Counter
    print('불 자리', len(out), Counter(r['slot'] for r in out))


if __name__ == '__main__':
    main()
