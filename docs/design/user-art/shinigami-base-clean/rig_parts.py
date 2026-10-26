#!/usr/bin/env python3
"""사신·아란칼 기본형 → 부위 분해(리깅용 파츠) + 머리카락 없는 머리.

사용: python3 -I docs/design/user-art/shinigami-base-clean/rig_parts.py
출력: docs/design/user-art/shinigami-base-clean/rig/<기본형>/
  head.png torso.png arm_L.png arm_R.png leg_L.png leg_R.png  — 모두 원본과 같은 37×81 캔버스(좌표 그대로)
  head_bald.png  머리카락(아란칼은 가면도) 뺀 기본 머리 — 정수리 모양은 임시로 그린 것, 손질 필요
  hair.png (아란칼은 mask.png 도)  — 머리에서 뺀 머리카락·가면 층
  rig.json  관절점·앞뒤 순서 / check_x6.png  분해 확인용(벌려 놓은 그림 + 다시 합친 그림)
L·R 은 화면 기준(왼쪽·오른쪽). 캐릭터는 왼쪽을 본다.

가려진 곳 메우기: 부위가 움직이면 드러나는 자리(손이 가린 배, 몸통에 묻힌 어깨·엉덩이)는
옆 칸 색을 끌어와 임시로 칠해 둔다(뒤에 있는 층에만, 원래 자세에서는 앞 층에 가려 안 보임).
"""
from __future__ import annotations

import json
import os

import numpy as np
from PIL import Image, ImageDraw

HERE = os.path.dirname(os.path.abspath(__file__))
OUTLINE = (0x0E, 0x0A, 0x10)

# 기본형마다 부위 경계 (픽셀 좌표, 다각형 안 = 그 부위). 먼저 적힌 부위가 우선
CFG = {
    'shinigami-base': {
        'skin': (0xFF, 0xC9, 0xA2), 'skin_sh': (0xD5, 0x8C, 0x6F),
        'hair': [(0x33, 0x2D, 0x39), (0x49, 0x41, 0x4D)],
        'mask': [],
        'parts': {
            'head': [(0, 0), (37, 0), (37, 30), (0, 30)],
            'arm_R': [(25, 34), (37, 38), (37, 57), (30, 57), (27, 54), (19, 54), (19, 43), (24, 40)],
            'arm_L': [(0, 35), (10, 34), (11, 61), (0, 61)],
            'leg_L': [(0, 57), (17, 57), (17, 81), (0, 81)],
            'leg_R': [(17, 57), (37, 57), (37, 81), (17, 81)],
        },
    },
    'arrancar-base': {
        'skin': (0xFF, 0xC9, 0xA2), 'skin_sh': (0xD5, 0x8C, 0x6F),
        'hair': [(0xD7, 0xCD, 0xDA), (0x8F, 0x81, 0x93)],
        'mask': [(0xFC, 0xF0, 0xEC), (0xB8, 0xAE, 0xBD), (0x5F, 0x54, 0x63), (0xF9, 0xF1, 0xED)],
        'parts': {
            'head': [(0, 0), (37, 0), (37, 30), (0, 30)],
            'arm_R': [(25, 36), (37, 40), (37, 56), (30, 56), (28, 55), (20, 55), (20, 45), (24, 42)],
            'arm_L': [(0, 38), (10, 36), (11, 61), (0, 61)],
            'leg_L': [(0, 57), (16, 57), (16, 81), (0, 81)],
            'leg_R': [(16, 57), (37, 57), (37, 81), (16, 81)],
        },
    },
}
PIVOTS = {  # 관절 = 이 점을 중심으로 돈다
    'head': (17, 29), 'arm_L': (8, 38), 'arm_R': (28, 39), 'leg_L': (10, 57), 'leg_R': (24, 57), 'torso': (17, 56),
}
Z = ['leg_R', 'leg_L', 'torso', 'arm_L', 'arm_R', 'head']  # 뒤 → 앞


def poly_mask(poly, w, h):
    m = Image.new('L', (w, h), 0)
    ImageDraw.Draw(m).polygon(poly, fill=255)
    return np.array(m) > 0


