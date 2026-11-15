#!/usr/bin/env python3
"""이치고(무월 — 이름은 내 추정, 사용자 확인 대기) 부위 시트 조립 (GDD 115-A 129, 사용자 2026-11-14 "이거 종이인형으로 구현.").
시트 = docs/design/user-art/mugetsu-ref/parts-2026-11-14.png (600×500 — 오른쪽 위 참고 그림 85×114 + 조각 19개).
조각 자리 = fit-2026-11-14.json (scripts/rig/tools/fit_parts.py → 참고 그림의 빨강을 오른팔(8·9)+칼(13) 자리로 보고 그 위에 놓음, 5 는 실루엣 안으로).
조각 → 부위는 전부 내 추정. 관절 = 부모·자식 조각이 겹친 칸들의 가운데. 동작 = 대기(idle)만.
사용: python3 scripts/rig/tools/mugetsu_parts.py → docs/design/rig-draft/mugetsu.json · mugetsu-motions.json · mugetsu/parts/*.png
주의: 편집기에서 고정하면 그 뒤로는 mugetsu.json 이 기준 — 다시 돌리면 고정 값이 처음 값으로 덮인다.
"""
import json
import os
import sys

import numpy as np
from PIL import Image

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from paths import DRAFT_DIR, ROOT  # noqa: E402
from fit_parts import blobs  # noqa: E402

SHEET = os.path.join(ROOT, 'docs/design/user-art/mugetsu-ref/parts-2026-11-14.png')
FIT = os.path.join(ROOT, 'docs/design/user-art/mugetsu-ref/fit-2026-11-14.json')
OFF = (10, 0)
# 조각 번호 → (슬롯, 뼈, 이름)
PIECES = {
    3: ('head', 'head', '머리'), 2: ('hair_a', 'hair_a', '뒷머리 가닥 1(위)'), 4: ('hair_b', 'hair_b', '뒷머리 가닥 2'),
    6: ('hair_c', 'hair_c', '뒷머리 가닥 3'), 7: ('hair_d', 'hair_d', '뒷머리 가닥 4(안쪽)'),
    5: ('body_base', 'lower', '몸 바탕(검정)'), 10: ('chest', 'upper', '가슴'), 11: ('belly', 'lower', '배'),
    8: ('arm_sword', 'arm_sword', '오른 위팔(앞)'), 9: ('forearm_sword', 'forearm_sword', '오른 아래팔(앞)'), 13: ('sword', 'sword', '칼'),
    12: ('arm_back', 'arm_back', '왼 위팔(뒤)'), 16: ('forearm_back', 'forearm_back', '왼 아래팔·왼손(뒷손)'),
    18: ('thigh_f', 'thigh_f', '오른 하카마 위'), 15: ('shin_f', 'shin_f', '오른 하카마 아래'), 19: ('foot_f', 'foot_f', '오른발'),
    14: ('thigh_b', 'thigh_b', '왼 하카마 위'), 17: ('shin_b', 'shin_b', '왼 하카마 아래'), 20: ('foot_b', 'foot_b', '왼발'),
}
PARENT = {'lower': 'root', 'upper': 'lower', 'head': 'upper', 'hair_a': 'head', 'hair_b': 'head', 'hair_c': 'head', 'hair_d': 'head',
          'arm_sword': 'upper', 'forearm_sword': 'arm_sword', 'sword': 'forearm_sword', 'arm_back': 'upper', 'forearm_back': 'arm_back',
          'thigh_f': 'lower', 'shin_f': 'thigh_f', 'foot_f': 'shin_f', 'thigh_b': 'lower', 'shin_b': 'thigh_b', 'foot_b': 'shin_b'}
BONE_NAMES = {'root': '전체', 'lower': '아랫몸', 'upper': '윗몸'}


