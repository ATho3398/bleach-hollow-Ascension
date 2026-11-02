#!/bin/bash
# 편집기·시험 페이지 만들기 (GDD 115-A): 템플릿 + 작업본 그림(docs/design/rig-draft) + 번들 → <출력 폴더>/rig-editor.html·paperdoll-test.html
# 사용: bash scripts/rig/tools/build_pages.sh [출력 폴더, 기본 .rig-pages]  → Artifact 로 올린다(편집기 https://claude.ai/artifact/9GzByhNrUmxaZfn7tgYfP7, 시험 https://claude.ai/artifact/42DLdjssrAnZP1wFshLbvx)
set -e
cd "$(dirname "$0")/../../.."
OUT="${1:-.rig-pages}"; mkdir -p "$OUT"
npx esbuild scripts/rig/editor-page.ts --bundle --format=iife --outfile="$OUT/editor.js" --log-level=warning
npx esbuild scripts/rig/tools/doll-entry.ts --bundle --format=iife --outfile="$OUT/bundle.js" --log-level=warning
python3 -I - "$OUT" <<'PY'
import base64, glob, json, sys
out = sys.argv[1]
m = {}
for rid in ('humanoid', 'beast', 'serpent'):
    root = 'docs/design/rig-draft/' + rid + '/'
    m.update({'art/rig/' + rid + '/' + f[len(root):]: 'data:image/png;base64,' + base64.b64encode(open(f, 'rb').read()).decode() for f in glob.glob(root + '**/*.png', recursive=True)})
for page, js in (('rig-editor', 'editor.js'), ('paperdoll-test', 'bundle.js')):
    h = open('scripts/rig/tools/' + page + '.template.html').read()
    h = h.replace('<script>var ART_MAP={};</script>', '<script>var ART_MAP=' + json.dumps(m) + ';</script>')
    h = h.replace('<script>/*JS*/</script>', '<script>' + open(out + '/' + js).read() + '</script>')
    open(out + '/' + page + '.html', 'w').write(h)
print('pages ok', len(m), '→', out)
PY