def grow_fill(layer: np.ndarray, allowed: np.ndarray, steps: int) -> None:
    """layer 의 불투명 칸에서 allowed 칸으로 옆 색을 steps 칸까지 끌어와 칠한다(가로 우선)."""
    for _ in range(steps):
        filled = layer[..., 3] > 0
        new = np.zeros_like(layer)
        got = np.zeros(filled.shape, bool)
        for dy, dx in ((0, 1), (0, -1), (1, 0), (-1, 0)):
            src = np.roll(np.roll(layer, dy, 0), dx, 1)
            sf = np.roll(np.roll(filled, dy, 0), dx, 1)
            take = sf & ~filled & ~got & allowed
            new[take] = src[take]
            got |= take
        if not got.any():
            break
        layer[got] = new[got]


def bald_head(head: np.ndarray, cfg) -> tuple[np.ndarray, np.ndarray]:
    """머리 층에서 머리카락(·가면) 빼고, 얼굴은 남기고, 정수리를 피부색 둥근 모양으로 임시로 그린다."""
    h, w = head.shape[:2]
    rgb = head[..., :3]
    op = head[..., 3] > 0
    hair = np.zeros((h, w), bool)
    for c in cfg['hair'] + cfg['mask']:
        hair |= np.all(rgb == c, -1) & op
    skin = (np.all(rgb == cfg['skin'], -1) | np.all(rgb == cfg['skin_sh'], -1)) & op
    ys, xs = np.nonzero(skin)
    # 얼굴 = 피부 + 피부에 둘러싸인 눈·입(피부 상자 안의 머리카락 아닌 칸)
    y0, y1, x0, x1 = ys.min(), ys.max(), xs.min(), xs.max()
    # 얼굴 = 피부 + 눈 줄 아래의 머리카락 아닌 칸(눈·눈썹·입 선). 눈 줄 위(이마)의 검은 칸은 앞머리라 뺀다
    eye_rows = np.nonzero((~np.isin(rgb.reshape(-1, 3).view([('', rgb.dtype)] * 3).ravel(),
                                     np.array([tuple(cfg['skin']), tuple(cfg['skin_sh']), OUTLINE] + [tuple(c) for c in cfg['hair'] + cfg['mask']],
                                              dtype=rgb.dtype).view([('', rgb.dtype)] * 3).ravel())).reshape(h, w) & op
                          & (np.arange(h)[:, None] >= y0) & (np.arange(w)[None] >= x0) & (np.arange(w)[None] <= x1))[0]
    brow = (eye_rows.min() - 2) if len(eye_rows) else y0 + 4
    box = np.zeros((h, w), bool)
    box[brow:y1 + 1, x0:x1 + 1] = True
    face = skin | (box & op & ~hair)
    # 정수리: 얼굴 위로 둥근 머리통(얼굴 폭에 맞춘 타원)
    cx, rx = (x0 + x1) / 2, (x1 - x0) / 2 + 1.5
    cy, ry = y0 + 1, (y1 - y0) * 0.72
    yy, xx = np.mgrid[0:h, 0:w]
    skull = (((xx - cx) / rx) ** 2 + ((yy - cy) / ry) ** 2 <= 1) & (yy <= y0 + 5)
    body = face | skull
    out = np.zeros_like(head)
    out[skull] = (*cfg['skin'], 255)
    out[skull & (xx > cx + rx * 0.45)] = (*cfg['skin_sh'], 255)  # 오른쪽(뒤통수 쪽) 그림자 1톤
    out[face] = head[face]
    # 외곽선 1칸
    edge = np.zeros((h, w), bool)
    for dy, dx in ((0, 1), (0, -1), (1, 0), (-1, 0)):
        edge |= np.roll(np.roll(body, dy, 0), dx, 1)
    edge &= ~body
    out[edge] = (*OUTLINE, 255)
    return out, hair


