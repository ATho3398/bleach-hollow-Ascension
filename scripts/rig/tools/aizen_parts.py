#!/usr/bin/env python3
"""아이젠 부위 시트 조립 (GDD 115-A 125, 사용자 2026-11-14 "이거 한번 조립 해볼 수 있겠니??? 부위 모르는거 말하면 알려줌").
시트 = docs/design/user-art/aizen-ref/parts-2026-11-14.png (400×367): 오른쪽 위 참고 그림(몸 54×107) + 조각 23개(하늘색 상자 = 머리·손·칼, 칼 끝 빨간 점 = 표시라 뺌).
조각 자리 = docs/design/user-art/aizen-ref/fit-2026-11-14.json — 조각마다 참고 그림에서 색이 가장 많이 맞는 자리 → 겹쳐서 참고 그림과 가장 덜 다르게
자리·앞뒤 순서를 다듬은 결과(남은 차이 ≈ 하카마 안쪽 칠). 손·칼 자리·칼 관절·기본 각도는 사용자가 편집기에서 고정한 값(02:51) 그대로.
조각 → 부위(내 추정 — 사용자에게 확인 받을 것): 2 머리 · 3 옆머리 · 6 가슴(띠) · 7·13 깃 · 10 코트 앞자락(위) · 15 코트 오른쪽 자락(위) · 8 오른 위팔(앞, 칼 드는 팔) ·
11 오른 아래팔 · 14 소매 끝 · 12 코트 앞자락(아래, ∧) · 16 코트 뒷자락(왼쪽으로 날림) · 9·17·20 코트 오른쪽 자락(아래) · 19·18 허벅지(하카마 위) · 22·21 정강이(하카마 아래) · 23·24 발.
뼈(새 몸 parts 만): 전체 → 아랫몸(허리) → 윗몸 → 머리, 윗몸 → 오른 위팔 → 오른 아래팔 → 손 → 칼, 아랫몸 → 코트 앞자락·뒷자락·오른쪽 자락 2, 아랫몸 → 허벅지 → 정강이 → 발 (× 2).
관절 = 부모·자식 조각이 겹친 칸들의 가운데. 사용: python3 scripts/rig/tools/aizen_parts.py → aizen.json 의 몸 parts·외형 aizen-parts, aizen/parts/*.png
"""
import json
import os
import sys

import numpy as np
from PIL import Image

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from paths import DRAFT_DIR, ROOT  # noqa: E402

SHEET = os.path.join(ROOT, 'docs/design/user-art/aizen-ref/parts-2026-11-14.png')
FIT = os.path.join(ROOT, 'docs/design/user-art/aizen-ref/fit-2026-11-14.json')
OFF = (10, 0)  # 참고 그림 왼쪽 위 → 캔버스 (10, 0) (먼저 만든 아이젠 몸과 같은 자리)
# 조각 번호 → (슬롯, 뼈)
PIECES = {2: ('head', 'head'), 3: ('hair_side', 'head'), 6: ('chest', 'upper'), 7: ('collar_L', 'upper'), 13: ('collar_R', 'upper'),
          10: ('coat_front_top', 'upper'), 15: ('coat_side_top', 'upper'), 8: ('arm_sword', 'arm_sword'), 11: ('forearm_sword', 'forearm_sword'),
          14: ('cuff', 'forearm_sword'), 12: ('coat_front', 'lower'), 9: ('coat_inner', 'lower'), 16: ('coat_tail', 'coat_tail'),
          17: ('coat_side1', 'coat_side1'), 20: ('coat_side2', 'coat_side2'), 19: ('thigh_a', 'thigh_a'), 18: ('thigh_b', 'thigh_b'),
          22: ('shin_a', 'shin_a'), 21: ('shin_b', 'shin_b'), 23: ('foot_a', 'foot_a'), 24: ('foot_b', 'foot_b')}
PARENT = {'lower': 'root', 'upper': 'lower', 'head': 'upper', 'arm_sword': 'upper', 'forearm_sword': 'arm_sword', 'hand': 'forearm_sword', 'sword': 'hand',
          'coat_tail': 'lower', 'coat_side1': 'lower', 'coat_side2': 'lower', 'thigh_a': 'lower', 'thigh_b': 'lower',
          'shin_a': 'thigh_a', 'shin_b': 'thigh_b', 'foot_a': 'shin_a', 'foot_b': 'shin_b'}
