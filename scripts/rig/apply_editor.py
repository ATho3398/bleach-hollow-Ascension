#!/usr/bin/env python3
"""관절 편집기(시험 페이지)에서 '값 복사'한 내용을 게임 뼈대 데이터에 넣는다 (GDD 96장).

사용: python3 scripts/rig/apply_editor.py '<복사한 JSON>'   (또는 파일 경로)
바뀌는 것: src/data/art/rig/humanoid.json 의 bones[].pivot, slots 순서, bodies.<몸>.<부위>.at
"""
import json
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
RIG_JSON = os.path.join(ROOT, 'src', 'data', 'art', 'rig', 'humanoid.json')

arg = sys.argv[1]
data = json.load(open(arg, encoding='utf-8')) if os.path.exists(arg) else json.loads(arg)
rig = json.load(open(RIG_JSON, encoding='utf-8'))
piv = {b['id']: b['pivot'] for b in data['bones']}
for b in rig['bones']:
    if b['id'] in piv:
        b['pivot'] = piv[b['id']]
order = data.get('slots')
if order:
    by = {s['id']: s for s in rig['slots']}
    rig['slots'] = [by[i] for i in order if i in by] + [s for s in rig['slots'] if s['id'] not in order]
for part, at in data.get('parts', {}).items():
    rig['bodies'][data['body']][part]['at'] = at
s = json.dumps(rig, ensure_ascii=False, indent=2)
s = re.sub(r'\[\s+(-?\d+),\s+(-?\d+)\s+\]', r'[\1, \2]', s)
s = re.sub(r'\{\s+"id": "([^"]+)",\s+"bone": "([^"]+)"\s+\}', r'{ "id": "\1", "bone": "\2" }', s)
s = re.sub(r'\{\s+"id": "([^"]+)",\s+"parent": ([^,]+),\s+"pivot": (\[[^\]]+\])\s+\}', r'{ "id": "\1", "parent": \2, "pivot": \3 }', s)
s = re.sub(r'\{\s+"art": "([^"]+)",\s+"at": (\[[^\]]+\]),\s+"size": (\[[^\]]+\])\s+\}', r'{ "art": "\1", "at": \2, "size": \3 }', s)
open(RIG_JSON, 'w', encoding='utf-8').write(s + '\n')
print('적용:', data['body'], '관절', len(piv), '부위 자리', len(data.get('parts', {})))
