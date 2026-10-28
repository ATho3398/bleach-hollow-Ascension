#!/usr/bin/env python3
"""같은 그림 나눠 쓰기 (GDD 96장): 몸 <body> 의 부위·외형 층 중 기준 몸 <ref> 과 픽셀·자리가 똑같은 것은 기준 그림을 가리키게 하고 중복 파일을 지운다.
(import_cut.py 는 늘 <몸>/<부위>.png 로 쓰므로, 안 고친 부위가 따로 복사되는 것을 정리)

사용: python3 scripts/rig/dedupe.py <body> <ref>
"""
import json
import os
import sys

import numpy as np
from PIL import Image

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from feet_weapon import RIG_JSON, dump  # noqa: E402

from paths import DRAFT_ART  # noqa: E402
ART = DRAFT_ART


def same(p, q):
    a = np.array(Image.open(os.path.join(ART, p + '.png')).convert('RGBA'))
    o = np.array(Image.open(os.path.join(ART, q + '.png')).convert('RGBA'))
    return a.shape == o.shape and bool((a == o).all())


def main():
    body, ref = sys.argv[1], sys.argv[2]
    rig = json.load(open(RIG_JSON, encoding='utf-8'))
    pairs = [(rig['bodies'][body], rig['bodies'][ref])]
    lk = next((l for l in rig['looks'].values() if l['body'] == body), None)
    rl = next((l for l in rig['looks'].values() if l['body'] == ref), None)
    if lk and rl:
        pairs.append((lk, rl))
    for mine, theirs in pairs:
        for k, v in mine.items():
            t = theirs.get(k)
            if not isinstance(v, dict) or not isinstance(t, dict) or v['art'] == t['art'] or not v['art'].startswith(body + '/'):
                continue
            if same(v['art'], t['art']):
                os.remove(os.path.join(ART, v['art'] + '.png'))
                print(f'{k}: {v["art"]} → {t["art"]}')
                v['art'] = t['art']
    dump(rig)


if __name__ == '__main__':
    main()
