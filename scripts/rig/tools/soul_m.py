#!/usr/bin/env python3
"""혼백(남) 옷 만들기 (GDD 115-A 112, 사용자 2026-11-11 "사신 남자 영혼도 추가해서, 여자처럼 옷 색상 바꾸고, 끝에 찢어진 누더기 느낌으로 … 시트에 도트 함 찍어서 구현해봐바").
사신(남) 옷 조각(몸통·위팔 둘·아래팔 둘·다리 둘)을 혼백(여) 흰 옷 색으로 바꾸고, 다리 밑단·소매 끝을 들쭉날쭉 찢는다 → docs/design/rig-draft/humanoid/soul/<부위>.png
- 색: 검은 옷 두 색(#000000·#2c262f) 중 조각에서 더 넓은 쪽 → 밝은 흰색 #efe4f5, 좁은 쪽 → 그늘 #b3a1bb, 가장자리 → 윤곽 #0e0a10. 살·흰 띠는 그대로
- 찢기: 조각 아래 가장자리에서 칸마다 정해 둔 깊이만큼 위로 파내고(살·흰 띠는 안 건드림) 새 가장자리에 윤곽을 다시 두른다
사용자가 편집기 시트를 고쳐 보내면 그 그림이 기준 — 이 도구를 다시 돌리면 덮이니 그 뒤로는 돌리지 말 것.
사용: python3 scripts/rig/tools/soul_m.py
"""
import os
import sys

import numpy as np
from PIL import Image

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from paths import DRAFT_ART  # noqa: E402

BASE, FOLD, LINE = (0, 0, 0), (0x2c, 0x26, 0x2f), (0x0e, 0x0a, 0x10)
LIGHT, SHADE = (0xef, 0xe4, 0xf5), (0xb3, 0xa1, 0xbb)
# 찢는 깊이(칸마다 되풀이) — 다리 밑단은 깊게, 소매 끝은 얕게
TEAR = {'leg_L': [0, 2, 4, 1, 0, 3, 5, 2, 0, 1, 4, 2, 0, 3, 1, 4, 0],
        'leg_R': [1, 4, 0, 2, 5, 1, 0, 3, 1, 0, 4, 2, 0, 5, 2, 0, 3],
        'forearm_L': [0, 2, 0, 1, 3, 0, 2, 0, 1, 0, 2, 1, 0, 2, 0],
        'forearm_R': [1, 0, 2, 0, 3, 1, 0, 2, 0, 1, 0, 2, 0, 1],
        'arm_L': [], 'arm_R': [], 'torso': []}


def is_(a, c):
    return (a[..., 3] > 0) & np.all(a[..., :3] == c, axis=-1)


def main():
    out_dir = os.path.join(DRAFT_ART, 'soul')
    os.makedirs(out_dir, exist_ok=True)
    for part, tear in TEAR.items():
        a = np.array(Image.open(os.path.join(DRAFT_ART, 'shinigami', part + '.png')).convert('RGBA'))
        h, w = a.shape[:2]
        cloth = is_(a, BASE) | is_(a, FOLD) | is_(a, LINE)
        # 찢기: 칸마다 옷의 맨 아래 칸이 그림의 아래 가장자리(그 밑이 비었거나 그림 끝)일 때만
        for x in range(w):
            d = tear[x % len(tear)] if tear else 0
            ys = np.nonzero(a[:, x, 3] > 0)[0]
            if not d or not len(ys):
                continue
            y = int(ys.max())
            if not cloth[y, x]:
                continue  # 맨 아래가 살·흰 띠면 그대로
            for k in range(d):
                if y - k >= 0 and cloth[y - k, x]:
                    a[y - k, x] = 0
                    cloth[y - k, x] = False
                else:
                    break
        op = a[..., 3] > 0
        # 가장자리(옆·위·아래가 빈 옷 칸) = 윤곽, 안쪽 바탕 = 밝은 색, 주름 = 그늘
        pad = np.pad(op, 1)
        edge = ~(pad[:-2, 1:-1] & pad[2:, 1:-1] & pad[1:-1, :-2] & pad[1:-1, 2:])
        base, fold, line = is_(a, BASE), is_(a, FOLD), is_(a, LINE)
        out = a.copy()
        # 조각마다 더 넓은 쪽이 밝은 바탕, 좁은 쪽이 그늘(사신 옷은 몸통·팔은 #2c262f, 다리는 #000000 이 바탕)
        wide, narrow = (base, fold) if (base & ~edge).sum() >= (fold & ~edge).sum() else (fold, base)
        out[wide & ~edge, :3] = LIGHT
        out[narrow & ~edge, :3] = SHADE
        out[(base | fold | line) & edge, :3] = LINE
        # 안쪽에 남은 옛 윤곽선(#0e0a10)은 옷 주름 선 — 그늘 색으로 부드럽게, 단 바깥에서 두 칸 안쪽까지만 윤곽으로 둔다
        inner_line = line & ~edge
        out[inner_line, :3] = SHADE
        ys, xs = np.nonzero(out[..., 3] > 0)
        out = out[ys.min():ys.max() + 1, xs.min():xs.max() + 1]
        Image.fromarray(out).save(os.path.join(out_dir, part + '.png'))
        print(part, out.shape[1], out.shape[0], '옮김', int(xs.min()), int(ys.min()))


if __name__ == '__main__':
    main()
