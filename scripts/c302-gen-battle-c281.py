# C.302 (GDD 190장 2): 전투 화면 C.281 모양 되살리기용 CSS 생성기. 사용: python3 scripts/c302-gen-battle-c281.py > src/ui/bha/battle-c281.css
import re, sys, os
D = os.path.dirname(os.path.abspath(__file__))

def strip_comments(t):
    return re.sub(r'/\*.*?\*/', '', t, flags=re.S)

def parse(t):
    """returns list of (context, selector, body) ; context = '' or '@media ...' ; keyframes as ('@keyframes', name, body)"""
    t = strip_comments(t)
    out = []
    i = 0
    n = len(t)
    def block_end(j):
        depth = 0
        k = j
        while k < n:
            if t[k] == '{': depth += 1
            elif t[k] == '}':
                depth -= 1
                if depth == 0: return k
            k += 1
        return n
    def walk(a, b, ctx):
        nonlocal out
        j = a
        while j < b:
            k = t.find('{', j, b)
            if k < 0: break
            sel = t[j:k].strip()
            e = block_end(k)
            body = t[k+1:e]
            if sel.startswith('@media') or sel.startswith('@supports'):
                walk(k+1, e, sel)
            elif sel.startswith('@keyframes'):
                out.append(('@keyframes', sel.split()[1], body.strip()))
            elif sel.startswith('@font-face'):
                pass
            else:
                out.append((ctx, sel, ' '.join(body.split())))
            j = e + 1
    walk(0, n, '')
    return out

def decls(body):
    res = {}
    for m in re.finditer(r'(--[\w-]+)\s*:\s*([^;]+);', body):
        res[m.group(1)] = ' '.join(m.group(2).split())
    return res

def vars_of(rules, pred):
    v = {}
    for ctx, sel, body in rules:
        if ctx == '' and pred(sel):
            v.update(decls(body))
    return v

import subprocess
ROOT = os.path.dirname(D)
PATHS = {'tokens.css': 'design-system/tokens.css', 'theme-hollow.css': 'design-system/theme-hollow.css', 'theme-shinigami.css': 'design-system/theme-shinigami.css',
         'components.css': 'components/components.css', 'story.css': 'story.css', 'base.css': 'design-system/base.css'}
def rd(n):
    """old-<이름> = git 68acec7(C.281) 의 파일, new-<이름> = 지금 작업 트리"""
    kind, name = n.split('-', 1)
    rel = 'src/ui/bha/' + PATHS[name]
    if kind == 'old':
        return subprocess.run(['git', 'show', '68acec7:' + rel], cwd=ROOT, capture_output=True, check=True).stdout.decode('utf-8')
    return open(os.path.join(ROOT, rel), encoding='utf-8').read()

out = []
out.append('/* C.302 (GDD 190장 2) 전투 화면 = C.281 모양: 리디자인 v2(C.282) 전 공용 토큰·부품 값을 전투 루트(.bha-root, 전투 전용) 안에만 되살린다.\n   scripts/c302-gen-battle-c281.py 가 git 68acec7 의 tokens.css·theme-*.css·components.css·story.css 와 지금 파일을 비교해 만든다(직접 고치지 말 것).\n   v2/bha.css(C.281 그대로) 보다 앞에 읽어, 같은 이름은 v2/bha.css 의 전투 토큰이 이긴다(C.281 과 같은 순서). */')

# tokens
ot = parse(rd('old-tokens.css')); nt = parse(rd('new-tokens.css'))
root = lambda s: s.strip() == ':root'
ov = vars_of(ot, root); nv = vars_of(nt, root)
diff = {k: v for k, v in ov.items() if nv.get(k) != v}
out.append('.bha-root{' + ''.join(f'{k}:{v};' for k, v in diff.items()) + '}')
for th in ['hollow', 'shinigami']:
    o = parse(rd(f'old-theme-{th}.css')); nn = parse(rd(f'new-theme-{th}.css'))
    pred = lambda s: f'[data-bha-theme="{th}"]' in s
    a = vars_of(o, pred); b = vars_of(nn, pred)
    # 새 테마가 바꾼 값 + 새 :root 토큰이 덮는 이름도 옛 값으로
    d = {k: v for k, v in a.items() if b.get(k) != v or k in nv}
    out.append(f'.bha-root.bha-{th}{{' + ''.join(f'{k}:{v};' for k, v in d.items()) + '}')

# 속성 색: C.282 가 elements.json 의 색 토큰 이름을 --bha-el-* 로 바꿨다 → 전투 안에서는 새 이름이 옛 토큰을 가리키게
import json
oe = json.loads(subprocess.run(['git', 'show', '68acec7:src/data/elements/elements.json'], cwd=ROOT, capture_output=True, check=True).stdout)
ne = json.load(open(os.path.join(ROOT, 'src/data/elements/elements.json'), encoding='utf-8'))
om = {e['id']: e['color'] for e in oe}
out.append('.bha-root{' + ''.join(f"{e['color']}:var({om[e['id']]});" for e in ne if e['id'] in om and om[e['id']] != e['color']) + '}')

# components + story rules
SKIP = re.compile(r'\.bha-(tut|toast|modal|dialog|sheet|guide|confirm|pick|install|tama|room|shop|walk|spa|market|story|absorb|result|evo|plan|road|tile|equip|bag|settings|help|info|dock|slot|dots|tilechip|notice)\b')
def scope(sel):
    parts = [p.strip() for p in sel.split(',')]
    res = []
    for p in parts:
        if p.startswith(':root') or p.startswith('html') or p.startswith('body'):
            return None
        res.append(':where(.bha-root) ' + p)
    return ', '.join(res)

newkf = {}
for f in ['new-components.css', 'new-story.css', 'new-base.css']:
    for ctx, sel, body in parse(rd(f)):
        if ctx == '@keyframes': newkf[sel] = body
newset = set()
for f in ['new-components.css', 'new-story.css']:
    for r in parse(rd(f)): newset.add(r)

kf_rename = {}
emitted = []
for f in ['old-components.css', 'old-story.css']:
    rules = parse(rd(f))
    for ctx, sel, body in rules:
        if ctx == '@keyframes':
            if sel not in newkf:
                emitted.append(('kf', sel, body))
            elif ' '.join(newkf[sel].split()) != ' '.join(body.split()):
                kf_rename[sel] = sel + '-c281'
                emitted.append(('kf', sel + '-c281', body))
            continue
        if (ctx, sel, body) in newset:
            continue
        if f == 'old-story.css' and 'bha-block' not in sel:
            continue
        if SKIP.search(sel):
            continue
        sc = scope(sel)
        if not sc:
            continue
        emitted.append((ctx, sc, body))

def fix_kf(body):
    for a, b in kf_rename.items():
        body = re.sub(r'\b' + re.escape(a) + r'\b(?!-c281)', b, body)
    return body

cur_ctx = None
for kind, sel, body in emitted:
    if kind == 'kf':
        out.append(f'@keyframes {sel}{{{" ".join(body.split())}}}')
    elif kind:
        out.append(f'{kind}{{{sel}{{{fix_kf(body)}}}}}')
    else:
        out.append(f'{sel}{{{fix_kf(body)}}}')

sys.stdout.write('\n'.join(out) + '\n')
sys.stderr.write(f'tokens {len(diff)} rules {len(emitted)} kf-renamed {list(kf_rename)}\n')
