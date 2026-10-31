#!/usr/bin/env python3
"""관절 편집기를 다시 올린 뒤 실행 (GDD 115-A 60): 그 페이지를 만든 커밋을 docs/design/rig-draft/editor-page.json 에 적는다.
고정(apply_editor.py)은 편집기 값이 이 커밋의 데이터와 다른 항목만 '사용자가 고친 것'으로 본다.
페이지는 커밋된 작업본으로 만들어야 한다(작업본 파일에 커밋 안 한 변경이 있으면 멈춤).
사용: python3 scripts/rig/tools/mark_editor.py   (적은 뒤 editor-page.json 을 커밋·푸시)
"""
import json
import os
import subprocess
import sys

ROOT = '/home/user/bleach-hollow-Ascension'
DRAFT = 'docs/design/rig-draft'
dirty = subprocess.check_output(['git', '-C', ROOT, 'status', '--porcelain', '--', DRAFT], text=True)
dirty = [ln for ln in dirty.splitlines() if not ln.endswith('editor-page.json')]
if dirty:
    sys.exit('작업본에 커밋 안 한 변경이 있음 — 커밋한 뒤 페이지를 만들어 올리고 다시 실행:\n' + '\n'.join(dirty))
commit = subprocess.check_output(['git', '-C', ROOT, 'rev-parse', 'HEAD'], text=True).strip()
p = os.path.join(ROOT, DRAFT, 'editor-page.json')
d = json.load(open(p, encoding='utf-8')) if os.path.exists(p) else {}
d['commit'] = commit
d['applied'] = {}  # 새 페이지 = 이 페이지에서 고정으로 넣은 항목 없음(apply_editor.py 가 채움)
open(p, 'w', encoding='utf-8').write(json.dumps(d, ensure_ascii=False, indent=1) + '\n')
print('editor-page.json ←', commit[:7])