NAMES = {'lower': '아랫몸(허리·코트 아래)', 'upper': '윗몸', 'head': '머리', 'arm_sword': '오른 위팔(앞)', 'forearm_sword': '오른 아래팔(앞)', 'hand': '오른손(앞손)', 'sword': '칼',
         'coat_tail': '코트 뒷자락', 'coat_side1': '코트 오른쪽 자락 1', 'coat_side2': '코트 오른쪽 자락 2', 'thigh_a': '허벅지 A(하카마)', 'thigh_b': '허벅지 B(하카마)',
         'shin_a': '정강이 A', 'shin_b': '정강이 B', 'foot_a': '발 A', 'foot_b': '발 B'}


def blobs(a):
    m = (a[..., 3] > 127) & ~((a[..., 0] < 80) & (a[..., 1] > 150) & (a[..., 2] > 200))  # 하늘색 상자 빼기
    m &= ~((a[..., 0] == 255) & (a[..., 1] == 60) & (a[..., 2] == 60))  # 칼 끝 빨간 표시 빼기
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
    # 번호 = 위 → 아래, 왼 → 오른 차례(조립 계산 때와 같게)
    order = sorted(range(1, n + 1), key=lambda i: (np.nonzero(lab == i)[0].min(), np.nonzero(lab == i)[1].min()))
    return {k + 1: (lab == i) for k, i in enumerate(order)}


