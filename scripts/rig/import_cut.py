#!/usr/bin/env python3
"""사용자가 자른 부위 시트 → 종이인형 부위 파일 + 자리 (GDD 96장).

시트 = 부위를 늘어놓은 1배 그림(부위끼리 안 닿게). 이어진 덩어리를 가운데 x 순서로 --parts 이름에 맞춘다(기본 head torso arm_L arm_R leg_L leg_R, 발까지 나눈 시트는 head,torso,arm_L,foot_L,arm_R,foot_R,leg_L,leg_R — 왼발·오른발은 놓인 자리로 다시 정함).
부위마다 기본형 그림(--base)에서 색이 가장 많이 겹치는 자리를 찾아 원래 자리(at = 캔버스 왼쪽 위 좌표)로 삼는다.
출력: public/art/rig/humanoid/<몸>/<부위>.png (꼭 맞게 자른 그림) + src/data/art/rig/humanoid.json 의 bodies.<몸> 갱신.
head 는 공통 머리라 public/art/rig/humanoid/head_bald.png 로 쓴다(--no-head 면 건너뜀).
몸 부위가 아닌 이름(전체 시트):
  hair·hair_back = 이 몸을 쓰는 외형의 머리카락 층(자리는 기본형과 겹치는 곳). 시트에 hair_back 이 없으면 그 외형의 뒷머리를 뺀다(일반머리에 합침).
  thumb_L = 칼 잡는 손 엄지(앞팔 뼈에 고정, 칼 앞에 그림). 새로 그린 조각이라 자리는 --at thumb_L=x,y.
  sword = 공통 칼(모든 외형). 손잡이 가운데가 손(weapon 관절)에 오게 놓고, 비스듬히 그린 만큼 쉬는 각도를 보정해서 손에 든 칼 각도는 그대로(곧게 세운 칼 = WEAPON_REST).
  scabbard = 공통 빈 칼집(모든 외형). 입구(윗줄 가운데)가 허리춤(scabbard 관절)에 온다.

가이드 시트(scripts/rig/guide.py 로 만든 칸 시트)에 그린 경우: --guide <guide.json>
  칸마다 불투명 칸만 읽어(가이드 테두리·흐린 그림·관절점은 반투명이라 무시) 꼭 맞게 자르고, 칸 안 자리 그대로 캔버스 자리로 넣는다.
  빈 칸은 건너뜀(그 부위는 그대로). --parts·--base 필요 없음. 칼·칼집 칸(weapon·scabbard)은 공통 그림 파일 + 이 몸 외형의 자리.

사용:
  python3 scripts/rig/import_cut.py <시트.png> --body bare --guide docs/design/user-art/arrancar-base-guide/guide.json
  python3 scripts/rig/import_cut.py <시트.png> --body arrancar --base docs/design/user-art/shinigami-base-clean/arrancar-base.png
"""
from __future__ import annotations

import argparse
import json
import os

import numpy as np
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
WEAPON_REST = 60  # 칼을 곧게(손잡이 위·칼날 아래) 그렸을 때 쉬는 각도(사용자 2026-10-27 지정)
LOOK_LAYERS = ('hair', 'hair_back', 'sword', 'scabbard')
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


