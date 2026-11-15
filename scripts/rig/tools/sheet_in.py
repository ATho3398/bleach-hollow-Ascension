#!/usr/bin/env python3
"""편집기에서 받은 시트(bone_guide.py 1배 guide.png)를 사용자가 고쳐 보낸 것 → 작업본 부위 그림으로 (GDD 115-A 130·131).
칸 자리 = 그 시트를 받았을 때의 guide.json(지금 작업본과 칸 배치가 다르면 그때 커밋에서 bone_guide.py 로 다시 뽑아 넘긴다).
칸마다: 불투명 칸만 읽어 지금 부위 그림과 다르면 바꿈(자리·크기 = 그림 둘레), 칸이 비었으면 그 부위를 뺌(슬롯·안 쓰는 뼈·흔들림·편집기 묶음).
JSON 을 json.dumps(indent=1) 로 쓰는 뼈대(aizen·ichigo·mugetsu) 전용 — humanoid 는 쓰지 말 것.
사용: python3 scripts/rig/tools/sheet_in.py <뼈대 id> <시트.png> <guide.json>
"""
import json
import os
import sys

import numpy as np
from PIL import Image

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from paths import DRAFT_DIR  # noqa: E402


def main(rid, sheet, guide):
    P = os.path.join(DRAFT_DIR, rid + '.json')
    txt = open(P, encoding='utf-8').read()
    rig = json.loads(txt)
    assert json.dumps(rig, ensure_ascii=False, indent=1) + '\n' == txt, '이 뼈대 파일은 형식이 달라 못 씀'
    g = json.load(open(guide, encoding='utf-8'))
    parts = rig['bodies'][g['body']]
    new = np.array(Image.open(sheet).convert('RGBA'))
    gone = []
    for b in g['boxes']:
        s = b['slot']
        if s not in parts:
            continue
        (sx, sy), (w, h) = b['sheet'], b['size']
        n = new[sy:sy + h, sx:sx + w].copy()
        n[n[..., 3] < 255] = 0
        p = parts[s]
        f = os.path.join(DRAFT_DIR, rid, p['art'] + '.png')
        if not n[..., 3].any():
            gone.append(s)
            os.remove(f)
            print(s, '지움')
            continue
        ys, xs = np.nonzero(n[..., 3])
        x0, y0, x1, y1 = xs.min(), ys.min(), xs.max() + 1, ys.max() + 1
        art = n[y0:y1, x0:x1]
        at, size = [b['canvas'][0] + int(x0), b['canvas'][1] + int(y0)], [int(x1 - x0), int(y1 - y0)]
        old = np.array(Image.open(f).convert('RGBA'))
        if at == p['at'] and old.shape == art.shape and (old == art).all():
            continue
        Image.fromarray(art).save(f)
        print(s, '바꿈', p['at'], p['size'], '→', at, size)
        p['at'], p['size'] = at, size
    for s in gone:
        del parts[s]
        rig['slots'] = [x for x in rig['slots'] if x['id'] != s]
        rig['bodySlots'][g['body']].remove(s)
        rig['skeletons'][g['body']].pop(s, None)
        rig['edit']['groups'] = [[n_, [x for x in ids if x != s]] for n_, ids in rig['edit']['groups']]
        rig['edit']['follow'] = {k: [x for x in v if x != s] for k, v in rig['edit']['follow'].items() if k != s}
    for s in gone:  # 슬롯도 자식 뼈도 없는 뼈는 뺌
        if any(x['id'] == s for x in rig['bones']) and not any(x['bone'] == s for x in rig['slots']) and not any(x['parent'] == s for x in rig['bones']):
            rig['bones'] = [x for x in rig['bones'] if x['id'] != s]
            rig['sway'].pop(s, None)
            rig['edit']['names'].pop(s, None)
        elif not any(x['id'] == s for x in rig['bones']):
            rig['edit']['names'].pop(s, None)
        else:
            print('뼈 남김', s)
    ids = {x['id'] for x in rig['bones']}
    for bj in (rig.get('bodyJoints') or {}).values():  # 없어진 뼈의 몸별 관절 값
        for v in bj.values():
            if isinstance(v, dict):
                for s in [x for x in v if x not in ids]:
                    del v[s]
    rig['edit']['groups'] = [x for x in rig['edit']['groups'] if x[1]]
    open(P, 'w', encoding='utf-8').write(json.dumps(rig, ensure_ascii=False, indent=1) + '\n')
    return gone


if __name__ == '__main__':
    print('뺀 부위', main(*sys.argv[1:4]))
