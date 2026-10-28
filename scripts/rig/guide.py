#!/usr/bin/env python3
"""알몸 기본형 가이드 시트 (GDD 96장 16).

부위마다 칸(그리는 자리)을 한 줄로 늘어놓고, 칸 안에 기본형 부위를 그대로(불투명) 넣는다 — 그 위에 고쳐 그리면 된다.
칸 안 그림이 곧 그 부위: 가져오기 import_cut.py <시트> --body <몸> --guide <가이드.json> (안 고친 칸은 그대로 들어가 바뀌지 않음)
머리카락 칸에는 자리 맞추기용 머리만 반투명으로 깔고, 칸 테두리도 반투명 — 가져올 때 무시된다(불투명 칸만 읽음).
관절점·이름은 8배 확인용(guide-x8.png)에만 찍는다(1배에 찍으면 그림 칸을 덮으므로).

출력(<out>): guide.png(1배, 그리기용), guide-x8.png(8배, 칸 이름·관절 표시), guide.json(칸 → 슬롯·캔버스 자리)
사용: python3 scripts/rig/guide.py [--look arrancar-base] [--out docs/design/user-art/arrancar-base-guide]
      알몸: python3 scripts/rig/guide.py --look bare-base --out docs/design/user-art/bare-base-guide
"""
from __future__ import annotations

import argparse
import json
import os

import numpy as np
from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
ART = os.path.join(ROOT, 'public', 'art', 'rig', 'humanoid')
RIG = json.load(open(os.path.join(ROOT, 'src', 'data', 'art', 'rig', 'humanoid.json'), encoding='utf-8'))
PAD = 3   # 칸 사방 여유(관절 겹침·삐져나온 곳)
GAP = 2   # 칸 사이
TOP = 1   # 아래 테두리 자리
ROWGAP = 4  # 줄 사이(1배 칸 수)
PARTS = ['head', 'hair', 'hair_back', 'torso', 'arm_L', 'thumb_L', 'arm_R', 'forearm_R', 'leg_L', 'leg_R', 'foot_L', 'foot_R', 'weapon', 'scabbard']
NAMES = {'head': '머리', 'hair': '일반머리', 'hair_back': '뒷머리', 'torso': '몸통', 'arm_L': '왼팔(칼)', 'thumb_L': '엄지',
         'arm_R': '오른 위팔', 'forearm_R': '오른 아래팔', 'leg_L': '왼다리', 'leg_R': '오른다리', 'foot_L': '왼발', 'foot_R': '오른발', 'weapon': '칼', 'scabbard': '칼집'}
