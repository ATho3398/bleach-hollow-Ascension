#!/usr/bin/env python3
"""도트 그림 한 장 → 대기·걷기·공격·피격 프레임 (줄 단위 밀기).

그림을 부위로 자르지 않는다. 가로 줄을 통째로 옆으로 밀거나(기울기) 줄을 빼고 넣어(숨쉬기·웅크림)
움직이므로 모든 줄이 원래 그림 그대로 남아 구멍이 생기지 않고, 칸 단위라 도트도 깨지지 않는다.
공격은 무기 공용 이펙트(초승달 베기)를 캐릭터 앞에 덧그린다. 그림은 왼쪽을 본다(기획서 17-6).

사용:
  python3 scripts/depixel/rowanim.py 그림.png [--out 폴더] [--waist 0.62] [--fx 255,240,220]
출력(<out>/<이름>/, 기획서 26-2 이름 규칙): idle-1~3, move-1~4, attack-1~4, hit-1~2 .png(1배, 같은 캔버스),
  anim.json, 확인용 <동작>-x6.gif
"""
from __future__ import annotations

import argparse
import json
import os

import numpy as np
from PIL import Image

PAD_L, PAD_R, PAD_TOP = 22, 8, 4  # 왼쪽(앞)은 튀어나가기·베기 이펙트 자리


def load(path: str) -> np.ndarray:
    a = np.array(Image.open(path).convert('RGBA'))
    op = a[..., 3] > 0
    ys, xs = np.nonzero(op)
    a = a[ys.min():ys.max() + 1, xs.min():xs.max() + 1]
    h, w = a.shape[:2]
    c = np.zeros((h + PAD_TOP, w + PAD_L + PAD_R, 4), np.uint8)
    c[PAD_TOP:, PAD_L:PAD_L + w] = a
    return c


def shift_rows(a: np.ndarray, offsets) -> np.ndarray:
    """줄 y 를 offsets[y] 칸만큼 가로로 민다(음수 = 왼쪽 = 앞)."""
    out = np.zeros_like(a)
    w = a.shape[1]
    for y, d in enumerate(offsets):
        d = int(d)
        if d == 0:
            out[y] = a[y]
        elif d > 0:
            out[y, d:] = a[y, :w - d]
        else:
            out[y, :w + d] = a[y, -d:]
    return out


def lean(a: np.ndarray, top: int, pivot: int, amount: float) -> np.ndarray:
    """pivot 줄 위쪽을 기울인다: 맨 위 줄이 amount 칸, pivot 줄은 0칸."""
    h = a.shape[0]
    offs = [0] * h
    for y in range(h):
        if y < pivot:
            offs[y] = round(amount * (pivot - y) / max(1, pivot - top))
    return shift_rows(a, offs)


def squash(a: np.ndarray, row: int, n: int) -> np.ndarray:
    """row 줄 근처에서 n 줄을 빼서(겹쳐) 위쪽 전체를 n 칸 내린다(숨 내쉼·웅크림). 아래(발)는 그대로."""
    if n <= 0:
        return a
    out = np.zeros_like(a)
    out[row + 1:] = a[row + 1:]
    out[n:row + 1] = a[:row + 1 - n]
    return out


def move(a: np.ndarray, dx: int, dy: int) -> np.ndarray:
    out = np.zeros_like(a)
    h, w = a.shape[:2]
    ys, yd = (slice(0, h - dy), slice(dy, h)) if dy >= 0 else (slice(-dy, h), slice(0, h + dy))
    xs, xd = (slice(0, w - dx), slice(dx, w)) if dx >= 0 else (slice(-dx, w), slice(0, w + dx))
    out[yd, xd] = a[ys, xs]
    return out


def sway(a: np.ndarray, rows: range, x_from: int, d: int) -> np.ndarray:
    """rows 안에서 x_from 오른쪽(뒤로 흩날리는 머리카락·옷자락)만 d 칸 민다."""
    out = a.copy()
    for y in rows:
        seg = a[y, x_from:].copy()
        out[y, x_from:] = 0
        if d >= 0:
            out[y, x_from + d:] = seg[:seg.shape[0] - d]
        else:
            out[y, x_from:x_from + seg.shape[0] + d] = seg[-d:]
        # 밀려서 빈 칸은 원래 그림으로(구멍 방지)
        hole = (out[y, :, 3] == 0) & (a[y, :, 3] > 0)
        out[y, hole] = a[y, hole]
    return out


def flash(a: np.ndarray, k: float = 0.75) -> np.ndarray:
    out = a.copy()
    op = a[..., 3] > 0
    out[op, :3] = (a[op, :3] * (1 - k) + 255 * k).astype(np.uint8)
    return out


