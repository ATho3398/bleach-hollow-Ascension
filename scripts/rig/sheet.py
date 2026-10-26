#!/usr/bin/env python3
"""종이인형 부위 ↔ 스프라이트 시트 (GDD 96장).

pack  : public/art/rig/humanoid/ 의 부위(37×81 캔버스)를 꼭 맞게 잘라 몸마다 시트 한 장으로 모은다.
        부위마다 사방 PAD 칸 여백을 둬서 관절 겹침 여분·가려졌던 곳을 그 안에 그려 넣을 수 있다.
        출력: <out>/<몸>-sheet.png(1배), <몸>-sheet-x8.png(확인용, 칸 경계·관절점 표시), <몸>-sheet.json
unpack: 손질한 시트를 다시 부위 파일(37×81 캔버스, 원래 자리)로 풀어 public/art/rig/humanoid/ 에 쓴다.
        여백에 새로 그린 칸도 같이 들어간다(캔버스 밖으로 나가는 칸만 잘림).

사용:
  python3 scripts/rig/sheet.py pack   [--out docs/design/user-art/shinigami-base-clean/sheets]
  python3 scripts/rig/sheet.py unpack <몸>-sheet.png [--json <몸>-sheet.json]
"""
from __future__ import annotations

import argparse
import json
import os

import numpy as np
from PIL import Image, ImageDraw

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
ART = os.path.join(ROOT, 'public', 'art', 'rig', 'humanoid')
RIG = json.load(open(os.path.join(ROOT, 'src', 'data', 'art', 'rig', 'humanoid.json'), encoding='utf-8'))
PAD = 4
GAP = 2  # 여백 상자끼리 사이(투명)

SHEETS = {
    # 시트 이름 → [(부위 이름, 그림 키, 뼈)] — 공통 머리는 두 시트에 다 넣는다(어느 쪽에서 고쳐도 같은 파일)
    'shinigami': [('head', 'head_bald', 'head'), ('hair', 'shinigami/hair', 'head'), ('torso', 'shinigami/torso', 'torso'),
                  ('arm_L', 'shinigami/arm_L', 'arm_L'), ('arm_R', 'shinigami/arm_R', 'arm_R'),
                  ('leg_L', 'shinigami/leg_L', 'leg_L'), ('leg_R', 'shinigami/leg_R', 'leg_R')],
    'arrancar': [('head', 'head_bald', 'head'), ('hair', 'arrancar/hair', 'head'), ('mask', 'arrancar/mask', 'head'),
                 ('torso', 'arrancar/torso', 'torso'), ('arm_L', 'arrancar/arm_L', 'arm_L'), ('arm_R', 'arrancar/arm_R', 'arm_R'),
                 ('leg_L', 'arrancar/leg_L', 'leg_L'), ('leg_R', 'arrancar/leg_R', 'leg_R')],
}
PIVOT = {b['id']: b['pivot'] for b in RIG['bones']}


