#!/usr/bin/env python3
"""부위 시트(1배) — 사용자 도트를 잘라 쓰거나 조립한 몸(역관절·덩치·두건: 도트 n배로 키운 몸)의 부위를 원래 1배 크기로 한 장에 늘어놓는다 (GDD 115-A 92).
사용자 "시트로 만들어주는데 … 시트에 조각 나눠줘봐": 부위마다 따로 떨어진 칸, 그 위에 고쳐 그려 보내면 다시 조립(assemble_parts.py)·자르기에 쓴다.
출력(<out>): guide.png(1배, 부위만 — 그리기용), guide-x8.png(8배, 칸 이름·관절 점), guide.json(칸 → 슬롯·1배 자리·캔버스 자리·배율)
편집기 '시트 받기'(115-A 91)는 n배 몸이면 이 시트를 내려받는다.
사용: python3 scripts/rig/parts_sheet.py --look hood-base --out <폴더>
"""
from __future__ import annotations

import argparse
import json
import os
import sys

import numpy as np
from PIL import Image, ImageDraw, ImageFont

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from paths import DRAFT_ART, DRAFT_DIR, DRAFT_RIG_JSON, ROOT, look_art  # noqa: E402

GAP, ROWGAP, K = 3, 6, 8
NAMES = {'head': '머리', 'jaw': '턱', 'torso': '몸통', 'arm_L': '뒤 위팔', 'forearm_L': '뒤 아래팔', 'arm_R': '앞 위팔', 'forearm_R': '앞 아래팔',
         'leg_L': '뒷다리 허벅지', 'shin_L': '뒷다리 정강이', 'foot_L': '뒷발', 'leg_R': '앞다리 허벅지', 'shin_R': '앞다리 정강이', 'foot_R': '앞발',
         'cape': '로브(윗단)', 'cape2': '로브(가운데)', 'cape3': '로브(아랫단)'}


def scale_of(rig, body):
    cut = (rig.get('cuts') or {}).get(body)
    if cut:
        return int(cut.get('scale', 1))
    asm = (rig.get('assembled') or {}).get(body)
    if asm:
        return int(json.load(open(os.path.join(ROOT, asm), encoding='utf-8')).get('scale', 1))
    return 1


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--look', required=True)
    ap.add_argument('--out', required=True)
    a = ap.parse_args()
    rig = json.load(open(DRAFT_RIG_JSON, encoding='utf-8'))
    look = rig['looks'][a.look]
    body_id = look['body']
    body = rig['bodies'][body_id]
    sc = scale_of(rig, body_id)
    names = dict(NAMES, **({'arm_L': '뒤 팔', 'arm_R': '앞 팔'} if 'forearm_R' not in body else {}))  # 아래팔이 없는 몸(두건)은 팔 하나
    bj = (rig.get('bodyJoints') or {}).get(body_id) or {}
    piv = {b['id']: (bj.get('pivots') or {}).get(b['id'], b['pivot']) for b in rig['bones']}
    parent = {b['id']: b['parent'] for b in rig['bones']}
    slot_bone = {s['id']: s['bone'] for s in rig['slots']}
    order = (rig.get('bodySlots') or {}).get(body_id) or [s['id'] for s in rig['slots']]
    order = list(reversed([s for s in order if s in body]))  # 앞에 그리는 부위(머리)부터
    boxes = []
    for slot in order:
        p = body[slot]
        im = np.array(Image.open(os.path.join(DRAFT_ART, look_art(look, p['art']) + '.png')).convert('RGBA'))
        small = im[::sc, ::sc] if sc > 1 else im
        used = {slot_bone[s] for s in body}
        bone = slot_bone[slot]
        joints = [b for b in piv if b in used and (b == bone or parent.get(b) == bone)]
        boxes.append({'slot': slot, 'img': small, 'at': [p['at'][0], p['at'][1]], 'size1': [small.shape[1], small.shape[0]], 'joints': joints})
    area = sum((b['size1'][0] + GAP) * (b['size1'][1] + ROWGAP) for b in boxes)
    wt = max(max(b['size1'][0] for b in boxes) + 2 * GAP, int(area ** 0.5 * 1.4))
    x, y, rowh, W = GAP, ROWGAP, 0, 0
    for b in boxes:
        w, h = b['size1']
        if x + w + GAP > wt and x > GAP:
            x, y, rowh = GAP, y + rowh + ROWGAP, 0
        b['sheet'] = [x, y]
        x += w + GAP
        rowh = max(rowh, h)
        W = max(W, x)
    H = y + rowh + GAP
    sheet = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    for b in boxes:
        sheet.alpha_composite(Image.fromarray(b['img']), tuple(b['sheet']))
    os.makedirs(a.out, exist_ok=True)
    sheet.save(os.path.join(a.out, 'guide.png'))
    # 8배 확인용
    big = Image.new('RGBA', (W * K, H * K + 30), (40, 44, 48, 255))
    d = ImageDraw.Draw(big)
    try:
        f = ImageFont.truetype('/usr/share/fonts/truetype/wqy/wqy-zenhei.ttc', 18)
        fs = ImageFont.truetype('/usr/share/fonts/truetype/wqy/wqy-zenhei.ttc', 13)
    except OSError:
        f = fs = ImageFont.load_default()
    for b in boxes:
        sx, sy = b['sheet']
        w, h = b['size1']
        d.rectangle([(sx - 1) * K, (sy - 1) * K, (sx + w + 1) * K - 1, (sy + h + 1) * K - 1], fill=(150, 170, 150, 255))
        big.alpha_composite(Image.fromarray(b['img']).resize((w * K, h * K), Image.NEAREST), (sx * K, sy * K))
        d.text((sx * K, (sy - ROWGAP + 1) * K), names.get(b['slot'], b['slot']), fill=(255, 255, 255, 255), font=f)
        for j in b['joints']:
            jx, jy = (piv[j][0] - b['at'][0]) / sc, (piv[j][1] - b['at'][1]) / sc
            X, Y = (sx + jx) * K, (sy + jy) * K
            d.rectangle([X - 4, Y - 4, X + 4, Y + 4], outline=(255, 210, 0, 255), width=2)
            d.text((X + 6, Y - 8), names.get(j, j) if j != b['slot'] else '관절', fill=(255, 210, 0, 255), font=fs)
    d.text((6, H * K + 6), f'부위 시트 1배(원래 도트 크기, 게임에서는 {sc}배). 칸 안 그림 위에 고쳐 그리면 된다 · 노란 네모 = 관절(이 확인용에만)', fill=(255, 255, 255, 255), font=fs)
    big.save(os.path.join(a.out, 'guide-x8.png'))
    json.dump({'note': '부위 시트 1배(GDD 115-A 92): sheet = 시트 왼쪽 위(1배), canvas = 캔버스 왼쪽 위(배율 적용), scale = 배율', 'look': a.look, 'body': body_id, 'scale': sc,
               'boxes': [{'slot': b['slot'], 'sheet': b['sheet'], 'size': b['size1'], 'canvas': b['at']} for b in boxes]},
              open(os.path.join(a.out, 'guide.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    print(f'부위 시트 {a.look}: {W}×{H}(1배), 부위 {len(boxes)}, 배율 {sc} → {a.out}')


if __name__ == '__main__':
    main()
