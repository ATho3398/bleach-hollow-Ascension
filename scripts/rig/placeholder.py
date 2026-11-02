#!/usr/bin/env python3
"""임시 부위 그림 (GDD 96장 39~41): 움직임 먼저 맞추려고 단순한 도형으로 그린 자리 채움 그림.
사용자가 가이드 칸에 진짜 도트를 그려 오면 import_cut.py 로 바꾼다(이 그림은 그때 버린다).

그리는 것(작업본):
  사람형 역관절 몸    humanoid/dgref/ (몸 dg = 뼈대 선 skeletons.dg 를 굵게 칠한 막대 인형, GDD 115-A 47)
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


# 역관절 몸 dg (GDD 115-A 47): 사용자 도트 준거(세 번째 사진 왼쪽 위 — 뿔 난 흰 호로, 정면 그림)의 비율을 옆모습으로 옮긴 뼈대.
# 키 42칸(뿔 포함 머리가 거의 절반), 무릎까지 내려오는 긴 발톱 팔, 짧은 역관절 다리. 발 = 바닥 줄 y=80. 앞 = 왼쪽, _L = 먼 쪽
DG_SKELETON = {
    'head': [{'pts': [[15, 56], [15, 46]], 'w': 11}, {'pts': [[12, 47], [10, 39]], 'w': 3}, {'pts': [[19, 47], [21, 39]], 'w': 3}],
    'torso': [{'pts': [[16, 56], [16, 68]], 'w': 10}],
    'arm_L': [{'pts': [[13, 59], [11, 69], [8, 77]], 'w': 4}],
    'arm_R': [{'pts': [[19, 59], [18, 67]], 'w': 5}],
    'forearm_R': [{'pts': [[18, 67], [14, 76]], 'w': 4}],
    'leg_L': [{'pts': [[14, 68], [18, 73]], 'w': 6}],
    'shin_L': [{'pts': [[18, 73], [14, 78]], 'w': 5}],
    'foot_L': [{'pts': [[14, 78], [9, 79]], 'w': 4}],
    'leg_R': [{'pts': [[18, 68], [22, 73]], 'w': 6}],
    'shin_R': [{'pts': [[22, 73], [18, 78]], 'w': 5}],
    'foot_R': [{'pts': [[18, 78], [13, 79]], 'w': 4}],
}
DG_PIVOTS = {'root': [16, 68], 'torso': [16, 68], 'head': [15, 56], 'arm_L': [13, 59], 'arm_R': [19, 59], 'forearm_R': [18, 67],
             'leg_L': [14, 68], 'leg_R': [18, 68], 'shin_L': [18, 73], 'shin_R': [22, 73], 'foot_L': [14, 78], 'foot_R': [18, 78]}


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
    rig.setdefault('skeletons', {})['dg'] = DG_SKELETON
    rig['bodies']['dg'] = {slot: put(DRAFT_ART, f'dgref/{slot}', skeleton_polys(st, slot.endswith('_L')))
                           for slot, st in DG_SKELETON.items()}
    rig.setdefault('bodyJoints', {})['dg'] = {'pivots': dict(DG_PIVOTS)}
    # 망토: 어깨(목 아래)에서 무릎까지, 몸 뒤
    cape = put(DRAFT_ART, 'cape/test', [([(13, 27), (22, 27), (27, 40), (30, 66), (24, 68), (17, 64), (10, 68), (4, 66), (7, 40)], CAPE, CAPE_D)])
    rig['looks']['cape-test']['cape'] = cape
    dump(rig)
    print('사람형: 역관절 몸 dg·망토 임시 그림')


if __name__ == '__main__':
    humanoid()
