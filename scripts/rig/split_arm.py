#!/usr/bin/env python3
"""왼팔 자르기 (GDD 115-A 50, 사용자 2026-10-29 "왼팔도 자를거임" · "편집기에도 왼팔자른거 넣었음??"):
아래팔 그림이 없는 몸의 왼팔(arm_L) 한 장을 팔꿈치 줄(y)에서 위팔·아래팔(forearm_L)로 나눈다(작업본).
아래팔은 위로 OVERLAP 줄 겹쳐 잘라(굽힐 때 틈 가림) 위팔 위에 그린다. 팔꿈치 관절 = 그 줄에서 팔 그림 가운데 → 몸별 관절(bodyJoints).
사용: python3 scripts/rig/split_arm.py [팔꿈치 y=44]
"""
import json
import os
import sys

import numpy as np
from PIL import Image

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from paths import DRAFT_ART, DRAFT_RIG_JSON  # noqa: E402
from feet_weapon import dump  # noqa: E402

OVERLAP = 2


def main(elbow_y=44):
    rig = json.load(open(DRAFT_RIG_JSON, encoding='utf-8'))
    for bid, body in rig['bodies'].items():
        arm = body.get('arm_L')
        if not arm or 'forearm_L' in body or bid in (rig.get('skeletons') or {}):
            continue
        im = np.array(Image.open(os.path.join(DRAFT_ART, arm['art'] + '.png')).convert('RGBA'))
        ey = elbow_y - arm['at'][1]
        if not 2 < ey < im.shape[0] - 2:
            continue
        xs = np.nonzero(im[ey, :, 3])[0]
        cx = int(round((xs.min() + xs.max()) / 2)) + arm['at'][0] if len(xs) else arm['at'][0] + im.shape[1] // 2
        folder = os.path.dirname(arm['art'])
        up, low = im[:ey], im[ey - OVERLAP:]
        Image.fromarray(up).save(os.path.join(DRAFT_ART, arm['art'] + '.png'))
        Image.fromarray(low).save(os.path.join(DRAFT_ART, folder, 'forearm_L.png'))
        body['arm_L'] = {'art': arm['art'], 'at': arm['at'], 'size': [arm['size'][0], ey]}
        body['forearm_L'] = {'art': f'{folder}/forearm_L', 'at': [arm['at'][0], arm['at'][1] + ey - OVERLAP], 'size': [arm['size'][0], low.shape[0]]}
        bj = rig.setdefault('bodyJoints', {}).setdefault(bid, {})
        bj.setdefault('pivots', {})['forearm_L'] = [cx, elbow_y]
        print(bid, '왼팔 → 위팔', body['arm_L']['size'], '+ 아래팔', body['forearm_L']['size'], '팔꿈치', [cx, elbow_y])
    dump(rig)


if __name__ == '__main__':
    main(int(sys.argv[1]) if len(sys.argv) > 1 else 44)
