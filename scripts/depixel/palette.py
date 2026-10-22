#!/usr/bin/env python3
"""도트 그림 색 수 제한 — 그림마다 N색 이하(기본 16, 투명 제외)로 줄인다.

보이는 칸의 색만 모아 Lab 공간 k-평균으로 N색 팔레트를 만들고, 칸마다 가장 가까운 색으로 바꾼다(디더링 없음).
같은 캐릭터의 여러 프레임은 --shared 로 한 팔레트를 같이 쓴다(프레임마다 색이 달라 깜빡이지 않게).

사용: python3 scripts/depixel/palette.py 그림.png [...] [--colors 16] [--shared] [--out 폴더]
"""
from __future__ import annotations

import argparse
import os

import numpy as np
from PIL import Image


def _lab(rgb: np.ndarray) -> np.ndarray:
    """sRGB → CIE Lab (색 거리를 눈에 보이는 차이에 가깝게)."""
    c = rgb / 255.0
    c = np.where(c > 0.04045, ((c + 0.055) / 1.055) ** 2.4, c / 12.92)
    xyz = c @ np.array([[0.4124, 0.3576, 0.1805], [0.2126, 0.7152, 0.0722], [0.0193, 0.1192, 0.9505]]).T
    xyz /= np.array([0.95047, 1.0, 1.08883])
    f = np.where(xyz > 0.008856, np.cbrt(xyz), 7.787 * xyz + 16 / 116)
    return np.stack([116 * f[:, 1] - 16, 500 * (f[:, 0] - f[:, 1]), 200 * (f[:, 1] - f[:, 2])], 1)


def make_palette(pixels: np.ndarray, n: int) -> np.ndarray:
    """보이는 칸 RGB 목록(k×3) → n색 이하 팔레트.
    색별 칸 수의 제곱근을 무게로 Lab 공간 k-평균. 시작점은 '가장 먼 색' 순서로 골라
    피부·눈처럼 칸 수는 적어도 뚜렷이 다른 색이 큰 덩어리(검은 옷 등)에 묻히지 않게 한다."""
    uniq, cnt = np.unique(pixels, axis=0, return_counts=True)
    if len(uniq) <= n:
        return uniq
    lab = _lab(uniq.astype(float))
    wt = np.sqrt(cnt)
    centers = [lab[cnt.argmax()]]
    for _ in range(n - 1):
        d = np.min([((lab - c) ** 2).sum(1) for c in centers], 0) * wt
        centers.append(lab[d.argmax()])
    centers = np.array(centers)
    for _ in range(30):
        lbl = ((lab[:, None, :] - centers[None]) ** 2).sum(2).argmin(1)
        new = np.array([np.average(lab[lbl == k], 0, wt[lbl == k]) if (lbl == k).any() else centers[k] for k in range(n)])
        if np.allclose(new, centers):
            break
        centers = new
    lbl = ((lab[:, None, :] - centers[None]) ** 2).sum(2).argmin(1)
    # 팔레트 색 = 각 무리에서 가장 많이 쓰인 원래 색(평균색이 아니라 실제 있던 색)
    pal = [uniq[lbl == k][cnt[lbl == k].argmax()] for k in range(n) if (lbl == k).any()]
    return np.array(pal)


def apply(a: np.ndarray, pal: np.ndarray) -> np.ndarray:
    out = a.copy()
    op = a[..., 3] > 0
    px = a[op][:, :3].astype(int)
    d = ((_lab(px.astype(float))[:, None, :] - _lab(pal.astype(float))[None]) ** 2).sum(2)
    out[op, :3] = pal[d.argmin(1)]
    out[op, 3] = 255
    return out


def colors(a: np.ndarray) -> int:
    return len(np.unique(a[a[..., 3] > 0][:, :3], axis=0))


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('images', nargs='+')
    ap.add_argument('--colors', type=int, default=16)
    ap.add_argument('--shared', action='store_true', help='모든 입력 그림이 한 팔레트를 같이 쓴다')
    ap.add_argument('--out', default='scripts/depixel/out/palette')
    args = ap.parse_args()
    os.makedirs(args.out, exist_ok=True)
    imgs = [(p, np.array(Image.open(p).convert('RGBA'))) for p in args.images]
    shared = None
    if args.shared:
        shared = make_palette(np.concatenate([a[a[..., 3] > 0][:, :3] for _, a in imgs]), args.colors)
    for p, a in imgs:
        pal = shared if shared is not None else make_palette(a[a[..., 3] > 0][:, :3], args.colors)
        out = apply(a, pal)
        Image.fromarray(out).save(os.path.join(args.out, os.path.basename(p)))
        print(f'{os.path.basename(p)}: {colors(a)}색 → {colors(out)}색')


if __name__ == '__main__':
    main()
