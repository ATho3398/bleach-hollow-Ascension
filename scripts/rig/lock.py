#!/usr/bin/env python3
"""고정 파일 다시 쓰기 (GDD 96장): 관절·쉬는 각도·앞뒤 순서 + 아란칼 기본형·알몸 기본형의 부위·층 자리 → src/data/art/rig/arrancar-base.lock.json
사용자가 고친 값을 데이터에 넣은 뒤에만 돌린다(테스트가 도구의 실수로 값이 바뀌는 걸 막는다)."""
import json
import os
import re

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
RIG = os.path.join(ROOT, 'src', 'data', 'art', 'rig', 'humanoid.json')
LOCK = os.path.join(ROOT, 'src', 'data', 'art', 'rig', 'arrancar-base.lock.json')
LOOKS = ['arrancar-base', 'bare-base', 'female-base', 'shinigami-base', 'shinigami-student', 'shinigami-student-f']

rig = json.load(open(RIG, encoding='utf-8'))
pa = lambda v: {'art': v['art'], 'at': v['at']}
lock = {
    'note': '고정값 (사용자 2026-10-28 "이대로 고정시키고"). 아란칼 기본형 = 옷 입은 몸, 알몸 기본형 = 옷 입히기 바탕. 관절·부위 자리를 바꾸면 tests/paperdoll.test.ts 가 막는다 — 사용자가 고친 값이면 scripts/rig/lock.py 로 이 파일도 같이 고친다',
    'pivots': {b['id']: b['pivot'] for b in rig['bones']},
    'restRot': {b['id']: b['restRot'] for b in rig['bones'] if 'restRot' in b},
    'slots': [s['id'] for s in rig['slots']],
    'bodyJoints': {k: v for k, v in (rig.get('bodyJoints') or {}).items() if isinstance(v, dict)},
    'looks': {lid: {'body': rig['looks'][lid]['body'],
                    'parts': {k: pa(v) for k, v in rig['bodies'][rig['looks'][lid]['body']].items()},
                    'layers': {k: pa(v) for k, v in rig['looks'][lid].items() if isinstance(v, dict)}} for lid in LOOKS},
}
s = json.dumps(lock, ensure_ascii=False, indent=1)
s = re.sub(r'\[\s+(-?\d+),\s+(-?\d+)\s+\]', r'[\1, \2]', s)
s = re.sub(r'\{\s+"art": "([^"]+)",\s+"at": (\[[^\]]+\])\s+\}', r'{ "art": "\1", "at": \2 }', s)
open(LOCK, 'w', encoding='utf-8').write(s + '\n')
print('고정 파일:', ', '.join(LOOKS))
