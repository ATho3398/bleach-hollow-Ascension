#!/usr/bin/env python3
"""게임 넣기 (GDD 96장 36): 작업본(고정한 값·새 그림·동작)을 게임본으로 통째로 옮긴다. 사용자가 "게임 넣어"라고 할 때만.

옮기는 것: docs/design/rig-draft/humanoid.json·motions.json → src/data/art/rig/, docs/design/rig-draft/humanoid/ → public/art/rig/humanoid/
(게임본에만 있는 그림은 지운다, still/ 은 남김). 뱀형도 같게(serpent.json·serpent-motions.json·serpent/, GDD 115-A 100 — paths.GAME_RIGS).
그 뒤 정지 그림(still.py)·고정 파일(lock.py)을 게임본으로 다시 만든다.
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
from paths import GAME_RIGS, look_art, rig_paths  # noqa: E402


def files(root):
    out = set()
    for d, _, fs in os.walk(root):
        rel = os.path.relpath(d, root)
        if rel.split(os.sep)[0] == 'still':
            continue
        for f in fs:
            out.add(os.path.normpath(os.path.join(rel, f)))
    return out


def game_rig(draft_json):
    """작업본 뼈대에서 시험 외형과 그것만 쓰는 몸을 뺀 것 + 남은 외형이 쓰는 그림 목록"""
    rig = json.load(open(draft_json, encoding='utf-8'))
    rig['looks'] = {k: v for k, v in rig['looks'].items() if not k.endswith('-test')}
    used = {lk['body'] for lk in rig['looks'].values()}
    rig['bodies'] = {k: v for k, v in rig['bodies'].items() if k in used}
    for key in ('bodyJoints', 'bodyMotions'):
        if key in rig:
            rig[key] = {k: v for k, v in rig[key].items() if k == 'note' or k in used}
    arts = {p['art'] for b in rig['bodies'].values() for p in b.values()}
    arts |= {v['art'] for lk in rig['looks'].values() for v in lk.values() if isinstance(v, dict)}
    arts |= {look_art(lk, p['art']) for lk in rig['looks'].values() for p in rig['bodies'][lk['body']].values()}  # 색 외형 그림(115-A 85)
    return rig, {os.path.normpath(a + '.png') for a in arts}


def promote_rig(rid, dry, changes):
    from feet_weapon import dump
    d_json, d_mo, d_art, g_json, g_mo, g_art = rig_paths(rid)
    rig, arts = game_rig(d_json)
    tmp = g_json + '.new'
    if rid == 'humanoid':
        dump(rig, tmp)
    else:
        open(tmp, 'w', encoding='utf-8').write(json.dumps(rig, ensure_ascii=False, indent=1) + '\n')
    if not os.path.exists(g_json) or not filecmp.cmp(tmp, g_json, shallow=False):
        changes.append(f'데이터 {os.path.basename(g_json)}')
        if not dry:
            os.replace(tmp, g_json)
    if os.path.exists(tmp):
        os.remove(tmp)
    if not os.path.exists(g_mo) or not filecmp.cmp(d_mo, g_mo, shallow=False):
        changes.append(f'데이터 {os.path.basename(g_mo)}')
        if not dry:
            shutil.copyfile(d_mo, g_mo)
    d, g = files(d_art) & arts, files(g_art) if os.path.isdir(g_art) else set()
    for f in sorted(d):
        s, t = os.path.join(d_art, f), os.path.join(g_art, f)
        if f not in g or not filecmp.cmp(s, t, shallow=False):
            changes.append(f'그림 {rid}/{f}')
            if not dry:
                os.makedirs(os.path.dirname(t), exist_ok=True)
                shutil.copyfile(s, t)
    for f in sorted(g - d):
        changes.append(f'그림 지움 {rid}/{f}')
        if not dry:
            os.remove(os.path.join(g_art, f))


def main():
    dry = '--dry' in sys.argv
    changes = []
    for rid in GAME_RIGS:
        promote_rig(rid, dry, changes)
    print('\n'.join(changes) or '바뀐 것 없음')
    if not dry and changes:
        here = os.path.dirname(os.path.abspath(__file__))
        for rid in GAME_RIGS:
            subprocess.run([sys.executable, os.path.join(here, 'still.py'), '--rig', rid], check=True)
        subprocess.run([sys.executable, os.path.join(here, 'lock.py')], check=True)


if __name__ == '__main__':
    main()
