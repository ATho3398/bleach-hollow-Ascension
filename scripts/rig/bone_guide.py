#!/usr/bin/env python3
"""뼈대 가이드 시트 (GDD 115-A 47): 부위마다 칸 하나, 칸 안에는 그 부위의 뼈대 선(길이·각도)과 관절 점만 그린다 — 그림 없음.
사용자 원문(2026-10-29): "필요한 모양 길이나 각도만 맞춰서 박스 안에 선으로 그려줘 … 뼈대만 그려주면 된단 얘기야. 내가 디자인을 거기 맞출게"

뼈대 선 = 뼈대 데이터 skeletons.<몸>.<슬롯> = [{pts 꺾은선(캔버스 좌표), w 굵기}]. 칸 = 선을 굵기만큼 둘러싼 자리(+ 지금 그림이 있으면 그 자리까지).
1배 guide.png 의 칸 테두리·뼈대 선·관절 점은 반투명이라 가져올 때 무시된다(불투명 칸만 그 부위 그림). 8배 guide-x8.png 에 칸 이름·관절 이름.
guide.json = 칸 → 슬롯·캔버스 자리(guide.py 와 같은 모양 + rig).
사용: python3 scripts/rig/bone_guide.py <뼈대 id> <외형 id> <출력 폴더>
     예) python3 scripts/rig/bone_guide.py beast beast-test docs/design/user-art/beast-guide
"""
from __future__ import annotations

import json
import os
import sys

import numpy as np
from PIL import Image, ImageDraw, ImageFont

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from paths import DRAFT_DIR  # noqa: E402

PAD = 2
GAP = 2
ROWGAP = 4
BOX = (0, 190, 255, 140)    # 칸 테두리 (guide.py 와 같은 색)
BONE = (255, 60, 60, 150)   # 뼈대 선
JOINT = (255, 200, 0, 170)  # 관절 점
K = 8


def line_px(a, b):
    """두 점 사이 칸들(브레젠험)"""
    (x0, y0), (x1, y1) = (int(round(a[0])), int(round(a[1]))), (int(round(b[0])), int(round(b[1])))
    dx, dy = abs(x1 - x0), -abs(y1 - y0)
    sx, sy = (1 if x0 < x1 else -1), (1 if y0 < y1 else -1)
    err = dx + dy
    out = []
    while True:
        out.append((x0, y0))
        if (x0, y0) == (x1, y1):
            return out
        e2 = 2 * err
        if e2 >= dy:
            err += dy
            x0 += sx
        if e2 <= dx:
            err += dx
            y0 += sy