def main():
    a = np.array(Image.open(SHEET).convert('RGBA'))
    B = blobs(a)
    fit = json.load(open(FIT, encoding='utf-8'))
    at = {int(k): v for k, v in fit['at'].items()}
    path = os.path.join(DRAFT_DIR, 'aizen.json')
    rig = json.load(open(path, encoding='utf-8'))
    ref = rig['bodies']['ref']
    out = os.path.join(DRAFT_DIR, 'aizen', 'parts')
    os.makedirs(out, exist_ok=True)
    parts, pix = {}, {}
    for i, (slot, bone) in PIECES.items():
        m = B[i]
        ys, xs = np.nonzero(m)
        x0, y0 = xs.min(), ys.min()
        img = a[y0:ys.max() + 1, x0:xs.max() + 1].copy()
        img[~m[y0:ys.max() + 1, x0:xs.max() + 1]] = 0
        Image.fromarray(img).save(os.path.join(out, slot + '.png'))
        cx, cy = at[i][0] + OFF[0], at[i][1] + OFF[1]
        parts[slot] = {'art': 'parts/' + slot, 'at': [int(cx), int(cy)], 'size': [int(img.shape[1]), int(img.shape[0])]}
        pix.setdefault(bone, set()).update((int(x - x0 + cx), int(y - y0 + cy)) for y, x in zip(ys, xs))
    # 손·칼 = 편집기 고정 값 그대로(그림만 이 시트의 것 — 손 12×11, 칼 36×65)
    for slot, i in (('hand', 4), ('sword', 5)):
        m = B[i]
        ys, xs = np.nonzero(m)
        img = a[ys.min():ys.max() + 1, xs.min():xs.max() + 1].copy()
        img[~m[ys.min():ys.max() + 1, xs.min():xs.max() + 1]] = 0
        Image.fromarray(img).save(os.path.join(out, slot + '.png'))
        parts[slot] = {'art': 'parts/' + slot, 'at': list(ref[slot]['at']), 'size': [int(img.shape[1]), int(img.shape[0])]}

    def joint(child, parent):
        A, P = pix.get(child, set()), pix.get(parent, set())
        ov = A & P
        if not ov:
            if not A or not P:
                return None
            a_, p_ = min(((x, y) for x in A for y in P), key=lambda q: (q[0][0] - q[1][0]) ** 2 + (q[0][1] - q[1][1]) ** 2)
            ov = {a_, p_}
        return [round(sum(q[0] for q in ov) / len(ov)), round(sum(q[1] for q in ov) / len(ov))]

    piv = {}
    for b, p in PARENT.items():
        j = joint(b, p) if b not in ('lower', 'hand', 'sword') else None
        if j:
            piv[b] = j
    piv['lower'] = piv['upper']  # 허리
    piv['root'] = [37, 107]
    bj = rig['bodyJoints']['ref']['pivots']
    piv['hand'] = next(b['pivot'] for b in rig['bones'] if b['id'] == 'hand')
    piv['sword'] = bj.get('sword') or next(b['pivot'] for b in rig['bones'] if b['id'] == 'sword')
    # 뼈·슬롯 더하기(이미 있는 뼈는 그대로 — 이 몸의 관절은 bodyJoints.parts)
    have = {b['id'] for b in rig['bones']}
    for b, p in PARENT.items():
        if b not in have:
            rig['bones'].append({'id': b, 'parent': p, 'pivot': piv[b]})
    have_s = {s['id'] for s in rig['slots']}
    for i, (slot, bone) in PIECES.items():
        if slot not in have_s:
            rig['slots'].append({'id': slot, 'bone': bone})
    rig['bodies']['parts'] = parts
    rig['bodyJoints']['parts'] = {'pivots': {b: piv[b] for b in PARENT if b in piv} | {'root': piv['root']}, 'rot': {'sword': rig['bodyJoints']['ref'].get('rot', {}).get('sword', 0)}}
    slot_of = {i: s for i, (s, _) in PIECES.items()}
    rig.setdefault('bodySlots', {})['parts'] = [slot_of[i] for i in fit['order'] if i in slot_of] + ['sword', 'hand']
    rig['looks']['aizen-parts'] = {'body': 'parts'}
    rig['edit']['names'].update(NAMES)
    rig['edit']['groups'] = [['전체', ['root']], ['몸', ['head', 'upper', 'lower']], ['오른팔(앞손)·칼', ['arm_sword', 'forearm_sword', 'hand', 'sword']],
                             ['코트 자락', ['coat_tail', 'coat_side1', 'coat_side2']], ['다리', ['thigh_a', 'shin_a', 'foot_a', 'thigh_b', 'shin_b', 'foot_b']]]
    rig['edit']['follow'].update({'arm_sword': ['forearm_sword', 'hand', 'sword'], 'forearm_sword': ['hand', 'sword'], 'thigh_a': ['shin_a', 'foot_a'], 'shin_a': ['foot_a'],
                                  'thigh_b': ['shin_b', 'foot_b'], 'shin_b': ['foot_b']})
    rig['edit']['follow']['upper'] = sorted(set(rig['edit']['follow'].get('upper', [])) | {'arm_sword', 'forearm_sword'})
    rig['sway'] = {'coat_tail': {'lag': 120, 'swing': 0.6, 'hang': 0.15, 'wave': [3, 1700, 0]},
                   'coat_side1': {'lag': 120, 'swing': 0.5, 'hang': 0.15, 'wave': [1.5, 1900, 300]},
                   'coat_side2': {'lag': 120, 'swing': 0.5, 'hang': 0.15, 'wave': [2, 1600, 600]}}
    sk = rig.setdefault('skeletons', {})
    sk['parts'] = {b: [{'pts': [piv[PARENT[b]] if PARENT[b] in piv else piv[b], piv[b]], 'w': 3}] for b in PARENT if b in piv}
    open(path, 'w', encoding='utf-8').write(json.dumps(rig, ensure_ascii=False, indent=1) + '\n')
    mp = os.path.join(DRAFT_DIR, 'aizen-motions.json')
    mo = json.load(open(mp, encoding='utf-8'))
    tr = mo['idle']['tracks']
    # 칼 든 팔이 숨에 맞춰 아주 조금(위팔 ±1.5°, 아래팔 ±1°) — 손·칼 트랙은 그대로
    tr.setdefault('arm_sword', [[0, -1, 0, 0], [1400, 1.5, 0, 0], [2800, -1, 0, 0]])
    tr.setdefault('forearm_sword', [[0, -0.5, 0, 0], [1500, 1, 0, 0], [2800, -0.5, 0, 0]])
    open(mp, 'w', encoding='utf-8').write(json.dumps(mo, ensure_ascii=False, indent=1) + '\n')
    print('parts', len(parts), 'pivots', rig['bodyJoints']['parts']['pivots'])


if __name__ == '__main__':
    main()
