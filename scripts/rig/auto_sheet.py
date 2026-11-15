#!/usr/bin/env python3
"""그림 한 장 + 자르는 선 그림 → 부위 시트 + 조립 파일(assembly.json) 자동 만들기 (GDD 115-A 122, 시험).
사용자 2026-11-12 "관절별로 나누고 … 관절 회전 각도가 바뀌어도 뒤에 배경이 보이지 않게 … 뒤에 올 관절 부위에다가 비슷한 색으로 채워넣는
그 방식, 이거를 어떻게 알고리즘으로 만들어서 다른 이미지를 넣어도 자동으로" · "자르는 위치 대강 그려줬거든? 시험삼아 시트로 만들고 인형으로".

입력(설정 json): image(원본), cuts(원본 위에 자르는 선을 그린 그림 — 같은 크기), seeds {슬롯: [x, y]}(그 부위 안의 한 칸),
  joints [[자식 뼈, 부모 뼈]…], same {뼈: 같은 관절을 쓸 뼈}, order(뒤 → 앞 슬롯 차례), body, offset(캔버스 자리), out(시트·조립 파일을 둘 폴더)
하는 일:
  1. 자르는 선 = 원본과 선 그림이 다른 칸. 몸에서 선을 뺀 덩어리 중 seeds 가 든 덩어리가 부위의 씨앗.
  2. 선 칸·씨앗 없는 조각은 몸 안에서 가장 가까운 부위로(여러 씨앗에서 동시에 번져 나감). 부위가 여러 덩어리로 갈리면 가장 큰 것만 남기고 나머지는 이웃 부위로.
  3. 관절 = 자식·부모 부위가 맞닿은 칸들의 가운데(안 닿으면 가장 가까운 두 칸의 가운데).
  4. 겹침 채우기: 관절마다 두 부위 중 **뒤에 그려지는 쪽**을 관절 둘레 원(반지름 = 맞닿은 길이의 반 + 1, 3칸 이상)만큼 넓힌다 — 단 원래 몸 실루엣 안에서만
     (쉬는 자세 그림은 원본과 한 칸도 안 달라진다). 채우는 색 = 그 부위에서 가장 가까운 칸의 색(외곽선 검정 말고), 실루엣 가장자리 칸은 외곽선 색.
  5. 부위 시트(400×400, 조각을 띄워 늘어놓고 오른쪽 위에 원본) + assembly.json → `python3 scripts/rig/assemble_parts.py <assembly.json>` 로 몸이 된다.
사용: python3 scripts/rig/auto_sheet.py <설정.json>
"""
import json
import math
import os
import sys
from collections import deque

import numpy as np
from PIL import Image

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from paths import ROOT  # noqa: E402

N4 = ((1, 0), (-1, 0), (0, 1), (0, -1))
N8 = tuple((dy, dx) for dy in (-1, 0, 1) for dx in (-1, 0, 1) if dy or dx)


def comps(mask, nb=N4):
    h, w = mask.shape
    lab = np.zeros((h, w), int)
    n = 0
    for y in range(h):
        for x in range(w):
            if mask[y, x] and not lab[y, x]:
                n += 1
                lab[y, x] = n
                st = [(y, x)]
                while st:
                    cy, cx = st.pop()
                    for dy, dx in nb:
                        yy, xx = cy + dy, cx + dx
                        if 0 <= yy < h and 0 <= xx < w and mask[yy, xx] and not lab[yy, xx]:
                            lab[yy, xx] = n
                            st.append((yy, xx))
    return lab, n


def grow(lab, body):
    """라벨 없는 몸 칸을 가장 가까운 라벨로(몸 안에서 번져 나감)"""
    h, w = lab.shape
    lab = lab.copy()
    q = deque((y, x) for y in range(h) for x in range(w) if lab[y, x])
    while q:
        cy, cx = q.popleft()
        for dy, dx in N4:
            yy, xx = cy + dy, cx + dx
            if 0 <= yy < h and 0 <= xx < w and body[yy, xx] and not lab[yy, xx]:
                lab[yy, xx] = lab[cy, cx]
                q.append((yy, xx))
    return lab


