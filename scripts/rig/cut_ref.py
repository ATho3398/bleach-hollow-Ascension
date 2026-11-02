#!/usr/bin/env python3
"""사용자 도트를 종이인형 부위로 자르기 (GDD 115-A 45·47): 뼈대 데이터 skeletons.<몸>(슬롯 → 뼈대 선, 1배 그림 좌표)에서
칸마다 가장 가까운 선의 슬롯이 그 칸을 가진다. 슬롯마다 꼭 맞게 잘라 <뼈대>/<몸>/<슬롯>.png 로 저장하고 at·size 를 적는다.
그림 좌표 = 캔버스 좌표(도트를 캔버스 왼쪽 위에 그대로 둔 것).
사용: python3 scripts/rig/cut_ref.py serpent
"""
import json
import os
import sys

import numpy as np
from PIL import Image

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from paths import DRAFT_DIR, ROOT  # noqa: E402


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
    h, w = src.shape[:2]
    owner = np.full((h, w), '', dtype=object)
    for y in range(h):
        for x in range(w):
            if src[y, x, 3]:
                owner[y, x] = min(lines, key=lambda k: min(dseg(x + .5, y + .5, a, b) for a, b in zip(lines[k], lines[k][1:])))
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
        Image.fromarray(part).save(os.path.join(out_dir, f'{slot}.png'))
        body[slot] = {'art': f"{cut['body']}/{slot}", 'at': [int(x0), int(y0)], 'size': [int(x1 - x0), int(y1 - y0)]}
    rig['bodies'][cut['body']] = body
    open(path, 'w', encoding='utf-8').write(json.dumps(rig, ensure_ascii=False, indent=1) + '\n')
    print(rig_id, '부위', len(body), '→', out_dir)


if __name__ == '__main__':
    main(sys.argv[1] if len(sys.argv) > 1 else 'serpent')
