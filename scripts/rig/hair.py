#!/usr/bin/env python3
"""머리카락 틀 (GDD 96장 7) — 틀 그림 만들기 / 그린 머리카락 넣기.

template : 틀 크기(hairFrame.rect, 지금 36×32) 그림 두 장을 만든다.
           hair-frame-base.png  1배, 공통 대머리가 제자리에 그려져 있음 → 이 위에(가능하면 다른 층에) 머리카락을 그린다
           hair-frame-guide-x12.png  확인용(12배): 파란 테두리 = 틀, 빨간 상자 = 얼굴(가리지 않기 권장), 흐린 대머리
import   : 틀 크기로 그린 머리카락 그림을 외형의 머리카락 층으로 넣는다.
           틀 밖 칸은 버리고, 대머리와 같은 칸(그대로 둔 머리)은 빼고, 얼굴 칸을 가리면 경고만 한다.
           → public/art/rig/humanoid/hair/<외형>.png + humanoid.json looks.<외형>.hair

사용:
  python3 scripts/rig/hair.py template [--out docs/design/user-art/shinigami-base-clean/hair-frame]
  python3 scripts/rig/hair.py import <그린 그림.png> --look <외형 id> --body <shinigami|arrancar>
"""
from __future__ import annotations

import argparse
import json
import os
import re

import numpy as np
from PIL import Image, ImageDraw

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
ART = os.path.join(ROOT, 'public', 'art', 'rig', 'humanoid')
RIG_JSON = os.path.join(ROOT, 'src', 'data', 'art', 'rig', 'humanoid.json')


def load_rig():
    return json.load(open(RIG_JSON, encoding='utf-8'))


def save_rig(rig):
    s = json.dumps(rig, ensure_ascii=False, indent=2)
    s = re.sub(r'\[\s+(-?\d+),\s+(-?\d+)\s+\]', r'[\1, \2]', s)
    s = re.sub(r'\[\s+(-?\d+),\s+(-?\d+),\s+(-?\d+),\s+(-?\d+)\s+\]', r'[\1, \2, \3, \4]', s)
    s = re.sub(r'\{\s+"id": "([^"]+)",\s+"bone": "([^"]+)"\s+\}', r'{ "id": "\1", "bone": "\2" }', s)
    s = re.sub(r'\{\s+"id": "([^"]+)",\s+"parent": ([^,]+),\s+"pivot": (\[[^\]]+\])\s+\}', r'{ "id": "\1", "parent": \2, "pivot": \3 }', s)
    s = re.sub(r'\{\s+"art": "([^"]+)",\s+"at": (\[[^\]]+\]),\s+"size": (\[[^\]]+\])\s+\}', r'{ "art": "\1", "at": \2, "size": \3 }', s)
    open(RIG_JSON, 'w', encoding='utf-8').write(s + '\n')


def head_in_frame(rig, body='arrancar'):
    fx, fy, fw, fh = rig['hairFrame']['rect']
    h = rig['bodies'][body]['head']
    a = np.array(Image.open(os.path.join(ART, h['art'] + '.png')).convert('RGBA'))
    c = np.zeros((fh, fw, 4), np.uint8)
    x, y = h['at'][0] - fx, h['at'][1] - fy
    c[y:y + a.shape[0], x:x + a.shape[1]] = a
    return c


def template(out):
    rig = load_rig()
    os.makedirs(out, exist_ok=True)
    fx, fy, fw, fh = rig['hairFrame']['rect']
    kx, ky, kw, kh = rig['hairFrame']['keepOut']
    head = head_in_frame(rig)
    Image.fromarray(head).save(os.path.join(out, 'hair-frame-base.png'))
    S = 12
    g = Image.new('RGBA', (fw * S, fh * S), (120, 160, 120, 255))
    faint = head.copy()
    faint[..., 3] = (faint[..., 3] > 0) * 150
    g.alpha_composite(Image.fromarray(faint).resize((fw * S, fh * S), Image.NEAREST))
    d = ImageDraw.Draw(g)
    for v in range(fw + 1):
        d.line([(v * S, 0), (v * S, fh * S)], fill=(0, 0, 0, 30))
    for v in range(fh + 1):
        d.line([(0, v * S), (fw * S, v * S)], fill=(0, 0, 0, 30))
    d.rectangle([(kx - fx) * S, (ky - fy) * S, (kx - fx + kw) * S - 1, (ky - fy + kh) * S - 1], outline=(220, 50, 50, 255), width=2)
    d.rectangle([0, 0, fw * S - 1, fh * S - 1], outline=(40, 40, 160, 255), width=3)
    g.save(os.path.join(out, 'hair-frame-guide-x12.png'))
    print(f'틀 {fw}×{fh}, 얼굴 칸 ({kx},{ky}) {kw}×{kh} → {out}')


def do_import(path, look_id, body):
    rig = load_rig()
    fx, fy, fw, fh = rig['hairFrame']['rect']
    kx, ky, kw, kh = rig['hairFrame']['keepOut']
    a = np.array(Image.open(path).convert('RGBA'))
    if a.shape[:2] == (rig['canvas'][1], rig['canvas'][0]):
        a = a[fy:fy + fh, fx:fx + fw]  # 37×81 전체 캔버스로 그렸으면 틀만큼 잘라 쓴다
    if a.shape[:2] != (fh, fw):
        raise SystemExit(f'그림 크기 {a.shape[1]}×{a.shape[0]} — 틀 크기 {fw}×{fh} 또는 캔버스 {rig["canvas"]} 로 그려야 한다')
    head = head_in_frame(rig, body)
    op = a[..., 3] > 0
    same_as_head = op & (head[..., 3] > 0) & np.all(a == head, -1)
    hair = op & ~same_as_head
    keep = np.zeros_like(hair)
    keep[ky - fy:ky - fy + kh, kx - fx:kx - fx + kw] = True
    if (hair & keep).any():
        print(f'경고: 얼굴 칸을 {int((hair & keep).sum())}칸 가린다(그대로 넣음)')
    ys, xs = np.nonzero(hair)
    if not len(ys):
        raise SystemExit('머리카락 칸이 없다')
    out = np.zeros_like(a)
    out[hair] = a[hair]
    crop = out[ys.min():ys.max() + 1, xs.min():xs.max() + 1]
    os.makedirs(os.path.join(ART, 'hair'), exist_ok=True)
    key = f'hair/{look_id}'
    Image.fromarray(crop).save(os.path.join(ART, key + '.png'))
    look = rig['looks'].setdefault(look_id, {'body': body})
    look['body'] = body
    look['hair'] = {'art': key, 'at': [int(xs.min()) + fx, int(ys.min()) + fy], 'size': [int(crop.shape[1]), int(crop.shape[0])]}
    save_rig(rig)
    print(f'{look_id}: 머리카락 {int(hair.sum())}칸 → {key}.png, 자리 {look["hair"]["at"]}')


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest='cmd', required=True)
    t = sub.add_parser('template')
    t.add_argument('--out', default=os.path.join(ROOT, 'docs', 'design', 'user-art', 'shinigami-base-clean', 'hair-frame'))
    i = sub.add_parser('import')
    i.add_argument('image')
    i.add_argument('--look', required=True)
    i.add_argument('--body', required=True)
    a = ap.parse_args()
    if a.cmd == 'template':
        template(a.out)
    else:
        do_import(a.image, a.look, a.body)


if __name__ == '__main__':
    main()
