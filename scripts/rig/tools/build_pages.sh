#!/bin/bash
# 편집기·시험 페이지 만들기 (GDD 115-A): 템플릿 + 작업본 그림(docs/design/rig-draft) + 번들 → <출력 폴더>/rig-editor.html·paperdoll-test.html
# 사용: bash scripts/rig/tools/build_pages.sh [출력 폴더, 기본 .rig-pages]  → Artifact 로 올린다(편집기 https://claude.ai/artifact/9GzByhNrUmxaZfn7tgYfP7, 시험 https://claude.ai/artifact/42DLdjssrAnZP1wFshLbvx)
set -e
cd "$(dirname "$0")/../../.."
OUT="${1:-.rig-pages}"; mkdir -p "$OUT"
npx esbuild scripts/rig/editor-page.ts --bundle --format=iife --outfile="$OUT/editor.js" --log-level=warning
npx esbuild scripts/rig/tools/doll-entry.ts --bundle --format=iife --outfile="$OUT/bundle.js" --log-level=warning
# 외형마다 시트(가이드 1배·8배 확인용) — 편집기 '시트 받기' 단추가 내려받는다(사용자 2026-11-10 "툴에 그냥 캐릭별로 시트 다운받기 버튼")
rm -rf "$OUT/sheets"; mkdir -p "$OUT/sheets"
# 도트를 n배로 키운 몸(역관절·덩치·두건 — cuts·assembled)은 1배 부위 시트(parts_sheet.py, 115-A 92), 그 밖은 가이드(guide.py)
SCALED=$(python3 -c "import json; r=json.load(open('docs/design/rig-draft/humanoid.json')); print(' '.join(k for k,v in r['looks'].items() if v['body'] in (r.get('cuts') or {}) or v['body'] in (r.get('assembled') or {})))")
for L in $(python3 -c "import json; print(' '.join(json.load(open('docs/design/rig-draft/humanoid.json'))['looks']))"); do
  if [[ " $SCALED " == *" $L "* ]]; then
    python3 scripts/rig/parts_sheet.py --look "$L" --out "$OUT/sheets/$L" >/dev/null || echo "시트 못 만듦: $L"
  else
    python3 scripts/rig/guide.py --look "$L" --out "$OUT/sheets/$L" >/dev/null || echo "시트 못 만듦: $L"
  fi
done
python3 scripts/rig/bone_guide.py beast beast-base "$OUT/sheets/beast-base" >/dev/null
python3 scripts/rig/bone_guide.py serpent serpent-base "$OUT/sheets/serpent-base" >/dev/null
python3 scripts/rig/bone_guide.py spider spider-base "$OUT/sheets/spider-base" >/dev/null
python3 scripts/rig/bone_guide.py wraith wraith-base "$OUT/sheets/wraith-base" >/dev/null
python3 scripts/rig/bone_guide.py aizen aizen-base "$OUT/sheets/aizen-base" >/dev/null
python3 scripts/rig/bone_guide.py aizen aizen-parts "$OUT/sheets/aizen-parts" >/dev/null
python3 -I - "$OUT" <<'PY'
import base64, glob, json, os, sys
out = sys.argv[1]
b64 = lambda f: 'data:image/png;base64,' + base64.b64encode(open(f, 'rb').read()).decode()
sheets = {os.path.basename(d): {'x1': b64(d + '/guide.png'), 'x8': b64(d + '/guide-x8.png')} for d in glob.glob(out + '/sheets/*') if os.path.exists(d + '/guide-x8.png')}
m = {}
for rid in ('humanoid', 'beast', 'serpent', 'spider', 'wraith', 'aizen'):
    root = 'docs/design/rig-draft/' + rid + '/'
    m.update({'art/rig/' + rid + '/' + f[len(root):]: 'data:image/png;base64,' + base64.b64encode(open(f, 'rb').read()).decode() for f in glob.glob(root + '**/*.png', recursive=True)})
for page, js in (('rig-editor', 'editor.js'), ('paperdoll-test', 'bundle.js')):
    h = open('scripts/rig/tools/' + page + '.template.html').read()
    h = h.replace('<script>var ART_MAP={};</script>', '<script>var ART_MAP=' + json.dumps(m) + ';</script>')
    h = h.replace('<script>var SHEET_MAP={};</script>', '<script>var SHEET_MAP=' + json.dumps(sheets) + ';</script>')
    h = h.replace('<script>/*JS*/</script>', '<script>' + open(out + '/' + js).read() + '</script>')
    open(out + '/' + page + '.html', 'w').write(h)
print('pages ok', len(m), '시트', len(sheets), '→', out)
PY