def sword_fit(part: np.ndarray) -> tuple[tuple[int, int], float, tuple[int, int]]:
    """칼 그림 → (손잡이 가운데 칸, 세로에서 기운 각도(도, +=칼날 끝이 왼쪽), 칼끝 칸).
    칼 축 = 칸들의 주축. 코등이 = 축에 수직으로 가장 넓은 줄. 손잡이 가운데 = 위 끝과 코등이 사이 가운데."""
    ys, xs = np.nonzero(part[..., 3] > 0)
    pts = np.stack([xs + 0.5, ys + 0.5], 1)
    c = pts.mean(0)
    ev, vec = np.linalg.eigh(np.cov((pts - c).T))
    ax = vec[:, -1]
    if ax[1] < 0:
        ax = -ax  # 아래(칼날 쪽)를 향하게
    nrm = np.array([-ax[1], ax[0]])
    t, w = (pts - c) @ ax, (pts - c) @ nrm
    rows = np.round(t).astype(int)
    spread = {r: w[rows == r].max() - w[rows == r].min() for r in set(rows.tolist())}
    top = t.min()
    upper = [r for r in spread if r < 0]  # 코등이는 칼 가운데보다 위
    guard = max(upper, key=lambda r: spread[r])
    g = c + ax * ((top + guard) / 2)
    tilt = float(np.degrees(np.arctan2(-ax[0], ax[1])))
    tip = pts[np.argmax(t)]
    return (int(g[0]), int(g[1])), tilt, (int(tip[0]), int(tip[1]))


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('sheet')
    ap.add_argument('--body', required=True)
    ap.add_argument('--base')
    ap.add_argument('--guide')
    ap.add_argument('--parts', default='head,torso,arm_L,arm_R,leg_L,leg_R')
    ap.add_argument('--no-head', action='store_true')
    ap.add_argument('--at', action='append', default=[], help='이름=x,y 로 자리 지정(새로 그린 조각)')
    a = ap.parse_args()
    sheet = np.array(Image.open(a.sheet).convert('RGBA'))
    rig = json.load(open(RIG_JSON, encoding='utf-8'))
    body = rig['bodies'].setdefault(a.body, {})
    os.makedirs(os.path.join(ART, a.body), exist_ok=True)
    placed = []
    if a.guide:
        g = json.load(open(a.guide, encoding='utf-8'))
        for b in g['boxes']:
            (sx, sy), (w, h), (cx, cy) = b['sheet'], b['size'], b['canvas']
            reg = sheet[sy:sy + h, sx:sx + w]
            op = reg[..., 3] == 255
            if not op.any():
                continue
            ys, xs = np.nonzero(op)
            part = np.zeros((ys.max() - ys.min() + 1, xs.max() - xs.min() + 1, 4), np.uint8)
            m = op[ys.min():ys.max() + 1, xs.min():xs.max() + 1]
            part[m] = reg[ys.min():ys.max() + 1, xs.min():xs.max() + 1][m]
            placed.append([b['slot'], part, cx + int(xs.min()), cy + int(ys.min()), -1])
        names = [p[0] for p in placed]
    else:
        base = np.array(Image.open(a.base).convert('RGBA'))
        names = a.parts.split(',')
        comps = components(sheet[..., 3] > 0)
        if len(comps) != len(names):
            raise SystemExit(f'부위 {len(comps)}개를 찾았는데 이름은 {len(names)}개: {[c[:4] for c in comps]}')
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
    fixed = {k: [int(v) for v in xy.split(',')] for k, xy in (x.split('=') for x in a.at)}
    bones = {b['id']: b for b in rig['bones']}
    looks = [l for l in rig['looks'].values() if l['body'] == a.body]
    for name, part, px, py, score in placed:
        if name in fixed:
            px, py = fixed[name]
        if a.guide and name in ('weapon', 'scabbard'):
            # 가이드 칸에서 고친 칼·칼집: 그림은 공통 파일, 자리는 칸 안 자리 그대로(이 몸의 외형), 쉬는 각도는 그대로
            key = 'weapon/sword' if name == 'weapon' else 'weapon/scabbard'
            Image.fromarray(part).save(os.path.join(ART, key + '.png'))
            for l in rig['looks'].values():
                if isinstance(l.get(name), dict):
                    l[name]['size'] = [part.shape[1], part.shape[0]]
            for l in looks:
                l[name] = {'art': key, 'at': [px, py], 'size': [part.shape[1], part.shape[0]]}
            if name == 'weapon':
                (gx, gy), _, tip = sword_fit(part)
                rig['swordAxis'] = {'note': '칼 그림 안 손잡이 가운데 → 칼끝 (칼날 방향 계산용)', 'grip': [gx, gy], 'tip': list(tip)}
            print(f'{name}: {part.shape[1]}×{part.shape[0]} → 자리 ({px}, {py})')
            continue
        if name == 'sword':
            Image.fromarray(part).save(os.path.join(ART, 'weapon', 'sword.png'))
            (gx, gy), tilt, tip = sword_fit(part)
            rig['swordAxis'] = {'note': '칼 그림 안 손잡이 가운데 → 칼끝 (칼날 방향 계산용)', 'grip': [gx, gy], 'tip': list(tip)}
            hx, hy = bones['weapon']['pivot']
            bones['weapon']['restRot'] = round(WEAPON_REST - tilt)
            for l in rig['looks'].values():
                l['weapon'] = {'art': 'weapon/sword', 'at': [hx - gx, hy - gy], 'size': [part.shape[1], part.shape[0]]}
            print(f'칼: {part.shape[1]}×{part.shape[0]}, 손잡이 가운데 ({gx}, {gy}), 기운 각도 {tilt:.1f}° → 쉬는 각도 {bones["weapon"]["restRot"]}')
            continue
        if name == 'scabbard':
            Image.fromarray(part).save(os.path.join(ART, 'weapon', 'scabbard.png'))
            xs = np.nonzero(part[0, :, 3] > 0)[0]
            wx, wy = bones['scabbard']['pivot']
            for l in rig['looks'].values():
                l['scabbard'] = {'art': 'weapon/scabbard', 'at': [wx - int(xs.min() + xs.max()) // 2, wy], 'size': [part.shape[1], part.shape[0]]}
            print(f'칼집: {part.shape[1]}×{part.shape[0]}')
            continue
        key = 'head_bald' if name == 'head' else f'{a.body}/{name}'
        if name == 'head' and a.no_head:
            key = body.get('head', {}).get('art', 'head_bald')
        else:
            Image.fromarray(part).save(os.path.join(ART, key + '.png'))
        entry = {'art': key, 'at': [px, py], 'size': [part.shape[1], part.shape[0]]}
        if name in ('hair', 'hair_back'):
            for l in looks:
                l[name] = entry
        else:
            body[name] = entry
        print(f'{name}: {part.shape[1]}×{part.shape[0]} → 자리 ({px}, {py}), 겹친 칸 {score}/{int((part[..., 3] > 0).sum())}')
    if 'hair' in names and 'hair_back' not in names:
        for l in looks:
            l.pop('hair_back', None)
        print('뒷머리 없음 → 일반머리에 합친 것으로 보고 외형에서 뺌')
    if 'thumb_L' in names:
        ids = [x['id'] for x in rig['slots']]
        if 'thumb_L' not in ids:
            rig['slots'].insert(ids.index('outer_arm_L') + 1, {'id': 'thumb_L', 'bone': 'arm_L'})  # 관절 없이 앞팔 뼈에 고정
    from feet_weapon import dump
    dump(rig)


if __name__ == '__main__':
    main()