GHOST_A = 70
MARKS: dict = {}  # 사용자가 칸 안에 그은 선(<out>/marks.json, 캔버스 좌표) — main 에서 읽는다
LINE = (0, 190, 255, 140)
PIVOT = (255, 40, 40, 200)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--look', default='arrancar-base')
    ap.add_argument('--out', default=os.path.join(ROOT, 'docs', 'design', 'user-art', 'arrancar-base-guide'))
    a = ap.parse_args()
    mp = os.path.join(a.out, 'marks.json')
    if os.path.exists(mp):
        MARKS.update(json.load(open(mp, encoding='utf-8'))['marks'])
    look = RIG['looks'][a.look]
    body = RIG['bodies'][look['body']]
    slot_bone = {s['id']: s['bone'] for s in RIG['slots']}
    bones = {b['id']: b for b in RIG['bones']}
    fx, fy, fw, fh = RIG['hairFrame']['rect']
    boxes = []
    for p in PARTS:
        art = body.get(p) or (look[p] if isinstance(look.get(p), dict) else None)  # 칼·칼집은 외형 층
        if p in ('hair', 'hair_back'):
            # 머리카락은 머리카락 틀 전체가 칸. 흐린 그림 = 머리(머리카락이 있으면 머리카락)
            boxes.append({'slot': p, 'canvas': [fx, fy], 'size': [fw, fh], 'ghost': [body['head']] if body.get('head') else [],
                          'solid': [look[p]] if isinstance(look.get(p), dict) else []})
        elif art:
            boxes.append({'slot': p, 'canvas': [art['at'][0] - PAD, art['at'][1] - PAD], 'size': [art['size'][0] + 2 * PAD, art['size'][1] + 2 * PAD], 'ghost': [], 'solid': [art]})
    # 정사각형에 가깝게 줄 바꿈 배치(사용자 2026-10-28 "시트 길게 말고 정사각형 비슷하게"). 줄 사이 ROWGAP = 8배 확인용 칸 이름 자리
    area = sum((b['size'][0] + GAP) * (b['size'][1] + ROWGAP) for b in boxes)
    wt = max(max(b['size'][0] for b in boxes) + 2 * GAP, int(area ** 0.5 * 1.3))
    x, y, rowh, W = GAP, ROWGAP, 0, 0
    for b in boxes:
        w, h = b['size']
        if x + w + GAP > wt and x > GAP:
            x, y, rowh = GAP, y + rowh + ROWGAP, 0
        b['sheet'] = [x, y]
        x += w + GAP
        rowh = max(rowh, h)
        W = max(W, x)
    H = y + rowh + TOP
    img = np.zeros((H, W, 4), np.uint8)
    for b in boxes:
        x, TOP_ = b['sheet']
        cx, cy = b['canvas']
        w, h = b['size']
        for g, alpha in [(g, GHOST_A) for g in b['ghost']] + [(g, 255) for g in b['solid']]:
            pa = np.array(Image.open(os.path.join(ART, g['art'] + '.png')).convert('RGBA'))
            ox, oy = g['at'][0] - cx + x, g['at'][1] - cy + TOP_
            for yy, xx in zip(*np.nonzero(pa[..., 3] > 0)):
                X, Y = ox + xx, oy + yy
                if x <= X < x + w and TOP_ <= Y < TOP_ + h:
                    img[Y, X] = (*pa[yy, xx, :3], alpha)
        # 칸 테두리(칸 바로 바깥 1줄 — 위·아래만, 양옆은 칸 사이 GAP 가운데)
        img[TOP_ - 1, x - 1:x + w + 1] = LINE
        if TOP_ + h < H:
            img[TOP_ + h, x - 1:x + w + 1] = LINE
        img[TOP_ - 1:TOP_ + h + 1, x - 1] = LINE
        img[TOP_ - 1:TOP_ + h + 1, min(W - 1, x + w)] = LINE
        # 사용자가 칸 안에 그은 선(marks.json, 캔버스 좌표) — 빈 칸에만(그림을 덮지 않게)
        for mx, my in MARKS.get(b['slot'], []):
            X, Y = mx - cx + x, my - cy + TOP_
            if x <= X < x + w and TOP_ <= Y < TOP_ + h and img[Y, X, 3] == 0:
                img[Y, X] = LINE
        # 관절점: 이 슬롯의 뼈와 그 자식 뼈 관절 중 칸 안에 있는 것
        bone = slot_bone[b['slot']]
        pts = []
        for bb in RIG['bones']:
            if bb['id'] == bone or bb['parent'] == bone:
                px, py = bb['pivot']
                if cx <= px < cx + w and cy <= py < cy + h:
                    pts.append(bb['id'])
        b['pivots'] = pts
        del b['ghost'], b['solid']
    os.makedirs(a.out, exist_ok=True)
    Image.fromarray(img).save(os.path.join(a.out, 'guide.png'))
    json.dump({'note': '알몸 기본형 가이드 칸: sheet(시트 왼쪽 위) → canvas(캔버스 왼쪽 위), size = 칸 크기. 칸 안의 불투명 칸만 그 슬롯 그림', 'look': a.look,
               'body': look['body'], 'boxes': boxes}, open(os.path.join(a.out, 'guide.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    # 8배 확인용: 배경 + 칸 이름 + 관절 이름
    K = 8
    bg = Image.new('RGBA', (W, H), (150, 170, 150, 255))
    bg.alpha_composite(Image.fromarray(img))
    big = bg.resize((W * K, H * K), Image.NEAREST)
    top = 0
    out = Image.new('RGBA', (W * K, H * K + top + 30), (40, 44, 48, 255))
    out.paste(big, (0, top))
    d = ImageDraw.Draw(out)
    try:
        f = ImageFont.truetype('/usr/share/fonts/truetype/wqy/wqy-zenhei.ttc', 22)
        fs = ImageFont.truetype('/usr/share/fonts/truetype/wqy/wqy-zenhei.ttc', 15)
    except OSError:
        f = fs = ImageFont.load_default()
    pname = {'head': '목', 'torso': '허리', 'arm_L': '어깨', 'arm_R': '어깨', 'forearm_R': '팔꿈치', 'leg_L': '엉덩이', 'leg_R': '엉덩이',
             'foot_L': '발목', 'foot_R': '발목', 'weapon': '칼 손잡이', 'scabbard': '칼집', 'thumb_L': '엄지'}
    for b in boxes:
        sx, sy = b['sheet']
        d.rectangle([sx * K, (sy - ROWGAP) * K + 2, sx * K + b['size'][0] * K, sy * K - 10], fill=(40, 44, 48, 255))
        d.text((sx * K + 4, (sy - ROWGAP) * K + 4), NAMES[b['slot']], fill=(255, 255, 255, 255), font=f)
        for pid in b['pivots']:
            bb = bones[pid]
            px, py = bb['pivot'][0] - b['canvas'][0] + sx, bb['pivot'][1] - b['canvas'][1] + sy
            d.rectangle([px * K + 2, py * K + top + 2, px * K + K - 3, py * K + top + K - 3], outline=(255, 40, 40, 255), width=2)
            d.text((px * K + 10, py * K + top - 8), pname.get(pid, pid), fill=(255, 60, 60, 255), font=fs)
    d.text((8, H * K + top + 6), '칸 안 그림 위에 고쳐 그리면 몸에 그대로 붙는다 · 빨간 네모 = 관절(이 확인용에만) · 파란 선 = 칸 · 머리카락 칸의 흐린 머리는 자리 맞추기용', fill=(220, 220, 220, 255), font=fs)
    out.save(os.path.join(a.out, 'guide-x8.png'))
    print(f'가이드 {W}×{H}, 칸 {len(boxes)}개 → {a.out}')


if __name__ == '__main__':
    main()
