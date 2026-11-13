#!/usr/bin/env python3
"""아이젠(대기 동작만) 종이인형 뼈대 만들기 (GDD 115-A 124, 사용자 2026-11-14 "얘 아이젠 idle로 만들어줄래?").
원본(docs/design/user-art/aizen-ref/source-2026-11-14.png, 500×400) = 몸 한 덩어리(54×107) + 주먹(13×12) + 칼(36×65) 세 조각.
몸을 가로로 셋(머리 · 윗몸(소매 포함) · 아랫몸(코트 자락·다리 — 발은 제자리))으로 자르고, 주먹을 소매 끝(검은 구멍)에, 칼자루를 주먹 안에 놓는다.
겹침: 윗몸은 머리 아래로 2줄, 아랫몸은 윗몸 아래로 4줄 더 가져간다(쉬는 자세는 원본 그대로 — 위에 그려지는 조각이 가림). 숨 쉴 때 틈이 안 보이게.
뼈: 전체 → 아랫몸 → 윗몸 → 머리, 윗몸 → 손 → 칼. 동작 = 대기(idle) 하나: 윗몸이 1칸 내려앉았다 올라오고(숨), 머리가 살짝 끄덕, 손·칼이 조금 흔들림.
사용: python3 scripts/rig/tools/aizen_rig.py  → docs/design/rig-draft/aizen.json · aizen-motions.json · aizen/ref/*.png
"""
import json
import os
import sys

import numpy as np
from PIL import Image

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from paths import DRAFT_DIR, ROOT  # noqa: E402

SRC = os.path.join(ROOT, 'docs/design/user-art/aizen-ref/source-2026-11-14.png')
OX, OY = 213, 147  # 원본 → 캔버스(몸 왼쪽 위가 캔버스 (10, 0))
CUT_HEAD, CUT_MID = 183, 213  # 원본 y: 머리 | 윗몸 | 아랫몸
FIST = (29, 6)  # 주먹 조각을 소매 구멍으로 옮기는 양(원본 칸)
SWORD = (68, 14)  # 칼자루가 주먹 안에 오게 옮기는 양
SHRINK = {'hand': 1}  # 손을 조금 작게(사용자 2026-11-14 "손 크기만 5%정도 줄일 수 있슴?" — 13×12 → 12×11, 도트 1칸 ≈ 8%)


def blob(alpha, x, y):
    h, w = alpha.shape
    m = np.zeros((h, w), bool)
    st = [(y, x)]
    m[y, x] = True
    while st:
        cy, cx = st.pop()
        for dy in (-1, 0, 1):
            for dx in (-1, 0, 1):
                yy, xx = cy + dy, cx + dx
                if 0 <= yy < h and 0 <= xx < w and alpha[yy, xx] and not m[yy, xx]:
                    m[yy, xx] = True
                    st.append((yy, xx))
    return m


