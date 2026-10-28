#!/usr/bin/env python3
"""게임 넣기 (GDD 96장 36): 작업본(고정한 값·새 그림·동작)을 게임본으로 통째로 옮긴다. 사용자가 "게임 넣어"라고 할 때만.

옮기는 것: docs/design/rig-draft/humanoid.json·motions.json → src/data/art/rig/, docs/design/rig-draft/humanoid/ → public/art/rig/humanoid/
(게임본에만 있는 그림은 지운다, still/ 은 남김). 그 뒤 정지 그림(still.py)·고정 파일(lock.py)을 게임본으로 다시 만든다.
사용: python3 scripts/rig/promote.py [--dry]   (--dry = 바뀌는 것만 보여 주기)
"""
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


def main():
    dry = '--dry' in sys.argv
    changes = []
    for src, dst in ((DRAFT_RIG_JSON, GAME_RIG_JSON), (DRAFT_MOTIONS, GAME_MOTIONS)):
        if not filecmp.cmp(src, dst, shallow=False):
            changes.append(f'데이터 {os.path.basename(dst)}')
            if not dry:
                shutil.copyfile(src, dst)
    d, g = files(DRAFT_ART), files(GAME_ART)
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
