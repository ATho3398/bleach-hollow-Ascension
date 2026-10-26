#!/usr/bin/env python3
"""공통 대머리 머리(rig/head_bald.png) 위에 얹을 머리카락·가면 층을 기본형마다 만든다 (GDD 96장).

층 = 원본 머리 칸 중 대머리와 다른 칸 전부(외곽선 포함). 그래서 대머리 + 층 = 원본 머리와 한 칸도 안 다르다.
아란칼은 그중 가면 색(흰·회색)이면서 머리 오른쪽(x≥17)인 칸을 가면 층으로 따로 뺀다.
대머리의 목(y≥30)은 몸통 몫이라 지운다.
사용: python3 -I docs/design/user-art/shinigami-base-clean/head_layers.py
"""
import os
import numpy as np
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
R = os.path.join(HERE, 'rig')
MASK_COLORS = [(0xFC, 0xF0, 0xEC), (0xB8, 0xAE, 0xBD), (0x5F, 0x54, 0x63), (0xF9, 0xF1, 0xED)]

bald = np.array(Image.open(os.path.join(R, 'head_bald.png')).convert('RGBA'))
bald[30:] = 0
Image.fromarray(bald).save(os.path.join(R, 'head_bald.png'))
for name, has_mask in (('shinigami-base', False), ('arrancar-base', True)):
    head = np.array(Image.open(os.path.join(R, name, 'head.png')).convert('RGBA'))
    op = head[..., 3] > 0
    layer = op & ((bald[..., 3] == 0) | (head != bald).any(-1))
    xx = np.mgrid[0:head.shape[0], 0:head.shape[1]][1]
    mask = np.zeros(op.shape, bool)
    if has_mask:
        for c in MASK_COLORS:
            mask |= np.all(head[..., :3] == c, -1)
        mask &= layer & (xx >= 17)
    hair = layer & ~mask
    for fname, m in (('hair.png', hair), ('mask.png', mask)):
        out = np.zeros_like(head)
        out[m] = head[m]
        if fname == 'mask.png' and not has_mask:
            continue
        Image.fromarray(out).save(os.path.join(R, name, fname))
    comp = Image.fromarray(bald.copy())
    comp.alpha_composite(Image.open(os.path.join(R, name, 'hair.png')))
    if has_mask:
        comp.alpha_composite(Image.open(os.path.join(R, name, 'mask.png')))
    same = np.array_equal(np.array(comp)[op], head[op]) and not (np.array(comp)[..., 3][~op] > 0).any()
    print(name, '대머리+층 = 원본 머리:', same, '| 머리카락', int(hair.sum()), '가면', int(mask.sum()))
