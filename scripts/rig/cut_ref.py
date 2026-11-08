#!/usr/bin/env python3
"""사용자 도트를 종이인형 부위로 자르기 (GDD 115-A 45·47): 뼈대 데이터 skeletons.<몸>(슬롯 → 뼈대 선, 1배 그림 좌표)에서
칸마다 가장 가까운 선의 슬롯이 그 칸을 가진다. 슬롯마다 꼭 맞게 잘라 <뼈대>/<몸>/<슬롯>.png 로 저장하고 at·size 를 적는다.
그림 좌표 = 캔버스 좌표(도트를 캔버스 왼쪽 위에 그대로 둔 것). cut.at = [x, y] 가 있으면 도트 왼쪽 위를 캔버스 그 자리에 둔다
(사람형 역관절 기본 dg — 바닥에 발을 맞춤, GDD 115-A 69). cut.scale = n 이면 도트를 n 배(칸 그대로 키움)로 캔버스에 둔다 —
칸 주인은 원본 1배에서 정하고(한 칸이 두 부위로 갈리지 않게) 부위 그림을 n 배로 키운다(GDD 115-A 71). 사람형(humanoid)은 작업본 저장 형식(feet_weapon.dump)으로 쓴다.
사용: python3 scripts/rig/cut_ref.py serpent | beast | humanoid
"""
import json
import os
import sys

import numpy as np
from PIL import Image

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from paths import DRAFT_DIR, ROOT  # noqa: E402
from feet_weapon import dump  # noqa: E402


def dseg(px, py, a, b):
    ax, ay = a
    bx, by = b
    dx, dy = bx - ax, by - ay
    t = max(0.0, min(1.0, ((px - ax) * dx + (py - ay) * dy) / max(1e-9, dx * dx + dy * dy)))
    return ((px - ax - t * dx) ** 2 + (py - ay - t * dy) ** 2) ** 0.5


def main(rig_id):
    path = os.path.join(DRAFT_DIR, f'{rig_id}.json')
    rig = json.load(open(path, encoding='utf-8'))
    cut = rig['cut']
    src = np.array(Image.open(os.path.join(ROOT, cut['image'])).convert('RGBA'))
    lines = {k: [p for st in v for p in st['pts']] for k, v in rig['skeletons'][cut['body']].items()}
    strokes = {k: [st['pts'] for st in v] for k, v in rig['skeletons'][cut['body']].items()}
    ox, oy = cut.get('at', [0, 0])
    sc = int(cut.get('scale', 1))
    h, w = src.shape[:2]
    owner = np.full((h, w), '', dtype=object)
    for y in range(h):
        for x in range(w):
            if src[y, x, 3]:
                # 획마다 따로(한 슬롯에 떨어진 획이 여럿이어도 획 사이를 잇지 않음)
                owner[y, x] = min(strokes, key=lambda k: min(dseg(ox + sc * (x + .5), oy + sc * (y + .5), a, b) for st in strokes[k] for a, b in zip(st, st[1:])))
    body = {}
    out_dir = os.path.join(DRAFT_DIR, rig_id, cut['body'])
    os.makedirs(out_dir, exist_ok=True)
    for slot in lines:
        m = owner == slot
        if not m.any():
            continue
        ys, xs = np.nonzero(m)
        x0, y0, x1, y1 = xs.min(), ys.min(), xs.max() + 1, ys.max() + 1
        part = src[y0:y1, x0:x1].copy()
        part[~m[y0:y1, x0:x1]] = 0
        img = Image.fromarray(part)
        if sc > 1:
            img = img.resize((img.width * sc, img.height * sc), Image.NEAREST)
        img.save(os.path.join(out_dir, f'{slot}.png'))
        body[slot] = {'art': f"{cut['body']}/{slot}", 'at': [int(ox + sc * x0), int(oy + sc * y0)], 'size': [int(sc * (x1 - x0)), int(sc * (y1 - y0))]}
    rig['bodies'][cut['body']] = body
    if rig_id == 'humanoid':
        dump(rig)
    else:
        open(path, 'w', encoding='utf-8').write(json.dumps(rig, ensure_ascii=False, indent=1) + '\n')
    print(rig_id, '부위', len(body), '→', out_dir)


if __name__ == '__main__':
    main(sys.argv[1] if len(sys.argv) > 1 else 'serpent')