def slash(a: np.ndarray, cx: int, cy: int, r: int, thick: int, a0: float, a1: float, color, edge) -> np.ndarray:
    """캐릭터 앞(왼쪽)에 초승달 베기 이펙트를 칸 단위로 덧그린다."""
    out = a.copy()
    h, w = a.shape[:2]
    for y in range(h):
        for x in range(w):
            dx, dy = x - cx, y - cy
            d = (dx * dx + dy * dy) ** 0.5
            ang = np.degrees(np.arctan2(dy, dx)) % 360  # 90 = 아래, 180 = 왼쪽(앞), 270 = 위
            if a0 <= ang <= a1 and r - thick <= d <= r:
                t = (ang - a0) / max(1e-6, a1 - a0)
                core = d >= r - thick * (0.35 + 0.65 * np.sin(np.pi * t))
                if core or abs(d - (r - thick)) < 1:
                    out[y, x] = (*(color if d > r - 1.5 else edge), 255)
    return out


def build(a: np.ndarray, waist_frac: float, fx_color, fx_edge):
    h, w = a.shape[:2]
    op = a[..., 3] > 0
    top = int(np.nonzero(op.any(1))[0][0])
    ground = int(np.nonzero(op.any(1))[0][-1])
    waist = top + int((ground - top) * waist_frac)
    xs = np.nonzero(op.any(0))[0]
    mid_x = (xs[0] + xs[-1]) // 2
    hair_rows = range(top, top + (waist - top) // 2)

    idle = [
        a,
        squash(a, waist, 1),
        sway(squash(a, waist, 1), hair_rows, mid_x, 1),
    ]
    move_ = []
    for i in range(4):
        f = lean(a, top, waist, -1)                         # 앞으로 살짝 기울여 걷기
        f = shift_rows(f, [((1 if i % 2 == 0 else -1) if y > waist + (ground - waist) // 2 else 0) for y in range(h)])  # 옷자락 흔들기
        if i % 2 == 1:
            f = move(f, 0, -1)                              # 통통 들썩
        f = sway(f, hair_rows, mid_x, 1 if i in (1, 2) else 0)
        move_.append(f)
    # 공격: 웅크리며 뒤로 젖힘 → 앞으로 튀어나가며 베기 → 이펙트 유지 → 복귀
    a1 = squash(lean(a, top, waist, 2), waist, 1)
    a2 = move(lean(a, top, waist, -3), -4, 0)
    # 이펙트: 몸 앞쪽 안에 중심을 두고 왼쪽으로 불룩한 초승달(위 → 아래로 휘두름)
    r = int((ground - top) * 0.45)
    cx, cy = xs[0] + r // 2, top + int((ground - top) * 0.45)
    a3 = slash(move(lean(a, top, waist, -2), -3, 0), cx - 3, cy, r, max(3, r // 3), 105, 262, fx_color, fx_edge)
    a2 = slash(a2, cx - 4, cy, r, max(2, r // 5), 205, 262, fx_color, fx_edge)
    a4 = move(lean(a, top, waist, -1), -1, 0)
    hit = [flash(move(lean(a, top, waist, 2), 2, 0)), move(lean(a, top, waist, 1), 1, 0)]
    return {'idle': idle, 'move': move_, 'attack': [a1, a2, a3, a4], 'hit': hit}


ANIM = {
    'idle': {'ms': [500, 350, 400]},
    'move': {'ms': 150},
    'attack': {'ms': [160, 70, 140, 180], 'hit': 2},
    'hit': {'ms': [90, 140]},
}


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('image')
    ap.add_argument('--out', default='scripts/depixel/out/rowanim')
    ap.add_argument('--waist', type=float, default=0.62, help='허리 높이(위에서부터 비율). 이 줄 위가 기울고 숨쉰다')
    ap.add_argument('--fx', default='255,244,226', help='베기 이펙트 가운데 색 R,G,B')
    ap.add_argument('--fx-edge', default='200,60,60', help='베기 이펙트 가장자리 색 R,G,B')
    args = ap.parse_args()
    name = os.path.splitext(os.path.basename(args.image))[0]
    d = os.path.join(args.out, name)
    os.makedirs(d, exist_ok=True)
    a = load(args.image)
    fx = tuple(int(v) for v in args.fx.split(','))
    edge = tuple(int(v) for v in args.fx_edge.split(','))
    sets = build(a, args.waist, fx, edge)
    for motion, frames in sets.items():
        gif = []
        for i, f in enumerate(frames, 1):
            Image.fromarray(f).save(os.path.join(d, f'{motion}-{i}.png'))
            bg = Image.new('RGBA', (f.shape[1], f.shape[0]), (58, 56, 66, 255))
            bg.alpha_composite(Image.fromarray(f))
            gif.append(bg.convert('RGB').resize((f.shape[1] * 6, f.shape[0] * 6), Image.NEAREST))
        ms = ANIM[motion]['ms']
        gif[0].save(os.path.join(d, f'{motion}-x6.gif'), save_all=True, append_images=gif[1:],
                    duration=ms if isinstance(ms, list) else [ms] * len(gif), loop=0)
        print(f'{name} {motion}: {len(frames)}장')
    with open(os.path.join(d, 'anim.json'), 'w', encoding='utf-8') as f:
        json.dump(ANIM, f, ensure_ascii=False, indent=1)


if __name__ == '__main__':
    main()
