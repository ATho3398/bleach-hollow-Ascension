#!/usr/bin/env python3
"""그림을 '가장 긴 쪽 N칸' 도트로 다시 찍는다 (기본 32).

그림의 보이는 부분만 잘라, 긴 쪽을 N칸으로 나눈 같은 크기 칸마다 가운데 부분의 중간값 색 하나를 뽑는다.
늘리는 경우(원본이 N칸보다 작을 때)도 같은 방식이라 칸이 깨지지 않는다. 짧은 쪽 칸 수는 비율대로.

사용:
  python3 scripts/depixel/fit.py 그림.webp [그림2.png ...] [--size 32] [--out 폴더] [--ext webp]
출력: <out>/<이름>.<ext> (1칸 = 1픽셀, 투명 배경) + 확인용 <이름>-x8.png
"""
from __future__ import annotations

import argparse
import os

import numpy as np
from PIL import Image


def fit(a: np.ndarray, size: int, cell_px: float | None = None) -> np.ndarray:
    op = a[..., 3] > 128
    ys, xs = np.nonzero(op)
    a = a[ys.min():ys.max() + 1, xs.min():xs.max() + 1]
    h, w = a.shape[:2]
    cell = cell_px or max(h, w) / size  # cell_px: 여러 그림을 같은 배율로(키 맞추기)
    nx, ny = max(1, round(w / cell)), max(1, round(h / cell))
    cw, ch = w / nx, h / ny  # 짧은 쪽은 반올림 때문에 칸이 아주 조금 다를 수 있다
    out = np.zeros((ny, nx, 4), dtype=np.uint8)
    for j in range(ny):
        for i in range(nx):
            y0, y1 = j * ch, (j + 1) * ch
            x0, x1 = i * cw, (i + 1) * cw
            # 칸 가운데 60% (경계에서 번진 색 제외), 최소 1픽셀
            my, mx = (y1 - y0) * 0.2, (x1 - x0) * 0.2
            ya, yb = int(y0 + my), max(int(y0 + my) + 1, int(np.ceil(y1 - my)))
            xa, xb = int(x0 + mx), max(int(x0 + mx) + 1, int(np.ceil(x1 - mx)))
            c = a[ya:yb, xa:xb].reshape(-1, 4)
            solid = c[c[:, 3] > 128]
            if len(solid) * 2 < len(c):
                continue
            out[j, i, :3] = np.median(solid[:, :3], 0)
            out[j, i, 3] = 255
    return out


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('images', nargs='+')
    ap.add_argument('--size', type=int, default=32, help='긴 쪽 칸 수 (기본 32)')
    ap.add_argument('--cell', type=float, help='한 칸 = 원본 몇 픽셀 (주면 --size 대신 모든 그림을 같은 배율로)')
    ap.add_argument('--out', default='scripts/depixel/out/fit')
    ap.add_argument('--ext', default='png', choices=['png', 'webp'])
    args = ap.parse_args()
    os.makedirs(args.out, exist_ok=True)
    for path in args.images:
        name = os.path.splitext(os.path.basename(path))[0]
        dot = fit(np.array(Image.open(path).convert('RGBA')), args.size, args.cell)
        im = Image.fromarray(dot)
        dst = os.path.join(args.out, f'{name}.{args.ext}')
        im.save(dst, lossless=True) if args.ext == 'webp' else im.save(dst)
        im.resize((im.width * 8, im.height * 8), Image.NEAREST).save(os.path.join(args.out, f'{name}-x8.png'))
        print(f'{name}: {im.width}×{im.height} → {dst}')


if __name__ == '__main__':
    main()