def main(path):
    cfg = json.load(open(path, encoding='utf-8'))
    p = lambda f: os.path.join(ROOT, f)  # noqa: E731
    src = np.array(Image.open(p(cfg['image'])).convert('RGBA')).astype(int)
    cut = np.array(Image.open(p(cfg['cuts'])).convert('RGBA')).astype(int)
    assert src.shape == cut.shape, '원본과 선 그림 크기가 다름'
    h, w = src.shape[:2]
    body = src[..., 3] > 127
    line = body & (np.abs(src - cut).sum(-1) > cfg.get('lineMin', 40))
    slots = list(cfg['seeds'])
    free, _ = comps(body & ~line)
    lab = np.zeros((h, w), int)
    for i, s in enumerate(slots, 1):
        x, y = cfg['seeds'][s]
        assert free[y, x], f'{s} 씨앗 ({x},{y}) 이 선 위거나 몸 밖'
        lab[free == free[y, x]] = i
    lab = grow(lab, body)
    # 부위가 여러 덩어리면 가장 큰 덩어리만 남기고 나머지는 이웃 부위로
    for _ in range(3):
        moved = False
        for i in range(1, len(slots) + 1):
            c, n = comps(lab == i, N8)
            if n > 1:
                big = max(range(1, n + 1), key=lambda k: (c == k).sum())
                lab[(lab == i) & (c != big)] = 0
                moved = True
        if not moved:
            break
        lab = grow(lab, body)
    idx = {s: i for i, s in enumerate(slots, 1)}
    order = cfg['order']
    assert sorted(order) == sorted(slots), 'order 와 seeds 의 슬롯이 다름'
    rank = {s: k for k, s in enumerate(order)}

    def touch(a, b):
        """a 부위 칸 중 b 부위와 맞닿은 칸"""
        out = []
        for y in range(h):
            for x in range(w):
                if lab[y, x] == idx[a] and any(0 <= y + dy < h and 0 <= x + dx < w and lab[y + dy, x + dx] == idx[b] for dy, dx in N4):
                    out.append((x, y))
        return out

    pivots, caps = {}, []
    for child, parent in cfg['joints']:
        ta, tb = touch(child, parent), touch(parent, child)
        if ta and tb:
            pts = ta + tb
        else:  # 안 닿으면 가장 가까운 두 칸
            ca = [(x, y) for y in range(h) for x in range(w) if lab[y, x] == idx[child]]
            cb = [(x, y) for y in range(h) for x in range(w) if lab[y, x] == idx[parent]]
            a, b = min(((a, b) for a in ca for b in cb), key=lambda ab: (ab[0][0] - ab[1][0]) ** 2 + (ab[0][1] - ab[1][1]) ** 2)
            pts = [a, b]
        px, py = sum(q[0] for q in pts) / len(pts) + 0.5, sum(q[1] for q in pts) / len(pts) + 0.5
        pivots[child] = [round(px), round(py)]
        r = max(cfg.get('capMin', 3), len(ta) / 2 + 1)
        behind = child if rank[child] < rank[parent] else parent
        caps.append((behind, px, py, r))
    for b, xy in (cfg.get('pivots') or {}).items():  # 손으로 정한 관절(전체·몸통 등)
        pivots[b] = xy
    for b, other in (cfg.get('same') or {}).items():  # 다른 뼈와 같은 관절 자리(전체·골반 = 몸통 관절 등)
        pivots[b] = pivots[other]
    # 외곽선 색 = 몸에서 가장 어두운 색
    cols = src[body][:, :3]
    dark = tuple(int(v) for v in cols[np.argmin(cols.sum(1))])
    edge = body & np.array([[any(not (0 <= y + dy < h and 0 <= x + dx < w) or not body[y + dy, x + dx] for dy, dx in N4) for x in range(w)] for y in range(h)])
    art = {s: np.zeros((h, w, 4), np.uint8) for s in slots}
    for s in slots:
        m = lab == idx[s]
        art[s][m] = src[m]
    added = {s: 0 for s in slots}
    for s, px, py, r in caps:
        own = [(x, y) for y in range(h) for x in range(w) if lab[y, x] == idx[s] and tuple(src[y, x, :3]) != dark] or \
              [(x, y) for y in range(h) for x in range(w) if lab[y, x] == idx[s]]
        for y in range(h):
            for x in range(w):
                if body[y, x] and lab[y, x] != idx[s] and not art[s][y, x, 3] and math.hypot(x + 0.5 - px, y + 0.5 - py) <= r:
                    if edge[y, x]:
                        col = dark
                    else:
                        nx, ny = min(own, key=lambda q: (q[0] - x) ** 2 + (q[1] - y) ** 2)
                        col = tuple(int(v) for v in src[ny, nx, :3])
                    art[s][y, x] = (*col, 255)
                    added[s] += 1
    # 부위 시트: 조각을 띄워 늘어놓고 오른쪽 위에 원본
    sheet = np.zeros((400, 400, 4), np.uint8)
    sheet[8:8 + h, 392 - w:392] = src.astype(np.uint8)
    parts, cx, cy, rowh = {}, 20, 120, 0
    for s in order:
        ys, xs = np.nonzero(art[s][..., 3])
        x0, y0, x1, y1 = xs.min(), ys.min(), xs.max() + 1, ys.max() + 1
        pw, ph = x1 - x0, y1 - y0
        if cx + pw > 380:
            cx, cy, rowh = 20, cy + rowh + 8, 0
        sheet[cy:cy + ph, cx:cx + pw] = art[s][y0:y1, x0:x1]
        parts[s] = {'sheet': [int(cx), int(cy)], 'at': [int(x0), int(y0)]}
        cx, rowh = cx + pw + 8, max(rowh, ph)
    out = p(cfg['out'])
    os.makedirs(out, exist_ok=True)
    Image.fromarray(sheet).save(os.path.join(out, 'parts-auto.png'))
    asm = {'note': f'자동 부위 시트(scripts/rig/auto_sheet.py, GDD 115-A 122 시험) — 원본 {cfg["image"]} + 자르는 선 {cfg["cuts"]}. 다시 만들기: python3 scripts/rig/auto_sheet.py {os.path.relpath(path, ROOT)} → python3 scripts/rig/assemble_parts.py {cfg["out"]}/assembly.json',
           'sheet': f'{cfg["out"]}/parts-auto.png', 'body': cfg['body'], 'scale': 1, 'offset': cfg.get('offset', [0, 0]),
           'parts': parts, 'pivots': pivots, 'order': order}
    json.dump(asm, open(os.path.join(out, 'assembly.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    print('부위', {s: int((lab == idx[s]).sum()) for s in slots})
    print('겹침 채운 칸', {s: n for s, n in added.items() if n})
    print('관절', pivots)


if __name__ == '__main__':
    main(sys.argv[1])
