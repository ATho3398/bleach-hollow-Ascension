#!/usr/bin/env python3
"""사용자가 자른 부위 시트 → 종이인형 부위 파일 + 자리 (GDD 96장).

시트 = 부위를 늘어놓은 1배 그림(부위끼리 안 닿게). 이어진 덩어리를 가운데 x 순서로 --parts 이름에 맞춘다(기본 head torso arm_L arm_R leg_L leg_R, 발까지 나눈 시트는 head,torso,arm_L,foot_L,arm_R,foot_R,leg_L,leg_R — 왼발·오른발은 놓인 자리로 다시 정함).
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


def components(op: np.ndarray, min_px: int = 6) -> list[tuple[int, int, int, int, np.ndarray]]:
    """8방향으로 이어진 덩어리마다 (x0, y0, x1, y1, 마스크). 아주 작은 조각은 가장 가까운 덩어리에 붙인다.
    같은 열에 부위가 위아래로 놓여 있어도(팔 밑에 발) 따로 잡힌다."""
    h, w = op.shape
    lab = np.zeros((h, w), int)
    n = 0
    for sy, sx in zip(*np.nonzero(op)):
        if lab[sy, sx]:
            continue
        n += 1
        st = [(sy, sx)]
        lab[sy, sx] = n
        while st:
            y, x = st.pop()
            for yy in (y - 1, y, y + 1):
                for xx in (x - 1, x, x + 1):
                    if 0 <= yy < h and 0 <= xx < w and op[yy, xx] and not lab[yy, xx]:
                        lab[yy, xx] = n
                        st.append((yy, xx))
    sizes = {i: int((lab == i).sum()) for i in range(1, n + 1)}
    big = [i for i in sizes if sizes[i] >= min_px]
    for i in sizes:
        if i in big:
            continue
        ys, xs = np.nonzero(lab == i)
        cy, cx = ys.mean(), xs.mean()
        best = min(big, key=lambda j: np.min((np.nonzero(lab == j)[0] - cy) ** 2 + (np.nonzero(lab == j)[1] - cx) ** 2))
        lab[lab == i] = best
    out = []
    for i in big:
        m = lab == i
        ys, xs = np.nonzero(m)
        out.append((int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1, m))
    out.sort(key=lambda c: (c[0] + c[2]) / 2)  # 가운데 x 순서
    return out


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
    comps = components(sheet[..., 3] > 0)
    if len(comps) != len(names):
        raise SystemExit(f'부위 {len(comps)}개를 찾았는데 이름은 {len(names)}개: {[c[:4] for c in comps]}')
    rig = json.load(open(RIG_JSON, encoding='utf-8'))
    body = rig['bodies'].setdefault(a.body, {})
    os.makedirs(os.path.join(ART, a.body), exist_ok=True)
    placed = []
    for name, (x0, y0, x1, y1, m) in zip(names, comps):
        part = np.zeros((y1 - y0, x1 - x0, 4), np.uint8)
        sub = m[y0:y1, x0:x1]
        part[sub] = sheet[y0:y1, x0:x1][sub]
        px, py, score = best_place(part, base)
        placed.append([name, part, px, py, score])
    # 왼발·오른발은 놓인 자리로 다시 정한다(화면 왼쪽 = foot_L)
    feet = [p for p in placed if p[0] in ('foot_L', 'foot_R')]
    if len(feet) == 2:
        feet.sort(key=lambda p: p[2])
        feet[0][0], feet[1][0] = 'foot_L', 'foot_R'
    for name, part, px, py, score in placed:
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
