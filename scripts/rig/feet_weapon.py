#!/usr/bin/env python3
"""종이인형 임시 발목 + 기본 칼 + 빈 칼집 (GDD 96장 8·10).

발목(임시): 다리 그림의 아래쪽 짚신 줄(하카마 색이 없는 줄부터 끝까지)을 잘라 발(foot_L·foot_R)로 따로 둔다.
  원본 다리 그림(<몸>/leg_X.png)은 그대로 두고 <몸>/leg_X_top.png · <몸>/foot_X.png 를 새로 만든다 — 시트에선 안 나눈다.
  발목 관절 = 발 윗줄 가운데. 발은 다리 뒤(하카마 자락이 발목을 덮게).
기본 칼: 1칸=1픽셀로 직접 찍는다(외곽선 1색 + 칼날 2톤 + 코등이 + 손잡이 감기). 손잡이 가운데가 손(앞팔 손바닥)에 온다.
  weapon 뼈 = 앞팔(arm_L)의 자식, 쉬는 자세에서 칼날이 앞아래(restRot)로.

사용: python3 scripts/rig/feet_weapon.py [--redraw-weapon]
  칼·칼집은 사용자가 새로 찍은 그림(2026-10-28, import_cut.py 의 sword·scabbard)을 쓰므로 기본은 건드리지 않는다.
  --redraw-weapon 일 때만 아래 임시 칼·칼집을 다시 찍고 자리·쉬는 각도를 되돌린다.
"""
from __future__ import annotations

import json
import os
import re
import sys

import numpy as np
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import sys as _sys
_sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from paths import DRAFT_ART, DRAFT_RIG_JSON, GAME_ART, GAME_RIG_JSON  # noqa: E402
ART = DRAFT_ART
RIG_JSON = DRAFT_RIG_JSON  # 작업본 (게임본은 promote.py)
FOOT_COLORS = {(0x0E, 0x0A, 0x10), (0xD5, 0x8C, 0x6F), (0xF9, 0xF1, 0xED)}

# 기본 칼 (세로, 손잡이 위·칼날 아래). K 외곽선, H 손잡이 감기, h 감기 무늬, G 코등이, g 코등이 그림자, B 칼날, b 칼날 그림자(등), W 날 끝 빛
SWORD = [
    '..KKK..',
    '..KhK..',
    '..KHK..',
    '..KhK..',
    '..KHK..',
    '..KhK..',
    '.KKKKK.',
    'KGGGGgK',
    '.KKKKK.',
    '..KBbK.',
    '..KBbK.',
    '..KBbK.',
    '..KBbK.',
    '..KBbK.',
    '..KBbK.',
    '..KBbK.',
    '..KBbK.',
    '..KBbK.',
    '..KBbK.',
    '..KBbK.',
    '..KBbK.',
    '..KBbK.',
    '..KBbK.',
    '..KWbK.',
    '..KWbK.',
    '...KWK.',
    '...KK..',
]
PAL = {
    'K': (0x0E, 0x0A, 0x10), 'H': (0x33, 0x2D, 0x39), 'h': (0xA3, 0x99, 0xA3), 'G': (0xC9, 0xA2, 0x4A), 'g': (0x8E, 0x6B, 0x2A),
    'B': (0xE6, 0xE9, 0xEF), 'b': (0x9A, 0xA4, 0xB2), 'W': (0xFF, 0xFF, 0xFF),
}
# 칼집(빈 칼집, 허리춤에 참). 세로로 그리고 위가 칼집 입구. S 옻칠, s 옻칠 그림자, C 끈(사게오), G·g 금속 테
SCABBARD = [
    'KGGgK',
    'KGGgK',
    'KSSsK',
    'KCCCK',
    'KSSsK',
    'KSSsK',
    'KSSsK',
    'KSSsK',
    'KSSsK',
    'KSSsK',
    'KSSsK',
    'KSSsK',
    'KSSsK',
    'KSSsK',
    'KSSsK',
    'KSSsK',
    'KSSsK',
    'KGGgK',
    '.KKK.',
]
SC_PAL = {'K': (0x0E, 0x0A, 0x10), 'S': (0x33, 0x2D, 0x39), 's': (0x20, 0x1B, 0x24), 'C': (0xA3, 0x99, 0xA3),
          'G': (0xC9, 0xA2, 0x4A), 'g': (0x8E, 0x6B, 0x2A)}