def main():
    src = np.array(Image.open(SRC).convert('RGBA'))
    alpha = src[..., 3] > 127
    ys = np.arange(src.shape[0])[:, None]
    body, fist, sword = blob(alpha, 250, 200), blob(alpha, 201, 200), blob(alpha, 170, 215)
    pieces = {
        'lower': (body & (ys >= CUT_MID - 4), (0, 0)),
        'upper': (body & (ys >= CUT_HEAD - 2) & (ys < CUT_MID), (0, 0)),
        'head': (body & (ys < CUT_HEAD), (0, 0)),
        'sword': (sword, SWORD),
        'hand': (fist, FIST),
    }
    out = os.path.join(DRAFT_DIR, 'aizen', 'ref')
    os.makedirs(out, exist_ok=True)
    parts = {}
    for slot, (m, (dx, dy)) in pieces.items():
        yy, xx = np.nonzero(m)
        x0, y0, x1, y1 = xx.min(), yy.min(), xx.max() + 1, yy.max() + 1
        img = src[y0:y1, x0:x1].copy()
        img[~m[y0:y1, x0:x1]] = 0
        im = Image.fromarray(img)
        ax, ay = int(x0 + dx - OX), int(y0 + dy - OY)
        if slot in SHRINK:  # 한 칸 줄이기(가운데 그대로) — 도트라 1칸이 가장 작은 단위
            # 이웃 줄과 가장 비슷한 세로줄·가로줄을 하나씩 뺀다(외곽선이 덜 망가지게 — 그냥 줄이면 선이 끊김)
            arr = np.array(im).astype(int)
            for _ in range(SHRINK[slot]):
                c = min(range(1, arr.shape[1] - 1), key=lambda i: np.abs(arr[:, i] - arr[:, i + 1]).sum() + np.abs(arr[:, i] - arr[:, i - 1]).sum())
                arr = np.delete(arr, c, axis=1)
                r = min(range(1, arr.shape[0] - 1), key=lambda i: np.abs(arr[i] - arr[i + 1]).sum() + np.abs(arr[i] - arr[i - 1]).sum())
                arr = np.delete(arr, r, axis=0)
            im = Image.fromarray(arr.astype(np.uint8))
        im.save(os.path.join(out, slot + '.png'))
        parts[slot] = {'art': 'ref/' + slot, 'at': [ax, ay], 'size': [im.width, im.height]}
    W, H = 74, 108
    piv = {'root': [37, 107], 'lower': [37, 107], 'upper': [38, CUT_MID - OY], 'head': [42, CUT_HEAD - OY],
           'hand': [parts['hand']['at'][0] + 7, parts['hand']['at'][1] + 5], 'sword': [parts['hand']['at'][0] + 6, parts['hand']['at'][1] + 6]}
    par = {'root': None, 'lower': 'root', 'upper': 'lower', 'head': 'upper', 'hand': 'upper', 'sword': 'hand'}
    tip = [parts['sword']['at'][0] + parts['sword']['size'][0] - 1, parts['sword']['at'][1] + parts['sword']['size'][1] - 1]
    rig = {
        'id': 'aizen',
        'note': '아이젠 종이인형(대기 동작만 — GDD 115-A 124, 사용자 2026-11-14 "얘 아이젠 idle로 만들어줄래?"). 사용자 그림(몸 한 덩어리 + 주먹 + 칼)을 scripts/rig/tools/aizen_rig.py 가 머리·윗몸·아랫몸으로 자르고 주먹·칼을 소매 끝에 놓음. 작업본만(게임 미사용).',
        'canvas': [W, H], 'ground': H - 1,
        'bones': [{'id': b, 'parent': par[b], 'pivot': piv[b]} for b in par],
        'slots': [{'id': s, 'bone': s} for s in ('lower', 'upper', 'head', 'sword', 'hand')],
        'bodies': {'ref': parts},
        'looks': {'aizen-base': {'body': 'ref'}},
        'hairFrame': {'rect': [0, 0, W, H], 'keepOut': [0, 0, 0, 0]},
        'view': {'note': '그림 칸(정사각, 바닥 y 107 = 아래에서 약 8% 위) — 게임 미사용', 'rect': [-23, -22, 120, 140][:2] + [120, 140], 'clipY': H + 1},
        'edit': {'names': {'root': '전체', 'lower': '아랫몸(코트 자락·다리)', 'upper': '윗몸(소매)', 'head': '머리', 'hand': '오른손(앞손)', 'sword': '칼'},
                 'groups': [['전체', ['root']], ['몸', ['head', 'upper', 'lower']], ['오른손·칼', ['hand', 'sword']]],
                 'follow': {'lower': ['upper', 'head', 'hand', 'sword'], 'upper': ['head', 'hand', 'sword'], 'hand': ['sword']}},
        'skeletons': {'ref': {'lower': [{'pts': [piv['lower'], piv['upper']], 'w': 3}], 'upper': [{'pts': [piv['upper'], piv['head']], 'w': 3}],
                              'head': [{'pts': [piv['head'], [42, 8]], 'w': 3}], 'hand': [{'pts': [piv['hand'], piv['hand']], 'w': 3}], 'sword': [{'pts': [piv['sword'], tip], 'w': 3}]}},
    }
    rig['view']['rect'] = [-23, -22, 120, 140]
    open(os.path.join(DRAFT_DIR, 'aizen.json'), 'w', encoding='utf-8').write(json.dumps(rig, ensure_ascii=False, indent=1) + '\n')
    # 대기: 2.8초 한 바퀴 — 숨(윗몸 1칸 내려앉음), 머리는 조금 늦게 살짝 끄덕, 손·칼은 숨에 맞춰 조금 돈다. 키는 양 끝에만(멈칫 없이)
    idle = {'duration': 2800, 'loop': True, 'tracks': {
        'upper': [[0, 0, 0, 0], [1400, 0, 0, 1], [2800, 0, 0, 0]],
        'head': [[0, 0.6, 0, 0], [1500, -0.9, 0, 0], [2800, 0.6, 0, 0]],
        'hand': [[0, -1.5, 0, 0], [1400, 2, 0, 0], [2800, -1.5, 0, 0]],
        'sword': [[0, -1, 0, 0], [1600, 1.5, 0, 0], [2800, -1, 0, 0]]}}
    mo = {'note': '아이젠 동작(GDD 115-A 124) — scripts/rig/tools/aizen_rig.py 가 만든다. 지금은 대기(idle)만. 키 = [t, 각도(+=시계), x, y].', 'idle': idle}
    open(os.path.join(DRAFT_DIR, 'aizen-motions.json'), 'w', encoding='utf-8').write(json.dumps(mo, ensure_ascii=False, indent=1) + '\n')
    print('aizen 부위', {k: (v['at'], v['size']) for k, v in parts.items()})


if __name__ == '__main__':
    main()
