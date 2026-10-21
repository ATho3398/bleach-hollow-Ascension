#!/usr/bin/env python3
"""도트 그림 색 누그러뜨리기 — 너무 쨍한 AI 색을 기존 그림들 톤에 맞춘다.

- 채도: 진한 색일수록 더 많이 낮춘다 (s' = s * sat, 단 회색에 가까운 색은 거의 그대로)
- 밝기: 색 있는 칸만 val 배
- 흰색: 순백을 따뜻한 크림색 쪽으로(기존 사신 그림의 흰 옷 색)
- 검은 외곽선은 그대로

사용: python3 scripts/depixel/tone.py 그림.png [...] [--sat 0.72] [--val 0.94] [--out 폴더]
"""
from __future__ import annotations

import argparse
import colorsys
import os

import numpy as np
from PIL import Image

CREAM = np.array([250, 240, 222]) / 255  # 기존 사신 판(sheet08) 흰 옷의 중간값 근처


def tone(a: np.ndarray, sat: float, val: float) -> np.ndarray:
    out = a.copy()
    op = a[..., 3] > 0
    for y, x in zip(*np.nonzero(op)):
        r, g, b = a[y, x, :3] / 255
        h, s, v = colorsys.rgb_to_hsv(r, g, b)
        if v > 0.85 and s < 0.15:
            # 흰색 계열: 밝기는 유지하고 크림색 쪽으로 70%
            rgb = np.array([r, g, b]) * 0.3 + CREAM * (v / CREAM.max()) * 0.7
        else:
            w = min(1.0, s / 0.35)  # 채도 낮은 색은 덜 건드린다
            s2 = s * (1 - w * (1 - sat))
            v2 = v * (1 - w * (1 - val)) if v > 0.2 else v
            rgb = np.array(colorsys.hsv_to_rgb(h, s2, v2))
        out[y, x, :3] = np.clip(np.round(rgb * 255), 0, 255)
    return out


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('images', nargs='+')
    ap.add_argument('--sat', type=float, default=0.72, help='진한 색 채도 배율 (기본 0.72)')
    ap.add_argument('--val', type=float, default=0.94, help='색 있는 칸 밝기 배율 (기본 0.94)')
    ap.add_argument('--out', default='scripts/depixel/out/tone')
    args = ap.parse_args()
    os.makedirs(args.out, exist_ok=True)
    for p in args.images:
        a = np.array(Image.open(p).convert('RGBA'))
        Image.fromarray(tone(a, args.sat, args.val)).save(os.path.join(args.out, os.path.basename(p)))
        print(os.path.basename(p), '→', args.out)


if __name__ == '__main__':
    main()
