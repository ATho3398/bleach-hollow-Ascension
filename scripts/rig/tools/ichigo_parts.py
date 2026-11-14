#!/usr/bin/env python3
"""이치고(혈쇄) 부위 시트 조립 (GDD 115-A 128, 사용자 2026-11-14 "이치고(혈쇄)로 넣어").
시트 = docs/design/user-art/ichigo-ref/parts-2026-11-14.png (600×500 — 오른쪽 위 참고 그림 61×111 + 조각 22개).
조각 자리 = fit-2026-11-14.json (scripts/rig/tools/fit_parts.py — 참고 그림에서 색이 가장 많이 맞는 자리 → 겹쳐서 가장 덜 다르게 다듬음).
조각 → 부위는 내 추정 + 사용자 표시(7 = 오른 어깨, 11 = 바지 옷깃 — note-2026-11-14.png). 관절 = 부모·자식 조각이 겹친 칸들의 가운데. 동작 = 대기(idle)만.
사용: python3 scripts/rig/tools/ichigo_parts.py → docs/design/rig-draft/ichigo.json · ichigo-motions.json · ichigo/parts/*.png
2026-11-14 13:3x: 어깨(7)는 몸통 바로 앞(코트 앞자락·팔 뒤 — 쉬는 자세에서는 가려져 팔이 돌 때 틈을 메움), 앞뒤 순서는 ichigo.json 에서 손봄(이 도구를 다시 돌리면 fit 순서로 돌아감).
주의: 편집기에서 고정하면 그 뒤로는 ichigo.json 이 기준 — 다시 돌리면 고정 값이 처음 값으로 덮인다.
"""
import json
import os
import sys

import numpy as np
from PIL import Image

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from paths import DRAFT_DIR, ROOT  # noqa: E402

SHEET = os.path.join(ROOT, 'docs/design/user-art/ichigo-ref/parts-2026-11-14.png')
FIT = os.path.join(ROOT, 'docs/design/user-art/ichigo-ref/fit-2026-11-14.json')
OFF = (10, 0)
# 조각 번호 → (슬롯, 뼈, 이름)
PIECES = {
    2: ('head', 'head', '머리'), 7: ('shoulder_sword', 'arm_sword', '오른 어깨(앞손)'), 10: ('face_bit', 'head', '얼굴 조각?'), 4: ('chain_ear', 'chain_ear', '귀 옆 사슬'),
    3: ('chain_neck', 'chain_neck', '목 사슬(왼쪽)'), 5: ('scarf', 'torso', '목 사슬(앞)'),
    6: ('torso', 'torso', '몸통(가슴·하카마)'), 19: ('coat_front', 'torso', '코트 앞자락'), 12: ('collar', 'torso', '깃?'),
    9: ('arm_sword', 'arm_sword', '오른팔(앞손)'), 11: ('hakama_flap', 'hakama_flap', '바지 옷깃'), 14: ('chain_arm', 'chain_arm', '오른팔 사슬'),
    17: ('chain_hand', 'chain_hand', '오른손 사슬'), 18: ('sword', 'sword', '칼'),
    8: ('arm_back', 'arm_back', '왼팔(뒷손)'), 13: ('hand_back_bit', 'arm_back', '왼손 조각?'), 16: ('thumb', 'arm_sword', '엄지(오른손)'),  # 사용자 "내가 엄지 만들어놨는데 어디감?" — 칼 든 손 위(칼자루 앞), 자리는 ichigo.json 에서 28·65
    15: ('coat_tail_R', 'coat_tail_R', '코트 자락(오른쪽 아래)'), 20: ('coat_panel_R', 'coat_panel_R', '코트 자락(오른쪽)'), 21: ('coat_tail_L', 'coat_tail_L', '코트 자락(왼쪽 아래)'),
    22: ('foot_a', 'root', '발 A'), 23: ('foot_b', 'root', '발 B'),
}
PARENT = {'torso': 'root', 'head': 'torso', 'chain_ear': 'head', 'chain_neck': 'torso', 'arm_sword': 'torso', 'chain_arm': 'arm_sword', 'chain_hand': 'arm_sword',
          'sword': 'arm_sword', 'arm_back': 'torso', 'hakama_flap': 'torso', 'coat_tail_R': 'torso', 'coat_panel_R': 'torso', 'coat_tail_L': 'torso'}
