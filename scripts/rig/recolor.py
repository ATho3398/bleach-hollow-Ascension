#!/usr/bin/env python3
"""색 외형 그림 만들기 (GDD 115-A 85): 뼈대 데이터 recolors.<폴더> = {from: 원본 폴더, map: {원래 색: 새 색}} 대로
원본 폴더의 부위 그림마다 색만 바꿔 <폴더>/ 에 같은 이름으로 쓴다. 외형의 artFolder 가 이 폴더를 가리킨다(몸·관절·동작은 원본 몸 그대로).
덩치(hb) = 사용자 색 시트(2026-11-09 넷째 줄 5색) + 게임 적 덩치(<속성>-basic) 속성 색 — 도트 6색 중 몸 두 색(밝은·어두운)만 바뀐다.
원본 부위 그림을 고치면(가져오기·편집기 고정과 무관한 그림 교체) 다시 돌린다.
replace = {부위 이름: 그림 경로(저장소 기준)} 가 있으면 색을 바꾼 뒤 그 부위 그림만 통째로 바꿔 넣는다(길리안 외눈 가면 시험, GDD 115-A 101).
사용: python3 scripts/rig/recolor.py [humanoid]
"""
import json
import os
import shutil
import sys

import numpy as np
from PIL import Image

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from paths import DRAFT_DIR, ROOT  # noqa: E402


def hexrgb(h):
    h = h.lstrip('#')
    return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))


def main(rig_id='humanoid'):
    rig = json.load(open(os.path.join(DRAFT_DIR, f'{rig_id}.json'), encoding='utf-8'))
    art = os.path.join(DRAFT_DIR, rig_id)
    for folder, spec in (rig.get('recolors') or {}).items():
        if folder == 'note':
            continue
        src_dir, out_dir = os.path.join(art, spec['from']), os.path.join(art, folder)
        if os.path.isdir(out_dir):
            shutil.rmtree(out_dir)
        os.makedirs(out_dir)
        pairs = [(hexrgb(a), hexrgb(b)) for a, b in spec['map'].items()]
        n = 0
        for f in sorted(os.listdir(src_dir)):
            if not f.endswith('.png'):
                continue
            a = np.array(Image.open(os.path.join(src_dir, f)).convert('RGBA'))
            out = a.copy()
            for c0, c1 in pairs:
                m = (a[..., 3] > 0) & np.all(a[..., :3] == c0, axis=-1)
                out[m, :3] = c1
            Image.fromarray(out).save(os.path.join(out_dir, f))
            n += 1
        for part, src in (spec.get('replace') or {}).items():
            shutil.copyfile(os.path.join(ROOT, src), os.path.join(out_dir, f'{part}.png'))
        print(f'{folder} ← {spec["from"]} ({n}장, 색 {len(pairs)}개{", 바꿔 넣기 " + ",".join(spec["replace"]) if spec.get("replace") else ""})')


if __name__ == '__main__':
    main(*sys.argv[1:])
