# 디자인 v2 공용 컴포넌트(docs/design/redesign-v2/bha.css 의 '레이아웃 조각' ~ '스킬 블록')를 게임 공용 CSS 로 옮긴다 (C.282, GDD 183장 1 ①).
#   출력: src/ui/bha/components/bha-v2.css  (main.ts 에서 components.css 바로 뒤에 넣는다)
# 규칙
#   - 기기·LCD·기기 버튼(.bha-device/.bha-lcd/.bha-screen/.bha-dbtn)은 옮기지 않는다 — 게임 코드 값이 맞다(LCD 646×360, PROMPT 1절). 꾸미기 우선 구조는 device.css.
#   - 게임에 같은 이름의 '다른 구조' 클래스가 이미 있는 것(GAME_CLASH)은 화면 루트에 .bha-v2 를 단 화면 안에서만 v2 모양이 된다(.bha-v2 .bha-row …).
#     옛 화면은 그대로 → 화면 세션이 화면을 옮기며 루트에 bha-v2 를 단다.
#   - 옛 전투 UI(.bha-root, C.151) 와 이름이 겹치는 새 클래스(ROOT_CLASH)는 .bha-root 안에서는 꺼 둔다(:where(:not(.bha-root *)), 우선순위 그대로).
#   - .bha-btn/.bha-chip/.bha-panel 기본 모양은 components.css 를 v2 값으로 고쳤다(옛 이름 = 새 모양). 여기서는 새 변형만 더한다.
# 다시 만들 때: python3 scripts/gen-v2-components.py
import re, pathlib
src = pathlib.Path('docs/design/redesign-v2/bha.css').read_text().split('\n')
start = next(i for i, l in enumerate(src) if '레이아웃 조각' in l)
end = next(i for i, l in enumerate(src) if '시트(캔버스 문서) 전용' in l)
block = src[start:end]
SKIP_BASE = {'.bha-btn', '.bha-chip', '.bha-panel', '.bha-grow', '.bha-label',  # components/base 가 이미 v2 값 (옛 이름 = 새 모양)
             '.bha-btn--primary', '.bha-btn--danger', '.bha-btn--ghost', '.bha-btn--lg', '.bha-btn--icon', '.bha-btn--block',
             '.bha-btn--icon.bha-btn--sm', '.bha-btn.is-press', '.bha-btn--primary.is-press', '.bha-btn:disabled', '.bha-btn.is-disabled', '.bha-chip--danger'}
GAME_CLASH = {'bha-row', 'bha-info', 'bha-legend', 'bha-dock', 'bha-pop', 'bha-tut', 'bha-art', 'bha-toast', 'bha-body', 'bha-switch', 'bha-num'}
ROOT_CLASH = {'bha-badge', 'bha-blockbar', 'bha-chain', 'bha-count', 'bha-gauge', 'bha-head', 'bha-kv', 'bha-more', 'bha-scene', 'bha-scrim', 'bha-tab', 'bha-tabs', 'bha-btn', 'bha-chip', 'is-focus'}
GUARD = ':where(:not(.bha-root *))'
out = ['/* 자동 생성: scripts/gen-v2-components.py — 직접 고치지 말 것. 원본 docs/design/redesign-v2/bha.css (C.282, GDD 183장)',
       '   사용법 요약은 docs/design/redesign-v2/README-game.md */']

def classes(sel):
    return set(re.findall(r'\.([a-z][a-z0-9-]*)', sel))

def fix_selector(sel):
    sel = sel.strip()
    cl = classes(sel)
    # .bha-num 기본은 base.css 가 이미 Silkscreen. 고정 폭 칸만 inline-block + 오른쪽 정렬로
    if sel == '.bha-num':
        return None
    if sel in SKIP_BASE:
        return None
    if cl & GAME_CLASH and not sel.startswith('.bha-num--'):
        return '.bha-v2 ' + sel
    if cl & ROOT_CLASH:
        # 주어(마지막 compound) 의 의사 요소 앞에 GUARD
        m = re.search(r'(::?[a-z-]+(?:\([^)]*\))?)?$', sel)
        pe = sel[m.start():] if m and m.group(1) and m.group(1).startswith('::') else ''
        base = sel[:len(sel) - len(pe)] if pe else sel
        return base + GUARD + pe
    return sel

for line in block:
    m = re.match(r'^([^{}/@][^{]*)\{(.*)\}\s*$', line)
    if not m:
        out.append(line)
        continue
    sels = [fix_selector(s) for s in m.group(1).split(',')]
    sels = [s for s in sels if s]
    if not sels:
        continue
    out.append(', '.join(sels) + ' {' + m.group(2) + '}')
txt = '\n'.join(out) + '\n'
txt = txt.replace('.bha-num--w2 { width: 2ch; }', '.bha-num--w2, .bha-num--w3, .bha-num--w4, .bha-num--w5, .bha-num--w6 { display: inline-block; text-align: right; white-space: nowrap; }\n.bha-num--w2 { width: 2ch; }')
# 디자인 파일의 hex 몇 개 → 토큰 (화면 CSS hex 금지 규칙)
for a, b in [('color: #f6ece6', 'color: var(--bha-text-1)'), ('background: #0c0909', 'background: var(--bha-backdrop)'),
             ('background: #e6d6a8', 'background: var(--bha-cos-win-light)'), ('var(--el) 46%, #0d0a09', 'var(--el) 46%, var(--bha-backdrop)')]:
    txt = txt.replace(a, b)
import sys
left = re.findall(r'#[0-9a-fA-F]{6}\b', txt)
if left: print('hex left:', left, file=sys.stderr)
pathlib.Path('src/ui/bha/components/bha-v2.css').write_text(txt)
print('lines', len(out))