def pack(out_dir: str):
    os.makedirs(out_dir, exist_ok=True)
    W, H = RIG['canvas']
    for sheet, parts in SHEETS.items():
        boxes = []
        for name, key, bone in parts:
            a = np.array(Image.open(os.path.join(ART, key + '.png')).convert('RGBA'))
            ys, xs = np.nonzero(a[..., 3] > 0)
            x0, y0 = int(xs.min()) - PAD, int(ys.min()) - PAD
            x1, y1 = int(xs.max()) + 1 + PAD, int(ys.max()) + 1 + PAD
            # 캔버스 밖 여백도 시트에는 둔다(투명), 원래 캔버스 좌표 = (x0, y0)
            crop = np.zeros((y1 - y0, x1 - x0, 4), np.uint8)
            sx0, sy0 = max(0, x0), max(0, y0)
            sx1, sy1 = min(W, x1), min(H, y1)
            crop[sy0 - y0:sy1 - y0, sx0 - x0:sx1 - x0] = a[sy0:sy1, sx0:sx1]
            boxes.append({'name': name, 'art': key, 'bone': bone, 'canvas_xy': [x0, y0], 'img': crop})
        # 한 줄로 늘어놓기(키 큰 순서 그대로) — 몸통·다리는 길고 팔·머리는 짧다
        sw = sum(b['img'].shape[1] for b in boxes) + GAP * (len(boxes) - 1)
        sh = max(b['img'].shape[0] for b in boxes)
        sheet_img = np.zeros((sh, sw, 4), np.uint8)
        x = 0
        meta = {'note': '종이인형 부위 시트 (GDD 96장). 여백(pad) 안에 관절 겹침 여분을 그려도 된다. unpack 으로 되돌린다',
                'canvas': [W, H], 'pad': PAD, 'parts': []}
        for b in boxes:
            h, w = b['img'].shape[:2]
            sheet_img[0:h, x:x + w] = b['img']
            px, py = PIVOT[b['bone']]
            meta['parts'].append({'name': b['name'], 'art': b['art'], 'bone': b['bone'], 'sheet_xywh': [x, 0, w, h],
                                  'canvas_xy': b['canvas_xy'], 'pivot_in_box': [px - b['canvas_xy'][0], py - b['canvas_xy'][1]]})
            x += w + GAP
        Image.fromarray(sheet_img).save(os.path.join(out_dir, f'{sheet}-sheet.png'))
        json.dump(meta, open(os.path.join(out_dir, f'{sheet}-sheet.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
        # 확인용 8배: 상자 경계(점선 느낌의 회색), 관절점(빨간 점), 이름
        S = 8
        big = Image.new('RGBA', (sw * S, sh * S + 14), (120, 160, 120, 255))
        big.alpha_composite(Image.fromarray(sheet_img).resize((sw * S, sh * S), Image.NEAREST))
        d = ImageDraw.Draw(big)
        for p in meta['parts']:
            bx, by, bw, bh = p['sheet_xywh']
            d.rectangle([bx * S, by * S, (bx + bw) * S - 1, (by + bh) * S - 1], outline=(70, 90, 70, 255))
            d.rectangle([(bx + PAD) * S, (by + PAD) * S, (bx + bw - PAD) * S - 1, (by + bh - PAD) * S - 1], outline=(200, 200, 120, 255))
            cx, cy = bx + p['pivot_in_box'][0], by + p['pivot_in_box'][1]
            d.ellipse([cx * S - 4, cy * S - 4, cx * S + 4, cy * S + 4], fill=(230, 40, 40, 255))
            d.text((bx * S + 2, sh * S + 1), p['name'], fill=(0, 0, 0, 255))
        big.save(os.path.join(out_dir, f'{sheet}-sheet-x8.png'))
        print(f'{sheet}: {sw}×{sh} 시트, 부위 {len(boxes)}개 → {out_dir}')


def unpack(sheet_path: str, json_path: str | None):
    json_path = json_path or sheet_path.replace('.png', '.json')
    meta = json.load(open(json_path, encoding='utf-8'))
    W, H = meta['canvas']
    sheet = np.array(Image.open(sheet_path).convert('RGBA'))
    done = set()
    for p in meta['parts']:
        if p['art'] in done:
            continue  # 공통 머리가 두 시트에 있을 때 같은 시트 안에서 한 번만
        done.add(p['art'])
        bx, by, bw, bh = p['sheet_xywh']
        box = sheet[by:by + bh, bx:bx + bw]
        out = np.zeros((H, W, 4), np.uint8)
        cx, cy = p['canvas_xy']
        sx0, sy0 = max(0, cx), max(0, cy)
        sx1, sy1 = min(W, cx + bw), min(H, cy + bh)
        out[sy0:sy1, sx0:sx1] = box[sy0 - cy:sy1 - cy, sx0 - cx:sx1 - cx]
        lost = (box[..., 3] > 0).sum() - (out[..., 3] > 0).sum()
        Image.fromarray(out).save(os.path.join(ART, p['art'] + '.png'))
        print(f"{p['art']}: 되돌림{'' if lost <= 0 else f' (캔버스 밖 {lost}칸 잘림)'}")


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest='cmd', required=True)
    p = sub.add_parser('pack')
    p.add_argument('--out', default=os.path.join(ROOT, 'docs', 'design', 'user-art', 'shinigami-base-clean', 'sheets'))
    u = sub.add_parser('unpack')
    u.add_argument('sheet')
    u.add_argument('--json')
    a = ap.parse_args()
    if a.cmd == 'pack':
        pack(a.out)
    else:
        unpack(a.sheet, a.json)


if __name__ == '__main__':
    main()