SC_MOUTH = (2, 0)    # 칼집 그림 안 입구 가운데
WAIST = (18, 50)     # 캔버스에서 허리춤(띠) 자리 — 칼집 입구가 여기
SC_REST = -55        # 쉬는 자세: 입구에서 뒤아래(오른쪽 아래)로 비스듬히
GRIP = (3, 3)        # 칼 그림 안 손잡이 가운데
HAND = (4, 56)       # 캔버스에서 앞팔 손 가운데(사신·아란칼 같음)
REST_ROT = 60        # 쉬는 자세: 칼날이 앞아래로(사용자 2026-10-27 지정 각도)


def dump(rig, path=None):
    s = json.dumps(rig, ensure_ascii=False, indent=2)
    s = re.sub(r'\[\s+(-?\d+),\s+(-?\d+)\s+\]', r'[\1, \2]', s)
    s = re.sub(r'\[\s+(-?\d+),\s+(-?\d+),\s+(-?\d+),\s+(-?\d+)\s+\]', r'[\1, \2, \3, \4]', s)
    s = re.sub(r'\{\s+"id": "([^"]+)",\s+"bone": "([^"]+)"\s+\}', r'{ "id": "\1", "bone": "\2" }', s)
    s = re.sub(r'\{\s+"id": "([^"]+)",\s+"parent": ([^,]+),\s+"pivot": (\[[^\]]+\])(,\s+"restRot": (-?\d+))?\s+\}',
               lambda m: '{ "id": "%s", "parent": %s, "pivot": %s%s }' % (m.group(1), m.group(2), m.group(3), f', "restRot": {m.group(5)}' if m.group(5) else ''), s)
    s = re.sub(r'\{\s+"art": "([^"]+)",\s+"at": (\[[^\]]+\]),\s+"size": (\[[^\]]+\])\s+\}', r'{ "art": "\1", "at": \2, "size": \3 }', s)
    open(path or RIG_JSON, 'w', encoding='utf-8').write(s + '\n')


