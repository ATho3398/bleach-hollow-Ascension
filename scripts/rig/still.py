#!/usr/bin/env python3
"""종이인형 정지 그림 (GDD 96장 30): 외형마다 쉬는 자세(모든 동작 각도 0, 쉬는 각도만)를 게임 그림 칸(view.rect)에 4배로 그린다.
게임에서 종이인형이 움직이기 전(부위 그림을 불러오는 동안)과, 움직이지 않는 곳(사진·목록 등)이 쓰는 한 장.
출력: public/art/rig/humanoid/still/<외형>.png

사용: python3 scripts/rig/still.py [외형 ...]   (없으면 전부)
"""
from __future__ import annotations

import json
import math
import os
import sys

import numpy as np
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
ART = os.path.join(ROOT, 'public', 'art', 'rig', 'humanoid')
RIG = json.load(open(os.path.join(ROOT, 'src', 'data', 'art', 'rig', 'humanoid.json'), encoding='utf-8'))
K = 4


def mul(m, n):
    return [m[0] * n[0] + m[2] * n[1], m[1] * n[0] + m[3] * n[1], m[0] * n[2] + m[2] * n[3], m[1] * n[2] + m[3] * n[3],
            m[0] * n[4] + m[2] * n[5] + m[4], m[1] * n[4] + m[3] * n[5] + m[5]]


def bone_mats(body=None):
    """쉬는 자세 뼈 행렬 (pose.ts boneMatrices 와 같은 식, 동작 각도 0, 몸별 관절 반영)"""
    j = (RIG.get('bodyJoints') or {}).get(body) if body else None
    j = j if isinstance(j, dict) else {}
    by = {b['id']: dict(b, pivot=(j.get('pivots') or {}).get(b['id'], b['pivot']),
                        restRot=b.get('restRot', 0) + (j.get('rot') or {}).get(b['id'], 0)) for b in RIG['bones']}
    out = {}

    def get(i):
        if i in out:
            return out[i]
        b = by[i]
        r = math.radians(b.get('restRot', 0))
        c, s = math.cos(r), math.sin(r)
        px, py = b['pivot']
        m = [c, s, -s, c, px - c * px + s * py, py - s * px - c * py]
        w = mul(get(b['parent']), m) if b['parent'] else m
        out[i] = w
        return w
    for b in by:
        get(b)
    return out


def layers(look_id):
    look = RIG['looks'][look_id]
    body = RIG['bodies'][look['body']]
    for s in RIG['slots']:
        part = body.get(s['id']) or (look.get(s['id']) if isinstance(look.get(s['id']), dict) else None)
        if part:
            yield s, part


def render(look_id):
    vx, vy, vw, vh = RIG['view']['rect']
    mats = bone_mats(RIG['looks'][look_id]['body'])
    out = Image.new('RGBA', (vw * K, vh * K), (0, 0, 0, 0))
    for s, part in layers(look_id):
        m = mul(mats[s['bone']], [1, 0, 0, 1, part['at'][0], part['at'][1]])
        # 출력 칸 (X, Y) → 세계 (X/K + vx, Y/K + vy) → 그림 좌표 = m⁻¹
        a, b, c, d, e, f = m
        det = a * d - b * c
        ia, ib, ic, id_ = d / det, -b / det, -c / det, a / det
        ie, if_ = -(ia * e + ic * f), -(ib * e + id_ * f)
        # 그림 x = ia*wx + ic*wy + ie, wx = X/K + vx
        co = (ia / K, ic / K, ia * vx + ic * vy + ie, ib / K, id_ / K, ib * vx + id_ * vy + if_)
        src = Image.open(os.path.join(ART, part['art'] + '.png')).convert('RGBA')
        layer = src.transform(out.size, Image.AFFINE, co, resample=Image.NEAREST)
        out.alpha_composite(layer)
    clip = RIG['view'].get('clipY')
    if clip is not None and (clip - vy) * K < out.size[1]:  # 바닥 밑은 안 그린다 (rigAnim 과 같게, C.190)
        out.paste((0, 0, 0, 0), (0, int((clip - vy) * K), out.size[0], out.size[1]))
    os.makedirs(os.path.join(ART, 'still'), exist_ok=True)
    out.save(os.path.join(ART, 'still', f'{look_id}.png'))
    print(f'{look_id}: {out.size[0]}×{out.size[1]}')


if __name__ == '__main__':
    for lid in (sys.argv[1:] or list(RIG['looks'])):
        render(lid)