BONE_NAMES = {'root': '전체', 'torso': '몸통', 'head': '머리', 'chain_ear': '귀 옆 사슬', 'chain_neck': '목 사슬', 'arm_sword': '오른팔(앞손)', 'chain_arm': '오른팔 사슬',
              'chain_hand': '오른손 사슬', 'sword': '칼', 'hakama_flap': '바지 옷깃', 'arm_back': '왼팔(뒷손)', 'coat_tail_R': '코트 자락(오른쪽 아래)', 'coat_panel_R': '코트 자락(오른쪽)', 'coat_tail_L': '코트 자락(왼쪽 아래)'}


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
    return lab


def main():
    a = np.array(Image.open(SHEET).convert('RGBA'))
    lab = blobs(a)
    fit = json.load(open(FIT, encoding='utf-8'))
    rx, ry, rw, rh = fit['ref']
    out = os.path.join(DRAFT_DIR, 'ichigo', 'parts')
    os.makedirs(out, exist_ok=True)
    parts, pix = {}, {}
    for i, (slot, bone, _) in PIECES.items():
        v = fit['pieces'][str(i)]
        (x0, y0), (w, h) = v['sheet'], v['size']
        m = lab[y0:y0 + h, x0:x0 + w] == lab[y0:y0 + h, x0:x0 + w][lab[y0:y0 + h, x0:x0 + w] > 0][0] if False else None
        # 조각 = 시트 칸 안에서 가장 많은 라벨(맞춤 때와 같은 조각)
        sub = lab[y0:y0 + h, x0:x0 + w]
        vals, cnt = np.unique(sub[sub > 0], return_counts=True)
        m = sub == vals[np.argmax(cnt)]
        img = a[y0:y0 + h, x0:x0 + w].copy()
        img[~m] = 0
        Image.fromarray(img).save(os.path.join(out, slot + '.png'))
        cx, cy = v['at'][0] + OFF[0], v['at'][1] + OFF[1]
        parts[slot] = {'art': 'parts/' + slot, 'at': [int(cx), int(cy)], 'size': [int(w), int(h)]}
        ys, xs = np.nonzero(m)
        pix.setdefault(bone, set()).update((int(x + cx), int(y + cy)) for y, x in zip(ys, xs))

    def joint(c, p):
        A, P = pix.get(c, set()), pix.get(p, set())
        ov = A & P
        if not ov:
            a_, p_ = min(((q, r) for q in A for r in P), key=lambda t: (t[0][0] - t[1][0]) ** 2 + (t[0][1] - t[1][1]) ** 2)
            ov = {a_, p_}
        return [round(sum(q[0] for q in ov) / len(ov)), round(sum(q[1] for q in ov) / len(ov))]

    W, H = rw + 20, rh + 1
    piv = {'root': [W // 2, H - 1]}
    tor = pix['torso']
    piv['torso'] = [round(sum(q[0] for q in tor) / len(tor)), max(q[1] for q in tor) - 20]  # 허리 쯤(몸통 아래에서 20칸 위)
    for b, p in PARENT.items():
        if b != 'torso':
            piv[b] = joint(b, p)
    bones = [{'id': 'root', 'parent': None, 'pivot': piv['root']}] + [{'id': b, 'parent': p, 'pivot': piv[b]} for b, p in PARENT.items()]
    order = [PIECES[i][0] for i in fit['order'] if i in PIECES]
    rig = {
        'id': 'ichigo',
        'note': '이치고(혈쇄) 종이인형(GDD 115-A 128, 작업본만 — 게임 미사용). 사용자 부위 시트를 scripts/rig/tools/fit_parts.py + ichigo_parts.py 로 조립. 조각 → 부위는 추정(? 표시 = 확인 대기).',
        'motionSpeed': 1.5, 'motionSpeedExcept': ['idle', 'homeIdle', 'move'],
        'canvas': [W, H], 'ground': H - 1,
        'bones': bones,
        'slots': [{'id': PIECES[i][0], 'bone': PIECES[i][1]} for i in fit['order'] if i in PIECES],
        'bodies': {'parts': parts},
        'looks': {'ichigo-bloody': {'body': 'parts'}},
        'bodySlots': {'parts': order},
        'hairFrame': {'rect': [0, 0, W, H], 'keepOut': [0, 0, 0, 0]},
        'view': {'note': '그림 칸 — 게임 미사용', 'rect': [-20, -24, 120, 140], 'clipY': H + 1},
        'edit': {'names': {**BONE_NAMES, **{s: n for s, _, n in PIECES.values()}},
                 'groups': [['전체', ['root']], ['머리', ['head', 'face_bit', 'chain_ear']], ['몸통', ['torso', 'coat_front', 'collar', 'scarf', 'chain_neck']],
                            ['오른팔(앞손)·칼', ['shoulder_sword', 'arm_sword', 'chain_arm', 'chain_hand', 'sword']], ['왼팔(뒷손)', ['arm_back', 'hand_back_bit']],
                            ['코트 자락·옷깃', ['coat_tail_L', 'coat_tail_R', 'coat_panel_R', 'hakama_flap']], ['발', ['foot_a', 'foot_b']]],
                 'follow': {'shoulder_sword': ['arm_sword', 'chain_arm', 'chain_hand', 'sword'], 'arm_sword': ['chain_arm', 'chain_hand', 'sword'], 'head': ['face_bit', 'chain_ear'], 'arm_back': ['hand_back_bit']}},
        'skeletons': {'parts': {PIECES[i][0]: [{'pts': [piv[PIECES[i][1]], piv[PIECES[i][1]]], 'w': 3}] for i in PIECES}},
        'sway': {'chain_neck': {'lag': 140, 'swing': 0.6, 'hang': 0.1, 'wave': [4, 2100, 0]}, 'chain_ear': {'lag': 120, 'swing': 0.5, 'hang': 0.1, 'wave': [3, 1800, 300]},
                 'chain_arm': {'lag': 140, 'swing': 0.6, 'hang': 0.1, 'wave': [4, 2300, 500]}, 'chain_hand': {'lag': 140, 'swing': 0.6, 'hang': 0.1, 'wave': [5, 1900, 800]},
                 'coat_tail_L': {'lag': 160, 'swing': 0.5, 'hang': 0.15, 'wave': [2.5, 2600, 0]}, 'coat_tail_R': {'lag': 160, 'swing': 0.5, 'hang': 0.15, 'wave': [2.5, 2400, 400]},
                 'coat_panel_R': {'lag': 160, 'swing': 0.4, 'hang': 0.1, 'wave': [1.5, 2800, 700]}, 'arm_back': {'lag': 140, 'swing': 0.4, 'hang': 0.05, 'wave': [1.5, 2200, 500]},
                 'hakama_flap': {'lag': 150, 'swing': 0.4, 'hang': 0.1, 'wave': [1.5, 2500, 300]}},
    }
    open(os.path.join(DRAFT_DIR, 'ichigo.json'), 'w', encoding='utf-8').write(json.dumps(rig, ensure_ascii=False, indent=1) + '\n')
    idle = {'duration': 2800, 'loop': True, 'tracks': {
        'torso': [[0, 0, 0, 0], [1400, 0, 0, 1], [2800, 0, 0, 0]],
        'head': [[0, 0.6, 0, 0], [1500, -0.9, 0, 0], [2800, 0.6, 0, 0]],
        'arm_sword': [[0, -1, 0, 0], [1400, 1.5, 0, 0], [2800, -1, 0, 0]],
        'sword': [[0, -0.5, 0, 0], [1600, 1, 0, 0], [2800, -0.5, 0, 0]]}}
    mo = {'note': '이치고(혈쇄) 동작(GDD 115-A 128) — 지금은 대기만. 키 = [t, 각도(+=시계), x, y]. 사슬·코트 자락·왼팔은 따라가기(sway).', 'idle': idle}
    open(os.path.join(DRAFT_DIR, 'ichigo-motions.json'), 'w', encoding='utf-8').write(json.dumps(mo, ensure_ascii=False, indent=1) + '\n')
    print('ichigo 부위', len(parts), '관절', piv)


if __name__ == '__main__':
    main()