def main():
    for name, cfg in CFG.items():
        src = np.array(Image.open(os.path.join(HERE, f'{name}.png')).convert('RGBA'))
        h, w = src.shape[:2]
        op = src[..., 3] > 0
        taken = np.zeros((h, w), bool)
        masks = {}
        for part, poly in cfg['parts'].items():
            m = poly_mask(poly, w, h) & op & ~taken
            masks[part] = m
            taken |= m
        masks['torso'] = op & ~taken
        layers = {}
        for part, m in masks.items():
            L = np.zeros_like(src)
            L[m] = src[m]
            layers[part] = L
        # 가려진 곳 메우기: 몸통은 팔이 덮던 자리, 다리는 엉덩이 위 4줄, 팔은 어깨 쪽 3칸(뒤 층에만 칠해짐)
        grow_fill(layers['torso'], masks['arm_R'] | masks['arm_L'] | masks['head'] & (np.mgrid[0:h, 0:w][0] >= 26), 12)
        hip = np.zeros((h, w), bool)
        hip[52:57] = True
        for leg in ('leg_L', 'leg_R'):
            col = np.zeros((h, w), bool)
            xs = np.nonzero(masks[leg].any(0))[0]
            col[:, xs.min():xs.max() + 1] = True
            grow_fill(layers[leg], hip & col & op, 5)
        bald, hairmask = bald_head(layers['head'], cfg)
        out = os.path.join(HERE, 'rig', name)
        os.makedirs(out, exist_ok=True)
        for part, L in layers.items():
            Image.fromarray(L).save(os.path.join(out, f'{part}.png'))
        Image.fromarray(bald).save(os.path.join(out, 'head_bald.png'))
        hair_l = np.zeros_like(src)
        hair_rgb = layers['head'][..., :3]
        hm = np.zeros((h, w), bool)
        for c in cfg['hair']:
            hm |= np.all(hair_rgb == c, -1)
        hair_l[hm] = layers['head'][hm]
        Image.fromarray(hair_l).save(os.path.join(out, 'hair.png'))
        if cfg['mask']:
            mm = np.zeros((h, w), bool)
            for c in cfg['mask']:
                mm |= np.all(hair_rgb == c, -1)
            mm &= np.mgrid[0:h, 0:w][1] >= 17  # 가면은 머리 오른쪽(화면 기준)
            mask_l = np.zeros_like(src)
            mask_l[mm] = layers['head'][mm]
            Image.fromarray(mask_l).save(os.path.join(out, 'mask.png'))
        json.dump({'canvas': [w, h], 'ground_y': h - 1, 'pivots': PIVOTS, 'z_back_to_front': Z,
                   'parts': {p: 'full-canvas PNG, 원본 좌표 그대로' for p in layers}},
                  open(os.path.join(out, 'rig.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
        # 확인 그림: 다시 합친 것(원본과 같아야 함) + 부위 벌려 놓은 것 + 대머리 머리
        comp = Image.new('RGBA', (w, h), (0, 0, 0, 0))
        for p in Z:
            comp.alpha_composite(Image.fromarray(layers[p]))
        same = np.array_equal(np.array(comp), src)
        gap = {'head': (0, -6), 'arm_L': (-6, 0), 'arm_R': (6, 0), 'leg_L': (-3, 6), 'leg_R': (3, 6), 'torso': (0, 0)}
        ex = Image.new('RGBA', (w + 16, h + 16), (0, 0, 0, 0))
        for p in Z:
            dx, dy = gap[p]
            ex.alpha_composite(Image.fromarray(layers[p]), (8 + dx, 8 + dy))
        sheet = Image.new('RGBA', (w * 3 + 16 + 20, h + 16), (120, 160, 120, 255))
        sheet.alpha_composite(comp, (0, 8))
        sheet.alpha_composite(ex, (w + 6, 0))
        sheet.alpha_composite(Image.fromarray(bald), (w * 2 + 16 + 14, 8))
        sheet.resize((sheet.width * 6, sheet.height * 6), Image.NEAREST).save(os.path.join(out, 'check_x6.png'))
        print(f'{name}: 부위 {len(layers)}개, 다시 합치면 원본과 {"같음" if same else "다름"}')


if __name__ == '__main__':
    main()
