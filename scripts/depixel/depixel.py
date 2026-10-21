#!/usr/bin/env python3
"""AI가 만든 '도트 느낌' 그림 → 진짜 도트 PNG(1칸 = 1픽셀).

도트를 크게 늘린 그림에는 일정 간격의 칸 경계가 숨어 있다. 색이 바뀌는 위치를 세어
칸 크기·시작 위치를 찾고(가로·세로 따로), 칸마다 가운데 부분의 중간값 색 하나를 뽑는다.

사용:
  python3 scripts/depixel/depixel.py 그림.png [그림2.png ...] [--out 폴더] [--split] [--cell 14.02]

출력(<out>/<이름>/):
  <이름>-dot.png      진짜 도트 그림(1배) — 도트 툴(Aseprite 등)에서 바로 편집
  <이름>-x8.png       확인용 8배 확대
  <이름>-<번호>.png   --split: 떨어져 있는 캐릭터마다 따로 자른 1배 그림
"""
from __future__ import annotations

import argparse
import os

import numpy as np
from PIL import Image


def edge_profile(a: np.ndarray, axis: int) -> np.ndarray:
    """axis 방향으로 옆 픽셀과 색이 크게 다른 곳의 개수(줄/열마다)."""
    d = np.abs(np.diff(a, axis=axis)).sum(2) > 80
    return d.sum(axis=1 - axis).astype(float)


def find_grid(g: np.ndarray, lo: float, hi: float) -> tuple[float, float, float]:
    """경계 개수 g 에 가장 잘 맞는 (칸 크기, 시작 위치, 맞음 정도 0~1)."""
    k = np.arange(len(g)) + 1  # diff 위치 i 는 픽셀 i 와 i+1 사이 → 경계 = i+1
    total = g.sum() or 1
    res = []
    for p in np.arange(lo, hi, 0.005):
        # 주기 p 성분의 크기 = 맞음 정도, 위상 = 시작 위치
        f = (g * np.exp(2j * np.pi * k / p)).sum() / total
        res.append((p, (np.angle(f) / (2 * np.pi) * p) % p, abs(f)))
    best = max(res, key=lambda r: r[2])
    # 칸 크기의 1/2, 1/3 도 같은 점수가 나온다 → 최고점의 2·3·4배 근처도 거의 같은 점수면 큰 쪽이 진짜 칸
    for m in (4, 3, 2):
        near = [r for r in res if abs(r[0] - best[0] * m) <= best[0] * m * 0.01]
        if near:
            r = max(near, key=lambda r: r[2])
            if r[2] >= best[2] * 0.85:
                return r
    return best


def depixel(a: np.ndarray, cell: float | None, lo: float, hi: float):
    h, w = a.shape[:2]
    if cell:
        # 칸 크기를 줬으면 시작 위치만 찾는다
        px = find_grid(edge_profile(a, 1), cell, cell + 0.005)
        py = find_grid(edge_profile(a, 0), cell, cell + 0.005)
    else:
        px = find_grid(edge_profile(a, 1), lo, hi)
        py = find_grid(edge_profile(a, 0), lo, hi)
    (cw, ox, sx), (ch, oy, sy) = px, py
    nx = int((w - ox) // cw)
    ny = int((h - oy) // ch)
    out = np.zeros((ny, nx, 4), dtype=np.uint8)
    mx, my = max(1, int(cw * 0.3)), max(1, int(ch * 0.3))  # 칸 가장자리(번진 부분)는 버린다
    for j in range(ny):
        y0, y1 = int(oy + j * ch) + my, int(oy + (j + 1) * ch) - my
        for i in range(nx):
            x0, x1 = int(ox + i * cw) + mx, int(ox + (i + 1) * cw) - mx
            c = a[y0:max(y1, y0 + 1), x0:max(x1, x0 + 1)].reshape(-1, 4)
            solid = c[c[:, 3] > 128]
            if len(solid) * 2 < len(c):
                continue
            out[j, i, :3] = np.median(solid[:, :3], 0)
            out[j, i, 3] = 255
    return out, (cw, ox, sx), (ch, oy, sy)


def split(dot: np.ndarray, gap: int = 1, min_px: int = 30) -> list[tuple[int, int, int, int]]:
    """빈 칸으로 떨어진 덩어리마다 상자(x0, y0, x1, y1). gap 칸 이내는 같은 덩어리로 본다."""
    op = dot[..., 3] > 0
    h, w = op.shape
    seen = np.zeros_like(op)
    boxes = []
    for sy, sx in zip(*np.nonzero(op)):
        if seen[sy, sx]:
            continue
        st = [(sy, sx)]
        seen[sy, sx] = True
        ys, xs = [], []
        while st:
            y, x = st.pop()
            ys.append(y); xs.append(x)
            for yy in range(y - gap, y + gap + 1):
                for xx in range(x - gap, x + gap + 1):
                    if 0 <= yy < h and 0 <= xx < w and op[yy, xx] and not seen[yy, xx]:
                        seen[yy, xx] = True
                        st.append((yy, xx))
        if len(ys) >= min_px:
            boxes.append((min(xs), min(ys), max(xs) + 1, max(ys) + 1))
    # 위 줄 → 아래 줄, 왼쪽 → 오른쪽
    boxes.sort(key=lambda b: (round(b[1] / max(1, h / 4)), b[0]))
    return boxes


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('images', nargs='+')
    ap.add_argument('--out', default='scripts/depixel/out')
    ap.add_argument('--split', action='store_true', help='캐릭터마다 따로 자르기')
    ap.add_argument('--cell', type=float, help='칸 크기(픽셀)를 직접 지정 (자동이 틀릴 때)')
    ap.add_argument('--min', type=float, default=3, help='자동 찾기 최소 칸 크기')
    ap.add_argument('--max', type=float, default=40, help='자동 찾기 최대 칸 크기')
    args = ap.parse_args()

    for path in args.images:
        name = os.path.splitext(os.path.basename(path))[0]
        a = np.array(Image.open(path).convert('RGBA')).astype(int)
        dot, gx, gy = depixel(a, args.cell, args.min, args.max)
        d = os.path.join(args.out, name)
        os.makedirs(d, exist_ok=True)
        Image.fromarray(dot).save(os.path.join(d, f'{name}-dot.png'))
        Image.fromarray(dot).resize((dot.shape[1] * 8, dot.shape[0] * 8), Image.NEAREST).save(
            os.path.join(d, f'{name}-x8.png'))
        warn = '' if min(gx[2], gy[2]) > 0.3 else '  (격자가 뚜렷하지 않음 — 결과 확인, 필요하면 --cell)'
        print(f'{name}: 칸 {gx[0]:.2f}×{gy[0]:.2f}px, 시작 ({gx[1]:.2f}, {gy[1]:.2f}), '
              f'맞음 {gx[2]:.2f}/{gy[2]:.2f} → {dot.shape[1]}×{dot.shape[0]} 도트{warn}')
        if args.split:
            for n, (x0, y0, x1, y1) in enumerate(split(dot), 1):
                part = dot[y0:y1, x0:x1]
                Image.fromarray(part).save(os.path.join(d, f'{name}-{n}.png'))
                print(f'  {name}-{n}.png  {x1 - x0}×{y1 - y0}')


if __name__ == '__main__':
    main()