def main():
    a = np.array(Image.open(SHEET).convert('RGBA'))
    lab, _ = blobs(a)
    fit = json.load(open(FIT, encoding='utf-8'))
    rx, ry, rw, rh = fit['ref']
    out = os.path.join(DRAFT_DIR, 'mugetsu', 'parts')
    os.makedirs(out, exist_ok=True)
    parts, pix = {}, {}
    for i, (slot, bone, _) in PIECES.items():
        v = fit['pieces'][str(i)]
        (x0, y0), (w, h) = v['sheet'], v['size']
        sub = lab[y0:y0 + h, x0:x0 + w]
        vals, cnt = np.unique(sub[sub > 0], return_counts=True)
        m = sub == vals[np.argmax(cnt)]
        img = a[y0:y0 + h, x0:x0 + w].copy()
        img[~m] = 0
        Image.fromarray(img).save(os.path.join(out, slot + '.png'))
        cx, cy = v['at'][0] + OFF[0], v['at'][1] + OFF[1]
        parts[slot] = {'art': 'parts/' + slot, 'at': [int(cx), int(cy)], 'size': [int(w), int(h)]}
        if slot == 'body_base':  # 바탕은 관절 계산에서 뺌(몸 전체에 걸쳐 있어 가운데가 쏠림)
            continue
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
    low = pix['lower']
    piv['lower'] = [round(sum(q[0] for q in low) / len(low)), max(q[1] for q in low)]
    for b, p in PARENT.items():
        if b == 'lower':
            continue
        if b in ('thigh_f', 'thigh_b'):  # 하카마 위쪽 = 조각 맨 위 가운데(배와 넓게 겹쳐 가운데가 쏠리지 않게)
            top = min(q[1] for q in pix[b])
            xs = [q[0] for q in pix[b] if q[1] <= top + 4]
            piv[b] = [round(sum(xs) / len(xs)), top + 3]
        else:
            piv[b] = joint(b, p)
    bones = [{'id': 'root', 'parent': None, 'pivot': piv['root']}] + [{'id': b, 'parent': p, 'pivot': piv[b]} for b, p in PARENT.items()]
    order = [PIECES[i][0] for i in fit['order'] if i in PIECES]
    names = {**BONE_NAMES, **{s: n for s, _, n in PIECES.values()}}
    rig = {
        'id': 'mugetsu',
        'note': '이치고(무월 — 이름 추정) 종이인형(GDD 115-A 129, 작업본만 — 게임 미사용). 사용자 부위 시트를 scripts/rig/tools/fit_parts.py + mugetsu_parts.py 로 조립. 조각 → 부위는 추정(확인 대기).',
        'motionSpeed': 1.5, 'motionSpeedExcept': ['idle', 'homeIdle', 'move'],
        'canvas': [W, H], 'ground': H - 1,
        'bones': bones,
        'slots': [{'id': PIECES[i][0], 'bone': PIECES[i][1]} for i in fit['order'] if i in PIECES],
        'bodies': {'parts': parts},
        'looks': {'ichigo-mugetsu': {'body': 'parts'}},
        'bodySlots': {'parts': order},
        'hairFrame': {'rect': [0, 0, W, H], 'keepOut': [0, 0, 0, 0]},
        'view': {'note': '그림 칸 — 게임 미사용', 'rect': [-10, -20, 125, 140], 'clipY': H + 1},
        'edit': {'names': names,
                 'groups': [['전체', ['root']], ['머리', ['head', 'hair_a', 'hair_b', 'hair_c', 'hair_d']], ['몸통', ['upper', 'chest', 'lower', 'belly', 'body_base']],
                            ['오른팔(앞손)·칼', ['arm_sword', 'forearm_sword', 'sword']], ['왼팔(뒷손)', ['arm_back', 'forearm_back']],
                            ['오른 다리', ['thigh_f', 'shin_f', 'foot_f']], ['왼 다리', ['thigh_b', 'shin_b', 'foot_b']]],
                 'follow': {'head': ['hair_a', 'hair_b', 'hair_c', 'hair_d'], 'arm_sword': ['forearm_sword', 'sword'], 'forearm_sword': ['sword'], 'arm_back': ['forearm_back'],
                            'thigh_f': ['shin_f', 'foot_f'], 'shin_f': ['foot_f'], 'thigh_b': ['shin_b', 'foot_b'], 'shin_b': ['foot_b']}},
        'skeletons': {'parts': {PIECES[i][0]: [{'pts': [piv[PIECES[i][1]], piv[PIECES[i][1]]], 'w': 3}] for i in PIECES}},
        'sway': {'hair_a': {'lag': 130, 'swing': 0.5, 'hang': 0.1, 'wave': [3, 2000, 0]}, 'hair_b': {'lag': 150, 'swing': 0.5, 'hang': 0.1, 'wave': [3, 2300, 400]},
                 'hair_c': {'lag': 160, 'swing': 0.5, 'hang': 0.12, 'wave': [3.5, 2600, 800]}, 'hair_d': {'lag': 160, 'swing': 0.5, 'hang': 0.12, 'wave': [2.5, 2400, 1200]},
                 'forearm_back': {'lag': 140, 'swing': 0.3, 'hang': 0.05, 'wave': [1, 2200, 500]}},
    }
    open(os.path.join(DRAFT_DIR, 'mugetsu.json'), 'w', encoding='utf-8').write(json.dumps(rig, ensure_ascii=False, indent=1) + '\n')
    idle = {'duration': 2800, 'loop': True, 'tracks': {
        'upper': [[0, 0, 0, 0], [1400, 0, 0, 1], [2800, 0, 0, 0]],
        'head': [[0, 0.6, 0, 0], [1500, -0.9, 0, 0], [2800, 0.6, 0, 0]],
        'arm_sword': [[0, -1, 0, 0], [1400, 1.5, 0, 0], [2800, -1, 0, 0]],
        'sword': [[0, -0.5, 0, 0], [1600, 1, 0, 0], [2800, -0.5, 0, 0]]}}
    mo = {'note': '이치고(무월) 동작(GDD 115-A 129) — 지금은 대기만. 키 = [t, 각도(+=시계), x, y]. 뒷머리 가닥·왼팔은 따라가기(sway).', 'idle': idle}
    open(os.path.join(DRAFT_DIR, 'mugetsu-motions.json'), 'w', encoding='utf-8').write(json.dumps(mo, ensure_ascii=False, indent=1) + '\n')
    print('mugetsu 부위', len(parts), '관절', piv)


if __name__ == '__main__':
    main()
