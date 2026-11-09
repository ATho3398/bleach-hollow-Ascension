#!/usr/bin/env python3
"""사용자가 부위를 따로 그려 온 시트 → 종이인형 몸 (GDD 115-A 73).
조립 파일(assembly.json): 시트 그림, 몸 id, 배율(scale)·캔버스 자리(offset), 슬롯마다 시트 속 조각 자리(sheet = 그 조각의 왼쪽 위 칸)와
1배 조립 자리(at), 1배 관절(pivots). 조각 = 시트에서 sheet 칸과 이어진 불투명 덩어리(8방향). 부위 그림 = 조각을 배율만큼 키운 것.
결과: docs/design/rig-draft/humanoid/<몸>/<슬롯>.png, 작업본 humanoid.json 의 bodies.<몸>·bodyJoints.<몸>.pivots (캔버스 = 1배 × scale + offset)
사용: python3 scripts/rig/assemble_parts.py docs/design/user-art/beast-base-ref/assembly.json
조립 파일에 "rig": "serpent" 같이 적으면 그 뼈대(짐승·뱀 — 몸 하나, 관절 = 뼈 기본 자리, order = 슬롯 차례)
"""
import json
import os
import sys

import numpy as np
from PIL import Image

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from paths import DRAFT_ART, DRAFT_RIG_JSON, ROOT  # noqa: E402
from feet_weapon import dump  # noqa: E402


def piece(alpha, x, y):
    """(x, y) 칸을 포함한 불투명 덩어리(8방향) 마스크"""
    h, w = alpha.shape
    m = np.zeros((h, w), bool)
    if not alpha[y, x]:
        # 왼쪽 위 칸이 비어 있으면 그 줄에서 오른쪽 첫 불투명 칸
        xs = np.nonzero(alpha[y, x:])[0]
        if not len(xs):
            raise SystemExit(f'시트 ({x},{y}) 줄에 조각 없음')
        x += int(xs[0])
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


def main(path):
    a = json.load(open(path, encoding='utf-8'))
    src = np.array(Image.open(os.path.join(ROOT, a['sheet'])).convert('RGBA'))
    alpha = src[..., 3] > 0
    sc, (ox, oy) = int(a.get('scale', 1)), a.get('offset', [0, 0])
    rid = a.get('rig', 'humanoid')  # 뼈대(사람형 외 짐승·뱀도 — 뱀 부위 시트 2026-11-10, GDD 115-A 96)
    rig_path = DRAFT_RIG_JSON if rid == 'humanoid' else os.path.join(os.path.dirname(DRAFT_RIG_JSON), f'{rid}.json')
    body, out_dir = a['body'], os.path.join(os.path.dirname(DRAFT_RIG_JSON), rid, a['body'])
    os.makedirs(out_dir, exist_ok=True)
    rig = json.load(open(rig_path, encoding='utf-8'))
    parts = {}
    for slot, p in a['parts'].items():
        m = piece(alpha, *p['sheet'])
        ys, xs = np.nonzero(m)
        x0, y0, x1, y1 = xs.min(), ys.min(), xs.max() + 1, ys.max() + 1
        img = src[y0:y1, x0:x1].copy()
        img[~m[y0:y1, x0:x1]] = 0
        im = Image.fromarray(img)
        if sc > 1:
            im = im.resize((im.width * sc, im.height * sc), Image.NEAREST)
        im.save(os.path.join(out_dir, f'{slot}.png'))
        parts[slot] = {'art': f'{body}/{slot}', 'at': [p['at'][0] * sc + ox, p['at'][1] * sc + oy], 'size': [im.width, im.height]}
    rig['bodies'][body] = parts
    piv = {b: [x * sc + ox, y * sc + oy] for b, (x, y) in a['pivots'].items()}
    if rid == 'humanoid':
        rig.setdefault('bodyJoints', {})[body] = {'pivots': piv}
        dump(rig)
    else:
        # 짐승·뱀은 몸이 하나 — 뼈 기본 관절 자리를 바로 고치고, 슬롯 차례(order)가 있으면 그대로
        for b in rig['bones']:
            if b['id'] in piv:
                b['pivot'] = piv[b['id']]
        if a.get('order'):
            ids = [s['id'] for s in rig['slots']]
            rest = [s for s in rig['slots'] if s['id'] not in a['order']]
            rig['slots'] = [next(s for s in rig['slots'] if s['id'] == i) for i in a['order'] if i in ids] + rest
        open(rig_path, 'w', encoding='utf-8').write(json.dumps(rig, ensure_ascii=False, indent=1) + '\n')
    print(body, '부위', len(parts), '→', out_dir)


if __name__ == '__main__':
    main(sys.argv[1])
