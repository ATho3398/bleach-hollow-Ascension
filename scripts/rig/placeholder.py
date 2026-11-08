#!/usr/bin/env python3
"""임시 부위 그림 (GDD 96장 39~41): 움직임 먼저 맞추려고 단순한 도형으로 그린 자리 채움 그림.
사용자가 가이드 칸에 진짜 도트를 그려 오면 import_cut.py 로 바꾼다(이 그림은 그때 버린다).

그리는 것(작업본):
  사람형 망토         humanoid/cape/  (외형 cape-test 의 cape 층)
부위마다 캔버스 좌표 다각형 → 꼭 맞게 잘라 저장하고, 작업본 데이터의 at·size 를 그 자리로 맞춘다.
사용: python3 scripts/rig/placeholder.py
"""
from __future__ import annotations

import json
import os
import sys

import numpy as np
from PIL import Image, ImageDraw

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from paths import DRAFT_ART, DRAFT_DIR, DRAFT_RIG_JSON  # noqa: E402
from feet_weapon import dump  # noqa: E402

OUT = (24, 20, 26)
BONE, BONE_D = (236, 226, 198), (196, 184, 156)
SKIN, SKIN_D = (214, 170, 140), (176, 132, 108)
CAPE, CAPE_D = (150, 28, 36), (104, 18, 26)
TEAL, TEAL_D = (32, 96, 108), (20, 62, 72)


def shape(polys, w=120, h=90, ox=-30, oy=-10):
    """[(다각형, 색, 어두운 색)] → (RGBA 그림, 왼쪽 위 캔버스 자리). 겉 1줄은 윤곽, 아래쪽 절반은 어두운 색"""
    img = np.zeros((h, w, 4), np.uint8)
    for pts, col, dark in polys:
        m = Image.new('L', (w, h), 0)
        ImageDraw.Draw(m).polygon([(x - ox, y - oy) for x, y in pts], fill=255)
        a = np.array(m) > 0
        if not a.any():
            continue
        ys = np.nonzero(a.any(1))[0]
        mid = (ys[0] + ys[-1]) / 2
        edge = a & ~(np.roll(a, 1, 0) & np.roll(a, -1, 0) & np.roll(a, 1, 1) & np.roll(a, -1, 1))
        yy = np.arange(h)[:, None].repeat(w, 1)
        img[a & (yy > mid + 1)] = (*dark, 255)
        img[a & (yy <= mid + 1)] = (*col, 255)
        img[edge] = (*OUT, 255)
    ys, xs = np.nonzero(img[..., 3])
    x0, y0 = xs.min(), ys.min()
    crop = img[y0:ys.max() + 1, x0:xs.max() + 1]
    return Image.fromarray(crop), [int(x0 + ox), int(y0 + oy)]


def put(art_root, name, polys, **kw):
    im, at = shape(polys, **kw)
    path = os.path.join(art_root, name + '.png')
    os.makedirs(os.path.dirname(path), exist_ok=True)
    im.save(path)
    return {'art': name, 'at': at, 'size': [im.width, im.height]}


def limb(a, b, wa, wb):
    """a → b 로 뻗은 굵기 wa → wb 의 막대(사각형)"""
    (ax, ay), (bx, by) = a, b
    dx, dy = bx - ax, by - ay
    n = max(1e-6, (dx * dx + dy * dy) ** 0.5)
    px, py = -dy / n, dx / n
    return [(ax + px * wa / 2, ay + py * wa / 2), (bx + px * wb / 2, by + py * wb / 2), (bx - px * wb / 2, by - py * wb / 2), (ax - px * wa / 2, ay - py * wa / 2)]


# 역관절 몸 dg 는 2026-11-08 부터 사용자 도트를 잘라 씀(scripts/rig/cut_ref.py humanoid, GDD 115-A 69) — 여기서 막대 인형을 만들지 않는다


def skeleton_polys(strokes, far):
    """뼈대 선(꺾은선 + 굵기) → 막대 다각형들 (임시 그림 = 뼈대를 굵게 칠한 것)"""
    c, d = (BONE_D, (160, 148, 122)) if far else (BONE, BONE_D)
    out = []
    for st in strokes:
        pts = st['pts']
        for p0, p1 in zip(pts, pts[1:]):
            out.append((limb(p0, p1, st['w'], st['w']), c, d))
    return out


def humanoid():
    rig = json.load(open(DRAFT_RIG_JSON, encoding='utf-8'))
    # 망토: 어깨(목 아래)에서 무릎까지, 몸 뒤
    cape = put(DRAFT_ART, 'cape/test', [([(13, 27), (22, 27), (27, 40), (30, 66), (24, 68), (17, 64), (10, 68), (4, 66), (7, 40)], CAPE, CAPE_D)])
    rig['looks']['cape-test']['cape'] = cape
    dump(rig)
    print('사람형: 망토 임시 그림')


if __name__ == '__main__':
    humanoid()
