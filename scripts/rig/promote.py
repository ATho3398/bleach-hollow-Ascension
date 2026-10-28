#!/usr/bin/env python3
"""게임 넣기 (GDD 96장 36): 작업본(고정한 값·새 그림·동작)을 게임본으로 통째로 옮긴다. 사용자가 "게임 넣어"라고 할 때만.

옮기는 것: docs/design/rig-draft/humanoid.json·motions.json → src/data/art/rig/, docs/design/rig-draft/humanoid/ → public/art/rig/humanoid/
(게임본에만 있는 그림은 지운다, still/ 은 남김). 그 뒤 정지 그림(still.py)·고정 파일(lock.py)을 게임본으로 다시 만든다.
시험 외형(id 가 -test 로 끝남 — 역관절·망토 임시 그림, GDD 96장 39·40)은 게임에 안 넣는다: 그 외형만 쓰는 몸·그림도 빠진다.
짐승형(beast.json)은 아직 게임이 안 쓰므로 옮기지 않는다.
사용: python3 scripts/rig/promote.py [--dry]   (--dry = 바뀌는 것만 보여 주기)
"""
import json
import filecmp
import os
import shutil
import subprocess
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from paths import DRAFT_ART, DRAFT_MOTIONS, DRAFT_RIG_JSON, GAME_ART, GAME_MOTIONS, GAME_RIG_JSON  # noqa: E402


def files(root):
    out = set()
    for d, _, fs in os.walk(root):
        rel = os.path.relpath(d, root)
        if rel.split(os.sep)[0] == 'still':
            continue
        for f in fs:
            out.add(os.path.normpath(os.path.join(rel, f)))
    return out


def game_rig():
    """작업본 뼈대에서 시험 외형과 그것만 쓰는 몸을 뺀 것 + 남은 외형이 쓰는 그림 목록"""
    rig = json.load(open(DRAFT_RIG_JSON, encoding='utf-8'))
    rig['looks'] = {k: v for k, v in rig['looks'].items() if not k.endswith('-test')}
    used = {lk['body'] for lk in rig['looks'].values()}
    rig['bodies'] = {k: v for k, v in rig['bodies'].items() if k in used}
    for key in ('bodyJoints', 'bodyMotions'):
        if key in rig:
            rig[key] = {k: v for k, v in rig[key].items() if k == 'note' or k in used}
    arts = {p['art'] for b in rig['bodies'].values() for p in b.values()}
    arts |= {v['art'] for lk in rig['looks'].values() for v in lk.values() if isinstance(v, dict)}
    return rig, {os.path.normpath(a + '.png') for a in arts}


def main():
    dry = '--dry' in sys.argv
    changes = []
    from feet_weapon import dump
    rig, arts = game_rig()
    tmp = GAME_RIG_JSON + '.new'
    dump(rig, tmp)
    if not filecmp.cmp(tmp, GAME_RIG_JSON, shallow=False):
        changes.append(f'데이터 {os.path.basename(GAME_RIG_JSON)}')
        if not dry:
            os.replace(tmp, GAME_RIG_JSON)
    if os.path.exists(tmp):
        os.remove(tmp)
    if not filecmp.cmp(DRAFT_MOTIONS, GAME_MOTIONS, shallow=False):
        changes.append(f'데이터 {os.path.basename(GAME_MOTIONS)}')
        if not dry:
            shutil.copyfile(DRAFT_MOTIONS, GAME_MOTIONS)
    d, g = files(DRAFT_ART) & arts, files(GAME_ART)
    for f in sorted(d):
        s, t = os.path.join(DRAFT_ART, f), os.path.join(GAME_ART, f)
        if f not in g or not filecmp.cmp(s, t, shallow=False):
            changes.append(f'그림 {f}')
            if not dry:
                os.makedirs(os.path.dirname(t), exist_ok=True)
                shutil.copyfile(s, t)
    for f in sorted(g - d):
        changes.append(f'그림 지움 {f}')
        if not dry:
            os.remove(os.path.join(GAME_ART, f))
    print('\n'.join(changes) or '바뀐 것 없음')
    if not dry and changes:
        here = os.path.dirname(os.path.abspath(__file__))
        subprocess.run([sys.executable, os.path.join(here, 'still.py')], check=True)
        subprocess.run([sys.executable, os.path.join(here, 'lock.py')], check=True)


if __name__ == '__main__':
    main()
