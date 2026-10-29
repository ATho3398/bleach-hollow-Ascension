#!/usr/bin/env python3
"""임시 부위 그림 (GDD 96장 39~41): 움직임 먼저 맞추려고 단순한 도형으로 그린 자리 채움 그림.
사용자가 가이드 칸에 진짜 도트를 그려 오면 import_cut.py 로 바꾼다(이 그림은 그때 버린다).

그리는 것(작업본):
  사람형 역관절 다리  humanoid/dg/   (몸 bare_dg = 알몸 + 역관절 다리: 허벅지 leg_* · 정강이 shin_* · 발 foot_*)
  사람형 망토         humanoid/cape/  (외형 cape-test 의 cape 층)
  짐승형(네 발)       beast/test/     (beast.json 몸 test)
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


# 역관절 다리(앞 = 왼쪽): 엉덩이 → 뒤로 꺾인 관절 → 발목 → 앞으로 뻗은 발가락. 먼 쪽(_L)은 조금 어둡게
DG = {
    'L': {'hip': (11, 52), 'knee': (17, 62), 'ankle': (12, 72)},
    'R': {'hip': (20, 52), 'knee': (26, 62), 'ankle': (21, 72)},
}


def humanoid():
    rig = json.load(open(DRAFT_RIG_JSON, encoding='utf-8'))
    body = dict(rig['bodies']['bare'])
    piv = {}
    for side, p in DG.items():
        far = side == 'L'
        c, d = (BONE_D, (160, 148, 122)) if far else (BONE, BONE_D)
        hx, hy = p['hip']
        kx, ky = p['knee']
        ax, ay = p['ankle']
        body[f'leg_{side}'] = put(DRAFT_ART, f'dg/leg_{side}', [(limb((hx, hy - 1), (kx, ky), 9, 6), c, d)])
        body[f'shin_{side}'] = put(DRAFT_ART, f'dg/shin_{side}', [(limb((kx, ky), (ax, ay), 6, 4), c, d)])
        body[f'foot_{side}'] = put(DRAFT_ART, f'dg/foot_{side}', [([(ax - 2, ay - 2), (ax + 2, ay - 1), (ax + 1, ay + 7), (ax - 7, ay + 8), (ax - 7, ay + 5)], c, d)])
        piv[f'leg_{side}'], piv[f'shin_{side}'], piv[f'foot_{side}'] = [hx, hy], [kx, ky], [ax, ay]
    rig['bodies']['bare_dg'] = body
    bj = rig.setdefault('bodyJoints', {})
    cur = bj.get('bare_dg') if isinstance(bj.get('bare_dg'), dict) else {}
    cur.setdefault('pivots', {}).update(piv)
    bj['bare_dg'] = cur
    # 망토: 어깨(목 아래)에서 무릎까지, 몸 뒤
    cape = put(DRAFT_ART, 'cape/test', [([(13, 27), (22, 27), (27, 40), (30, 66), (24, 68), (17, 64), (10, 68), (4, 66), (7, 40)], CAPE, CAPE_D)])
    rig['looks']['cape-test']['cape'] = cape
    dump(rig)
    print('사람형: 역관절 다리·망토 임시 그림')


BEAST_DIR = os.path.join(DRAFT_DIR, 'beast')
BEAST_JSON = os.path.join(DRAFT_DIR, 'beast.json')
# 짐승형(네 발, 앞 = 왼쪽). 먼 쪽 다리(_L)는 오른쪽으로 3칸 밀고 어둡게
FAR = 3


def beast():
    rig = json.load(open(BEAST_JSON, encoding='utf-8'))
    piv = {b['id']: b['pivot'] for b in rig['bones']}
    parts = {}
    parts['body'] = put(BEAST_DIR, 'test/body', [([(16, 14), (24, 9), (40, 9), (50, 12), (52, 18), (48, 26), (36, 28), (22, 28), (16, 24)], TEAL, TEAL_D),
                                                ([(22, 9), (40, 8), (49, 11), (44, 14), (28, 14), (20, 13)], BONE, BONE_D)], w=90, h=60, ox=-10, oy=-10)
    parts['head'] = put(BEAST_DIR, 'test/head', [([(-2, 13), (4, 8), (14, 8), (21, 13), (19, 19), (10, 22), (2, 22), (-3, 19)], BONE, BONE_D)], w=90, h=60, ox=-10, oy=-10)
    # 눈
    hp = os.path.join(BEAST_DIR, 'test/head.png')
    h = np.array(Image.open(hp))
    ex, ey = 4 - parts['head']['at'][0], 13 - parts['head']['at'][1]
    h[ey, ex] = (240, 170, 30, 255)
    h[ey, ex + 1] = (*OUT, 255)
    Image.fromarray(h).save(hp)
    parts['tail'] = put(BEAST_DIR, 'test/tail', [(limb((48, 15), (57, 10), 6, 4), TEAL, TEAL_D)], w=90, h=60, ox=-10, oy=-10)
    parts['tail2'] = put(BEAST_DIR, 'test/tail2', [(limb((56, 10), (64, 4), 4, 2), TEAL, TEAL_D)], w=90, h=60, ox=-10, oy=-10)
    for side, dx in (('R', 0), ('L', FAR)):
        c, d = (TEAL, TEAL_D) if side == 'R' else (TEAL_D, (12, 40, 48))
        bc, bd = (BONE, BONE_D) if side == 'R' else (BONE_D, (160, 148, 122))
        sx, sy = piv[f'fleg_{side}']
        ex, ey = piv[f'fleg_{side}2']
        parts[f'fleg_{side}'] = put(BEAST_DIR, f'test/fleg_{side}', [(limb((sx, sy - 2), (ex, ey), 7, 5), c, d)], w=90, h=60, ox=-10, oy=-10)
        parts[f'fleg_{side}2'] = put(BEAST_DIR, f'test/fleg_{side}2', [(limb((ex, ey), (ex - 1, 37), 5, 4), c, d),
                                                                          ([(ex - 5, 36), (ex + 2, 36), (ex + 2, 39), (ex - 6, 39)], bc, bd)], w=90, h=60, ox=-10, oy=-10)
        hx, hy = piv[f'hleg_{side}']
        kx, ky = piv[f'hleg_{side}2']
        parts[f'hleg_{side}'] = put(BEAST_DIR, f'test/hleg_{side}', [(limb((hx - 1, hy - 2), (kx, ky), 9, 5), c, d)], w=90, h=60, ox=-10, oy=-10)
        parts[f'hleg_{side}2'] = put(BEAST_DIR, f'test/hleg_{side}2', [(limb((kx, ky), (kx - 4, 37), 4, 4), c, d),
                                                                          ([(kx - 9, 36), (kx - 2, 36), (kx - 2, 39), (kx - 10, 39)], bc, bd)], w=90, h=60, ox=-10, oy=-10)
    rig['bodies']['test'] = parts
    s = json.dumps(rig, ensure_ascii=False, indent=1)
    open(BEAST_JSON, 'w', encoding='utf-8').write(s + '\n')
    print('짐승형: 임시 그림', len(parts), '조각')


if __name__ == '__main__':
    humanoid()
    beast()