def main(rig_id, look_id, out):
    rig = json.load(open(os.path.join(DRAFT_DIR, f'{rig_id}.json'), encoding='utf-8'))
    look = rig['looks'][look_id]
    body_id = look['body']
    skel = rig['skeletons'][body_id]
    art = rig['bodies'].get(body_id, {})
    bj = (rig.get('bodyJoints') or {}).get(body_id)
    piv = {b['id']: ((bj or {}).get('pivots') or {}).get(b['id'], b['pivot']) for b in rig['bones']}
    parent = {b['id']: b['parent'] for b in rig['bones']}
    slot_bone = {s['id']: s['bone'] for s in rig['slots']}
    names = (rig.get('edit') or {}).get('names', {})
    # 슬롯 차례 = 편집기 부위 묶음 차례(머리부터), 그 밖은 앞뒤 순서
    order = [s for _, ids in (rig.get('edit') or {}).get('groups', []) for s in ids]
    order += [s['id'] for s in rig['slots'] if s['id'] not in order]
    boxes = []
    for slot in order:
        if slot not in skel:
            continue
        xs, ys = [], []
        for st in skel[slot]:
            r = st['w'] / 2
            for x, y in st['pts']:
                xs += [x - r, x + r]
                ys += [y - r, y + r]
        if slot in art:
            (ax, ay), (aw, ah) = art[slot]['at'], art[slot]['size']
            xs += [ax, ax + aw]
            ys += [ay, ay + ah]
        x0, y0 = int(np.floor(min(xs))) - PAD, int(np.floor(min(ys))) - PAD
        x1, y1 = int(np.ceil(max(xs))) + PAD, int(np.ceil(max(ys))) + PAD
        bone = slot_bone[slot]
        # 이 칸의 관절: 이 슬롯 뼈 + 그 자식 뼈(이 몸 뼈대에 있는 부위의 뼈만) 중 칸 안에 있는 것
        used = {slot_bone[s] for s in skel}
        joints = [b for b in piv if b in used and (b == bone or parent[b] == bone) and x0 <= piv[b][0] < x1 and y0 <= piv[b][1] < y1]
        boxes.append({'slot': slot, 'canvas': [x0, y0], 'size': [x1 - x0, y1 - y0], 'pivots': joints})
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
    H = y + rowh + 1
    img = np.zeros((H, W, 4), np.uint8)
    for b in boxes:
        sx, sy = b['sheet']
        cx, cy = b['canvas']
        w, h = b['size']
        img[sy - 1, sx - 1:sx + w + 1] = BOX
        if sy + h < H:
            img[sy + h, sx - 1:sx + w + 1] = BOX
        img[sy - 1:sy + h + 1, sx - 1] = BOX
        img[sy - 1:sy + h + 1, min(W - 1, sx + w)] = BOX
        for st in skel[b['slot']]:
            for p0, p1 in zip(st['pts'], st['pts'][1:]):
                for px, py in line_px((p0[0] - cx + sx, p0[1] - cy + sy), (p1[0] - cx + sx, p1[1] - cy + sy)):
                    if sx <= px < sx + w and sy <= py < sy + h:
                        img[py, px] = BONE
        for j in b['pivots']:
            px, py = piv[j][0] - cx + sx, piv[j][1] - cy + sy
            img[py, px] = JOINT
    os.makedirs(out, exist_ok=True)
    Image.fromarray(img).save(os.path.join(out, 'guide.png'))
    json.dump({'note': '뼈대 가이드 칸(GDD 115-A 47): sheet(시트 왼쪽 위) → canvas(캔버스 왼쪽 위), size = 칸 크기. 칸 안 반투명 선 = 뼈대(가져올 때 무시), 불투명 칸만 그 슬롯 그림',
               'rig': rig_id, 'look': look_id, 'body': body_id, 'boxes': boxes},
              open(os.path.join(out, 'guide.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    # 8배 확인용: 칸 이름 + 뼈대 선(굵게) + 관절 이름
    bg = Image.new('RGBA', (W * K, H * K + 30), (40, 44, 48, 255))
    base = Image.new('RGBA', (W, H), (150, 170, 150, 255))
    base.alpha_composite(Image.fromarray(img))
    bg.paste(base.resize((W * K, H * K), Image.NEAREST), (0, 0))
    d = ImageDraw.Draw(bg)
    try:
        f = ImageFont.truetype('/usr/share/fonts/truetype/wqy/wqy-zenhei.ttc', 20)
        fs = ImageFont.truetype('/usr/share/fonts/truetype/wqy/wqy-zenhei.ttc', 14)
    except OSError:
        f = fs = ImageFont.load_default()
    for b in boxes:
        sx, sy = b['sheet']
        cx, cy = b['canvas']
        d.rectangle([sx * K, (sy - ROWGAP) * K + 2, sx * K + b['size'][0] * K, sy * K - 10], fill=(40, 44, 48, 255))
        d.text((sx * K + 4, (sy - ROWGAP) * K + 4), names.get(b['slot'], b['slot']), fill=(255, 255, 255, 255), font=f)
        for st in skel[b['slot']]:
            pts = [((px - cx + sx + .5) * K, (py - cy + sy + .5) * K) for px, py in st['pts']]
            d.line(pts, fill=(255, 70, 70, 255), width=3)
        for j in b['pivots']:
            px, py = (piv[j][0] - cx + sx) * K, (piv[j][1] - cy + sy) * K
            d.rectangle([px + 1, py + 1, px + K - 2, py + K - 2], outline=(255, 210, 0, 255), width=2)
            d.text((px + K + 2, py - 6), names.get(j, j), fill=(255, 220, 80, 255), font=fs)
    d.text((8, H * K + 6), '칸 안 빨간 선 = 뼈대(길이·각도), 노란 네모 = 관절. 선에 맞춰 부위를 그리면 된다(선·테두리는 반투명이라 가져올 때 빠짐)', fill=(220, 220, 220, 255), font=fs)
    bg.save(os.path.join(out, 'guide-x8.png'))
    print(f'{rig_id}/{look_id}: 가이드 {W}×{H}, 칸 {len(boxes)}개 → {out}')


if __name__ == '__main__':
    main(*sys.argv[1:4])
