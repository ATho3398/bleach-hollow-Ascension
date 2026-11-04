# 디자인 v2 도트 아이콘(docs/design/redesign-v2/bha.css 의 .bha-i-*)을 게임용 두 파일로 옮긴다 (C.282, GDD 183장 3).
#   src/ui/bha/icons/icons.css     : 마스크 아이콘 클래스 .bha-i .bha-i-<이름> (화면 세션이 직접 쓰는 공용 클래스)
#   src/ui/bha/icons/icons-v2.svg  : 같은 그림의 <symbol id="v2-<이름>"> — 지금 화면의 icon('i-*') 가 매핑표로 이것을 쓴다
# 원본(디자인 패키지)을 고치지 않고 다시 만들 때: python3 scripts/gen-v2-icons.py
import re, urllib.parse, pathlib
src = pathlib.Path('docs/design/redesign-v2/bha.css').read_text()
rules = re.findall(r'^((?:\.bha-i-[a-z0-9-]+(?:, )?)+)\s*\{\s*--i:\s*url\("data:image/svg\+xml,([^"]+)"\);\s*\}', src, re.M)
base = re.findall(r'^\.bha-i(?:--[a-z]+)? \{[^\n]*\}', src, re.M)
css = ['/* 자동 생성: scripts/gen-v2-icons.py — 직접 고치지 말 것. 원본 docs/design/redesign-v2/bha.css (16×16 도트 마스크, currentColor) */', *base]
syms = ['<svg xmlns="http://www.w3.org/2000/svg" style="display:none">', '<!-- 자동 생성: scripts/gen-v2-icons.py — 디자인 v2 도트 아이콘 (16×16, 면 채움, currentColor) -->']
names = []
for sel, data in rules:
    css.append(f'{sel} {{ --i: url("data:image/svg+xml,{data}"); }}')
    svg = urllib.parse.unquote(data)
    paths = re.findall(r"<path d='([^']+)'", svg)
    body = ''.join(f'<path d="{d}"/>' for d in paths)
    for n in re.findall(r'\.bha-i-([a-z0-9-]+)', sel):
        names.append(n)
        syms.append(f'<symbol id="v2-{n}" viewBox="0 0 16 16"><g fill="currentColor" stroke="none" shape-rendering="crispEdges">{body}</g></symbol>')
syms.append('</svg>')
pathlib.Path('src/ui/bha/icons/icons.css').write_text('\n'.join(css) + '\n')
pathlib.Path('src/ui/bha/icons/icons-v2.svg').write_text('\n'.join(syms) + '\n')
pathlib.Path('src/ui/bha/icons/v2-names.json').write_text('[\n' + ',\n'.join(f'  "{n}"' for n in names) + '\n]\n')
print(len(rules), 'rules', len(names), 'names')
