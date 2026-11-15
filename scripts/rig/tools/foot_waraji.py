#!/usr/bin/env python3
"""기본 맨발 저장 + 흰 버선(다비)·짚신(와라지) 발 만들기 (GDD 115-A 137, 사용자 2026-11-15 "지금 무월 발 좋거든? 이 발 앞으로 맨발 쓰는 캐릭 기본발로 할거야 …
쟤 발만 일단 저장해놓고, 저 발 흰색으로 바꾸고 블리치의 짚신처럼 한칸 덧씌운거 도트 찍어봐바").
- 맨발: 무월 발 두 조각을 그대로 docs/design/rig-draft/parts-lib/foot-bare/ 에 복사(앞발 foot_f 15×17, 뒷발 foot_b 10×17).
- 짚신: 살색 → 흰 버선(발목 아래만, 엄지 갈라진 선 하나만 남김), 발바닥 아래에 짚 한 줄 + 외곽선 한 줄(그림이 아래로 1칸 커짐), 끈(엄지 사이 → 발등 → 발목 띠, 옆 고리).
  → parts-lib/foot-waraji/. 아직 어느 인형에도 안 끼움(시안).
사용: python3 scripts/rig/tools/foot_waraji.py [미리보기.png]
"""
import os
import sys

import numpy as np
from PIL import Image

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from paths import DRAFT_DIR  # noqa: E402

SKIN = {(250, 198, 154): (246, 246, 242), (201, 130, 99): (200, 203, 212), (236, 172, 132): (228, 229, 232), (242, 202, 165): (255, 255, 255),
        (121, 70, 54): (228, 229, 232), (162, 101, 78): (184, 187, 198)}
SPLIT = (150, 153, 166)   # 엄지 갈라진 선
STRAW, STRAW_D = (203, 166, 96), (150, 116, 62)
OUT = (0, 0, 0)
# 조각마다: sock = 이 줄부터 아래가 버선, split = 엄지 갈라진 자리(x, y), 끈 칸(밝은 짚)·그늘 칸(어두운 짚)
SPEC = {
    # white = 버선 안에 남은 검은 칸(발가락 사이)을 흰색으로, split = 엄지 갈라진 선, strap = 끈(엄지 사이 → 발등 → 발목 띠)
    'foot_f': {'sock': 7, 'white': [(2, 15), (4, 15)], 'split': [(2, 14), (2, 15)], 'strap': [(3, 13), (5, 12), (7, 11), (8, 10), (9, 10), (10, 10), (11, 10), (12, 10)]},
    'foot_b': {'sock': 7, 'white': [(3, 15)], 'split': [(2, 14), (2, 15)], 'strap': [(3, 13), (3, 12), (3, 11), (1, 10), (2, 10), (3, 10), (4, 10)]},
}


def make(name):
    a = np.array(Image.open(os.path.join(DRAFT_DIR, 'mugetsu', 'parts', name + '.png')).convert('RGBA'))
    h, w = a.shape[:2]
    sp = SPEC[name]
    b = np.zeros((h + 1, w, 4), np.uint8)
    b[:h] = a
    for y in range(sp['sock'], h):
        for x in range(w):
            c = tuple(int(v) for v in b[y, x, :3])
            if b[y, x, 3] and c in SKIN:
                b[y, x, :3] = SKIN[c]
    y0 = sp['sock']  # 버선 목: 한 줄 그늘
    for x in range(w):
        if b[y0, x, 3] and tuple(int(v) for v in b[y0, x, :3]) != OUT:
            b[y0, x, :3] = (200, 203, 212)
    for x, y in sp['white']:
        b[y, x] = (246, 246, 242, 255)
    for x, y in sp['split']:
        b[y, x] = (*SPLIT, 255)
    for x, y in sp['strap']:
        b[y, x] = (*STRAW, 255)
    # 짚신 바닥: 칸마다 맨 아래 외곽선을 짚으로, 그 아래에 외곽선 한 줄. 맨 앞·맨 뒤 칸은 외곽선 그대로
    xs = [x for x in range(w) if b[:, x, 3].any()]
    low = {x: max(y for y in range(h) if b[y, x, 3]) for x in xs}
    for x in xs[1:-1]:
        b[low[x], x] = (*(STRAW_D if x in (xs[1], xs[-2]) else STRAW), 255)  # 양 끝만 어두운 짚
        b[low[x] + 1, x] = (*OUT, 255)
    for x in (xs[0], xs[-1]):  # 양 끝은 한 칸 내려 닫는다
        if not b[low[x] + 1, x, 3] and x in (xs[0], xs[-1]):
            nb = xs[1] if x == xs[0] else xs[-2]
            if low[nb] + 1 > low[x]:
                b[low[x] + 1:low[nb] + 2, x] = (*OUT, 255)
    # 짚이 바깥에 드러난 곳은 외곽선으로 막는다
    for y in range(h + 1):
        for x in range(w):
            if b[y, x, 3] and tuple(int(v) for v in b[y, x, :3]) in (STRAW, STRAW_D) and y >= min(low.values()):
                for dx, dy in ((1, 0), (-1, 0), (0, 1)):
                    xx, yy = x + dx, y + dy
                    if 0 <= xx < w and 0 <= yy <= h and not b[yy, xx, 3]:
                        b[yy, xx] = (*OUT, 255)
    return a, b


def main():
    lib = os.path.join(DRAFT_DIR, 'parts-lib')
    tiles = []
    for name in ('foot_f', 'foot_b'):
        a, b = make(name)
        Image.fromarray(a).save(os.path.join(lib, 'foot-bare', name + '.png'))
        Image.fromarray(b).save(os.path.join(lib, 'foot-waraji', name + '.png'))
        tiles += [a, b]
    if len(sys.argv) > 1:
        K = 12
        o = Image.new('RGBA', ((15 + 15 + 10 + 10 + 5 * 4) * K, 26 * K), (120, 160, 120, 255))
        x = 4
        for t in (tiles[0], tiles[2], tiles[1], tiles[3]):  # 맨발 앞·뒤, 짚신 앞·뒤
            im = Image.fromarray(t).resize((t.shape[1] * K, t.shape[0] * K), Image.NEAREST)
            o.alpha_composite(im, (x * K, 4 * K))
            x += t.shape[1] + 4
        o.save(sys.argv[1])
    print('맨발·짚신 발 저장', lib)


if __name__ == '__main__':
    main()
