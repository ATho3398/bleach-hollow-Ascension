#!/usr/bin/env python3
"""혈쇄 이치고 사슬 이펙트 — 띠·풀린 끝 자리를 인형 조각에 붙이기 (GDD 115-A 149, 사용자 2026-11-16 도트 세션에 "혈쇄 도트는 이거로 수정해서 사슬 이펙트 채워주고 종이인형 세션에 최신화 시켜줘").
자료 = 도트 세션 docs/art-samples/chain-ichigo-flame/ (README·chain.py — 목·두 손목·두 발목 다섯 군데, 띠 = 몸 앞, 풀린 끝·조각·빛무리 = 몸 뒤).
띠는 조각에 붙인다(README "종이인형에 붙일 때"): 목 = 몸통 조각 맨 위 목 칸, 손목 = 아래팔 끝(손 바로 위), 발목 = 발 조각 위(정강이 끝). 띠 = 그 줄의 불투명 칸 폭을 가로지르는 살짝 처진 꺾은선.
풀린 끝은 띠의 한쪽 끝에서(목은 등 쪽 한쪽으로만 짧게), 각도·길이·휨·위상은 chain.py 값 그대로.
사용: python3 scripts/rig/tools/ichigo_chain.py → docs/design/rig-draft/ichigo-chain.json
주의: 편집기 '사슬 자리 옮기기'로 고정한 뒤로는 ichigo-chain.json 이 기준 — 다시 돌리면 고정 값이 처음 값으로 덮인다(사용자 2026-11-17 "사슬 위치 정할테니까 … 조작 가능하게").
"""
import json
import os
import sys

import numpy as np
from PIL import Image

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from paths import DRAFT_DIR  # noqa: E402

# (슬롯, 띠 줄, 풀린 끝 쪽(-1 왼 / +1 오른), chain.py 의 풀린 끝 값)
NAMES = ['목', '칼 든 손목', '뒷손 손목', '왼발목', '오른발목']
SPOTS = [
    ('torso', 2, +1, dict(ang=12, L=6, w=1.2, curl=+2.0, ph=0.0, sw=0.25)),        # 목 — 등 쪽(오른쪽) 한쪽으로만, 흔들림 0.25배
    ('forearm_sword', 10, -1, dict(ang=170, L=6, w=1.2, curl=-4.0, ph=0.35)),      # 칼 든 손목(화면 왼쪽)
    ('arm_back', 22, +1, dict(ang=15, L=6, w=1.2, curl=+4.0, ph=0.6)),             # 뒷손 손목(화면 오른쪽)
    ('foot_a', 7, -1, dict(ang=160, L=5, w=1.1, curl=-4.0, ph=0.15)),              # 왼발목
    ('foot_b', 7, +1, dict(ang=20, L=5, w=1.1, curl=+4.0, ph=0.8)),                # 오른발목
]


def main():
    rig = json.load(open(os.path.join(DRAFT_DIR, 'ichigo.json'), encoding='utf-8'))
    parts = rig['bodies']['parts']
    bands, tails = [], []
    for name, (slot, row, side, tail) in zip(NAMES, SPOTS):
        img = np.array(Image.open(os.path.join(DRAFT_DIR, 'ichigo', parts[slot]['art'] + '.png')).convert('RGBA')).astype(int)
        # 살(목·손목·발목) 칸 폭만 — 소매·옷깃은 빼고(README "목 폭에만"), 살 양옆 외곽선 한 칸까지
        skin = (img[row, :, 3] > 127) & (img[row, :, 0] > 150) & (img[row, :, 1] > 90)
        xs = np.nonzero(skin)[0]
        xs = np.array([xs.min() - 1, xs.max() + 1])
        x0, x1 = float(xs.min()) - 0.5, float(xs.max()) + 1.5
        mid = (x0 + x1) / 2
        y = row + 0.5
        bands.append({'name': name, 'slot': slot, 'pts': [[round(x0, 1), y], [round(mid, 1), y + 1.5], [round(x1, 1), y]]})
        tails.append({'name': name, 'slot': slot, 'x': round(x1 if side > 0 else x0, 1), 'y': y, **tail})
    spec = {'note': '혈쇄 이치고 사슬 이펙트(GDD 115-A 149, 작업본만) — scripts/rig/tools/ichigo_chain.py 가 만듦. 띠·풀린 끝 = 조각(slot) 안 좌표. 그리기 = scripts/rig/chain.ts(도트 세션 chain.py 그대로).',
            'look': 'ichigo-bloody', 'pad': [24, 16, 24, 6], 'noGlow': ['head', 'face_bit'], 'bands': bands, 'tails': tails}
    open(os.path.join(DRAFT_DIR, 'ichigo-chain.json'), 'w', encoding='utf-8').write(json.dumps(spec, ensure_ascii=False, indent=1) + '\n')
    print('사슬 자리', [(b['slot'], b['pts']) for b in bands])


if __name__ == '__main__':
    main()
