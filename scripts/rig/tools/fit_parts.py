#!/usr/bin/env python3
"""부위 시트 → 조각 자리 자동 맞춤 (GDD 115-A 125 의 아이젠 조립 방식을 아무 시트에나 — 115-A 128).
시트(투명 배경) = 참고 그림(가장 큰 조각, 또는 --ref 번호) + 조각들. 조각 번호 = 위 → 아래, 왼 → 오른(첫 칸 기준) 차례.
1) 조각마다 참고 그림 위에서 색이 같은 칸이 가장 많은 자리 2) 겹쳐 그렸을 때 참고 그림과 가장 덜 다르게(모양·색) 자리(±3)·앞뒤 순서를 몇 번 다듬음.
결과 json: {ref: [x, y, w, h], pieces: {번호: {sheet: [x, y], size: [w, h], at: [참고 그림 안 x, y], match, px}}, order: [뒤 → 앞 번호]}
사용: python3 scripts/rig/tools/fit_parts.py <시트.png> <결과.json> [--ref N] [--skip 4,5]
"""
import argparse
import json
import itertools

import numpy as np
from PIL import Image


def blobs(a):
    m = a[..., 3] > 127
    h, w = m.shape
    lab = np.zeros((h, w), int)
    n = 0
    for y, x in zip(*np.nonzero(m)):
        if lab[y, x]:
            continue
        n += 1
        lab[y, x] = n
        st = [(y, x)]
        while st:
            cy, cx = st.pop()
            for dy in (-1, 0, 1):
                for dx in (-1, 0, 1):
                    yy, xx = cy + dy, cx + dx
                    if 0 <= yy < h and 0 <= xx < w and m[yy, xx] and not lab[yy, xx]:
                        lab[yy, xx] = n
                        st.append((yy, xx))
    return lab, n


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('sheet')
    ap.add_argument('out')
    ap.add_argument('--ref', type=int)
    ap.add_argument('--skip', default='')
    ap.add_argument('--iters', type=int, default=3)
    ap.add_argument('--start', help='앞서 낸 결과 json 에서 이어 다듬기')
    ap.add_argument('--wide', default='', help='넓게(±8) 옮겨 볼 조각 번호들')
    o = ap.parse_args()
    a = np.array(Image.open(o.sheet).convert('RGBA')).astype(int)
    lab, n = blobs(a)
    sizes = {i: int((lab == i).sum()) for i in range(1, n + 1)}
    refi = o.ref or max(sizes, key=sizes.get)
    ys, xs = np.nonzero(lab == refi)
    rx, ry, rw, rh = xs.min(), ys.min(), xs.max() + 1 - xs.min(), ys.max() + 1 - ys.min()
    ref = a[ry:ry + rh, rx:rx + rw].copy()
    ref[lab[ry:ry + rh, rx:rx + rw] != refi] = 0
    ro = ref[..., 3] > 127
    skip = {int(s) for s in o.skip.split(',') if s}
    P, info = {}, {}
    for i in range(1, n + 1):
        if i == refi or i in skip:
            continue
        ys, xs = np.nonzero(lab == i)
        x0, y0 = xs.min(), ys.min()
        p = a[y0:ys.max() + 1, x0:xs.max() + 1].copy()
        p[lab[y0:ys.max() + 1, x0:xs.max() + 1] != i] = 0
        P[i] = p
        po = p[..., 3] > 127
        ph, pw = po.shape
        best = None
        for dy in range(-ph + 1, rh):
            for dx in range(-pw + 1, rw):
                y0r, x0r, y1r, x1r = max(0, dy), max(0, dx), min(rh, dy + ph), min(rw, dx + pw)
                if y1r <= y0r or x1r <= x0r:
                    continue
                q = p[y0r - dy:y1r - dy, x0r - dx:x1r - dx]
                r = ref[y0r:y1r, x0r:x1r]
                same = int(((q[..., 3] > 127) & (r[..., 3] > 127) & (np.abs(q[..., :3] - r[..., :3]).sum(-1) == 0)).sum())
                if best is None or same > best[0]:
                    best = (same, dx, dy)
        info[i] = {'sheet': [int(x0), int(y0)], 'size': [int(pw), int(ph)], 'at': [best[1], best[2]], 'match': best[0], 'px': int(po.sum())}

    def layer(i, at):
        L = np.zeros((rh, rw, 4), int)
        p = P[i]
        dx, dy = at
        ph, pw = p.shape[:2]
        y0r, x0r, y1r, x1r = max(0, dy), max(0, dx), min(rh, dy + ph), min(rw, dx + pw)
        if y1r > y0r and x1r > x0r:
            L[y0r:y1r, x0r:x1r] = p[y0r - dy:y1r - dy, x0r - dx:x1r - dx]
        return L

    def ok(L):
        return (L[..., 3] > 127) & ro & (np.abs(L[..., :3] - ref[..., :3]).sum(-1) == 0)

    def order_of(at):
        Ls = {i: layer(i, at[i]) for i in at}
        score = {i: 0 for i in at}
        for x, y in itertools.combinations(list(at), 2):
            ov = (Ls[x][..., 3] > 127) & (Ls[y][..., 3] > 127)
            if not ov.any():
                continue
            sx, sy = (ok(Ls[x]) & ov).sum(), (ok(Ls[y]) & ov).sum()
            if sx != sy:
                score[x] += 1 if sx > sy else -1
                score[y] += -1 if sx > sy else 1
        return sorted(at, key=lambda i: score[i])

    def cost(at, order):
        C = np.zeros((rh, rw, 4), int)
        for i in order:
            L = layer(i, at[i])
            m = L[..., 3] > 127
            C[m] = L[m]
        co = C[..., 3] > 127
        return int((co != ro).sum() * 2 + (co & ro & (np.abs(C[..., :3] - ref[..., :3]).sum(-1) > 0)).sum())

    at = {i: tuple(v['at']) for i, v in info.items()}
    order = order_of(at)
    if o.start:
        prev = json.load(open(o.start))
        at.update({int(k): tuple(v['at']) for k, v in prev['pieces'].items() if int(k) in at})
        order = [i for i in prev['order'] if i in at] + [i for i in at if i not in prev['order']]
    wide = {int(s) for s in o.wide.split(',') if s}
    best = cost(at, order)
    print('시작', best)
    for it in range(o.iters):
        for i in list(at):
            R = 8 if i in wide else 3
            for dx in range(-R, R + 1):
                for dy in range(-R, R + 1):
                    if dx or dy:
                        t = dict(at)
                        t[i] = (at[i][0] + dx, at[i][1] + dy)
                        c = cost(t, order)
                        if c < best:
                            best, at = c, t
            for pos in range(len(order)):
                oo = [x for x in order if x != i]
                oo.insert(pos, i)
                c = cost(at, oo)
                if c < best:
                    best, order = c, oo
        print('다듬기', it, best)
    for i in info:
        info[i]['at'] = [int(at[i][0]), int(at[i][1])]
    json.dump({'sheet': o.sheet, 'ref': [int(rx), int(ry), int(rw), int(rh)], 'refBlob': refi, 'pieces': {str(k): v for k, v in info.items()},
               'order': order, 'cost': best}, open(o.out, 'w'), ensure_ascii=False, indent=1)


if __name__ == '__main__':
    main()