def main():
    rig = json.load(open(RIG_JSON, encoding='utf-8'))
    ankles = {}
    for body, parts in rig['bodies'].items():
        for side in ('L', 'R'):
            leg = parts.get(f'leg_{side}')
            src_key = f'{body}/leg_{side}'
            foot = parts.get(f'foot_{side}')
            if foot and leg['art'] == src_key:
                # 시트에서 발을 따로 나눠 준 몸: 자르지 않고 발목만 발 윗줄 가운데로
                if body == 'arrancar':
                    ankles[side] = [foot['at'][0] + foot['size'][0] // 2, foot['at'][1]]
                print(f'{body} foot_{side}: 시트에서 나눈 발 사용')
                continue
            a = np.array(Image.open(os.path.join(ART, src_key + '.png')).convert('RGBA'))
            h = a.shape[0]
            top = h
            for y in range(h - 1, -1, -1):
                cols = {tuple(int(v) for v in p[:3]) for p in a[y][a[y][:, 3] > 0]}
                if cols and cols <= FOOT_COLORS:
                    top = y
                else:
                    break
            up, foot = a[:top], a[top:]
            fx = np.nonzero((foot[..., 3] > 0).any(0))[0]
            fcrop = foot[:, fx.min():fx.max() + 1]
            Image.fromarray(up).save(os.path.join(ART, f'{body}/leg_{side}_top.png'))
            Image.fromarray(fcrop).save(os.path.join(ART, f'{body}/foot_{side}.png'))
            x0, y0 = leg['at']
            parts[f'leg_{side}'] = {'art': f'{body}/leg_{side}_top', 'at': [x0, y0], 'size': [up.shape[1], up.shape[0]]}
            parts[f'foot_{side}'] = {'art': f'{body}/foot_{side}', 'at': [x0 + int(fx.min()), y0 + top], 'size': [fcrop.shape[1], fcrop.shape[0]]}
            if body == 'arrancar':
                ankles[side] = [x0 + int(fx.min() + fx.max()) // 2, y0 + top]
            print(f'{body} leg_{side}: 다리 {up.shape[1]}×{up.shape[0]} + 발 {fcrop.shape[1]}×{fcrop.shape[0]} (발목 y={y0 + top})')
    redraw = '--redraw-weapon' in sys.argv
    old = {b['id']: b for b in rig['bones']}
    if not redraw:
        bones = [b for b in rig['bones'] if b['id'] not in ('foot_L', 'foot_R', 'weapon', 'scabbard')]
        bones += [{'id': 'foot_L', 'parent': 'leg_L', 'pivot': ankles['L']}, {'id': 'foot_R', 'parent': 'leg_R', 'pivot': ankles['R']},
                  old['weapon'], old['scabbard']]
        rig['bones'] = bones
        dump(rig)
        print('발목', ankles, '(칼·칼집 유지)')
        return
    # 칼
    sw = np.zeros((len(SWORD), len(SWORD[0]), 4), np.uint8)
    for y, row in enumerate(SWORD):
        for x, ch in enumerate(row):
            if ch in PAL:
                sw[y, x] = (*PAL[ch], 255)
    os.makedirs(os.path.join(ART, 'weapon'), exist_ok=True)
    Image.fromarray(sw).save(os.path.join(ART, 'weapon', 'sword.png'))
    sc = np.zeros((len(SCABBARD), len(SCABBARD[0]), 4), np.uint8)
    for y, row in enumerate(SCABBARD):
        for x, ch in enumerate(row):
            if ch in SC_PAL:
                sc[y, x] = (*SC_PAL[ch], 255)
    Image.fromarray(sc).save(os.path.join(ART, 'weapon', 'scabbard.png'))
    scab = {'art': 'weapon/scabbard', 'at': [WAIST[0] - SC_MOUTH[0], WAIST[1] - SC_MOUTH[1]], 'size': [sc.shape[1], sc.shape[0]]}
    sword = {'art': 'weapon/sword', 'at': [HAND[0] - GRIP[0], HAND[1] - GRIP[1]], 'size': [sw.shape[1], sw.shape[0]]}
    for look in rig['looks'].values():
        look['weapon'] = sword
        look['scabbard'] = scab
    # 뼈·슬롯
    bones = [b for b in rig['bones'] if b['id'] not in ('foot_L', 'foot_R', 'weapon', 'scabbard')]
    bones += [{'id': 'foot_L', 'parent': 'leg_L', 'pivot': ankles['L']},
              {'id': 'foot_R', 'parent': 'leg_R', 'pivot': ankles['R']},
              {'id': 'weapon', 'parent': 'arm_L', 'pivot': list(HAND), 'restRot': REST_ROT},
              {'id': 'scabbard', 'parent': 'torso', 'pivot': list(WAIST), 'restRot': SC_REST}]
    rig['bones'] = bones
    # 슬롯: 있던 순서(뒷머리·겉옷 등)는 그대로 두고, 발·무기 슬롯이 없을 때만 다리·앞팔 바로 앞에 넣는다
    ids = [x['id'] for x in rig['slots']]
    for slot, before in (('foot_R', 'leg_R'), ('foot_L', 'leg_L'), ('weapon', 'arm_L'), ('scabbard', 'arm_R')):
        if slot not in ids:
            rig['slots'].insert(ids.index(before), {'id': slot, 'bone': slot})
            ids = [x['id'] for x in rig['slots']]
    dump(rig)
    print('칼', sw.shape[1], '×', sw.shape[0], '손 자리', HAND, '발목', ankles)


if __name__ == '__main__':
    main()
