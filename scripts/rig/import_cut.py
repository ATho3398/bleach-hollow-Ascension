#!/usr/bin/env python3
"""사용자가 자른 부위 시트 → 종이인형 부위 파일 + 자리 (GDD 96장).

시트 = 부위를 가로로 늘어놓은 1배 그림(사이는 빈 열). 왼쪽부터 순서대로 --parts 이름(기본 head torso arm_L arm_R leg_L leg_R).
부위마다 기본형 그림(--base)에서 색이 가장 많이 겹치는 자리를 찾아 원래 자리(at = 캔버스 왼쪽 위 좌표)로 삼는다.
출력: public/art/rig/humanoid/<몸>/<부위>.png (꼭 맞게 자른 그림) + src/data/art/rig/humanoid.json 의 bodies.<몸> 갱신.
head 는 공통 머리라 public/art/rig/humanoid/head_bald.png 로 쓴다(--no-head 면 건너뜀).

사용:
  python3 scripts/rig/import_cut.py <시트.png> --body arrancar --base docs/design/user-art/shinigami-base-clean/arrancar-base.png
"""
from __future__ import annotations

import argparse
import json
import os

import numpy as np
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
ART = os.path.join(ROOT, 'public', 'art', 'rig', 'humanoid')
RIG_JSON = os.path.join(ROOT, 'src', 'data', 'art', 'rig', 'humanoid.json')


def segments(op: np.ndarray) -> list[tuple[int, int]]:
    segs, start = [], None
    for x in range(op.shape[1] + 1):
        filled = x < op.shape[1] and op[:, x].any()
        if filled and start is None:
            start = x
        if not filled and start is not None:
            segs.append((start, x))
            start = None
    return segs


def best_place(part: np.ndarray, base: np.ndarray) -> tuple[int, int, int]:
    """부위 그림이 기본형과 같은 색으로 가장 많이 겹치는 자리 (x, y, 겹친 칸 수)."""
    H, W = base.shape[:2]
    ph, pw = part.shape[:2]
    best = (-1, 0, 0)
    for oy in range(-ph + 1, H):
        for ox in range(-pw + 1, W):
            y0, y1, x0, x1 = max(0, oy), min(H, oy + ph), max(0, ox), min(W, ox + pw)
            if y1 <= y0 or x1 <= x0:
                continue
            sub = part[y0 - oy:y1 - oy, x0 - ox:x1 - ox]
            bs = base[y0:y1, x0:x1]
            sc = int(((sub[..., 3] > 0) & (bs[..., 3] > 0) & np.all(sub[..., :3] == bs[..., :3], -1)).sum())
            if sc > best[0]:
                best = (sc, ox, oy)
    return best[1], best[2], best[0]


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('sheet')
    ap.add_argument('--body', required=True)
    ap.add_argument('--base', required=True)
    ap.add_argument('--parts', default='head,torso,arm_L,arm_R,leg_L,leg_R')
    ap.add_argument('--no-head', action='store_true')
    a = ap.parse_args()
    sheet = np.array(Image.open(a.sheet).convert('RGBA'))
    base = np.array(Image.open(a.base).convert('RGBA'))
    names = a.parts.split(',')
    segs = segments(sheet[..., 3] > 0)
    if len(segs) != len(names):
        raise SystemExit(f'부위 {len(segs)}개를 찾았는데 이름은 {len(names)}개: {segs}')
    rig = json.load(open(RIG_JSON, encoding='utf-8'))
    body = rig['bodies'].setdefault(a.body, {})
    os.makedirs(os.path.join(ART, a.body), exist_ok=True)
    for name, (x0, x1) in zip(names, segs):
        col = sheet[:, x0:x1]
        ys = np.nonzero((col[..., 3] > 0).any(1))[0]
        part = col[ys.min():ys.max() + 1]
        px, py, score = best_place(part, base)
        key = 'head_bald' if name == 'head' else f'{a.body}/{name}'
        if name == 'head' and a.no_head:
            key = body.get('head', {}).get('art', 'head_bald')
        else:
            Image.fromarray(part).save(os.path.join(ART, key + '.png'))
        body[name] = {'art': key, 'at': [px, py], 'size': [part.shape[1], part.shape[0]]}
        print(f'{name}: {part.shape[1]}×{part.shape[0]} → 자리 ({px}, {py}), 겹친 칸 {score}/{int((part[..., 3] > 0).sum())}')
    json.dump(rig, open(RIG_JSON, 'w', encoding='utf-8'), ensure_ascii=False, indent=2)
    open(RIG_JSON, 'a', encoding='utf-8').write('\n')


if __name__ == '__main__':
    main()
