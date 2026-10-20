"""기기 그림 규격 검사 (frame-v2 기본, frame-v1 도 가능)
  python3 check-device.py <앞면.png> [뒷면.png] [--ring X,Y] [--frame v1|v2]
  v2(기본): 그림 크기 = 896×442 의 정수배(추천 ×3). 화면 구멍·버튼 4개·구멍 둘레 몸체를 규격 자리와 견줘, 어디가 몇 px 틀렸는지 말한다(그림 픽셀 기준, ×배율 함께 표시).
  v1: 옛 규격(2744×2294). 새 그림은 v2 로 만든다.
--ring 에는 앞면 고리 구멍 중심(그림 픽셀)을 준다 — 그 구멍이 투명한지 본다."""
import json, sys, os
import numpy as np
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
argv = sys.argv[1:]
frame = 'v2'
if '--frame' in argv:
    i = argv.index('--frame'); frame = argv[i + 1]; del argv[i:i + 2]
ring = None
if '--ring' in argv:
    i = argv.index('--ring'); ring = tuple(int(v) for v in argv[i + 1].split(',')); del argv[i:i + 2]
args = [a for a in argv if not a.startswith('--')]
if not args or frame not in ('v1', 'v2'):
    sys.exit(__doc__)

ok = True
def say(good, msg):
    global ok
    ok &= bool(good)
    print(('✓ ' if good else '✗ ') + msg)

# ── 규격 불러오기: v1 = 고정 크기, v2 = 896×442 의 k 배 (k 는 그림 가로에서 가장 가까운 정수) ──
im0 = Image.open(args[0]).convert('RGBA')
iw, ih = im0.size
if frame == 'v1':
    P = json.load(open(os.path.join(HERE, '..', 'frame-v1', 'preset.json'), encoding='utf-8'))
    K, W, H = 1, P['canvas']['w'], P['canvas']['h']
    S = P['screen']; BT = P['buttons']; PLAIN = None
else:
    P = json.load(open(os.path.join(HERE, 'preset.json'), encoding='utf-8'))
    bw, bh = P['base']['canvas']['w'], P['base']['canvas']['h']
    K = max(1, round(iw / bw))
    sc = P['scales'].get(f'x{K}') or {
        'canvas': {'w': bw * K, 'h': bh * K}, 'plain': {a: v * K for a, v in P['base']['plain'].items()},
        'screen': {a: v * K for a, v in P['base']['lcd'].items()},
        'buttons': {n: {'cx': (b['x'] + b['w'] / 2) * K, 'cy': (b['y'] + b['h'] / 2) * K, 'touchR': b['w'] * K / 2} for n, b in P['base']['buttons'].items()}}
    W, H, S, BT, PLAIN = sc['canvas']['w'], sc['canvas']['h'], sc['screen'], sc['buttons'], sc['plain']
label = lambda p: os.path.basename(p)

def load(path, first=False):
    im = im0 if first else Image.open(path).convert('RGBA')
    w, h = im.size
    say((w, h) == (W, H), f'{label(path)}: 크기 {w}×{h} (규격 {W}×{H}' + (f' = 896×442 × {K})' if frame == 'v2' else ')'))
    if (w, h) != (W, H):
        if frame == 'v2':
            print(f'   → 가로 {w - W:+d}px · 세로 {h - H:+d}px. 그림 한 장은 896×442 의 정수배(×2 = 1792×884, ×3 = 2688×1326, ×4 = 3584×1768)여야 하고 비율은 896:442 = {896 / 442:.3f}:1 (지금 {w / h:.3f}:1)')
        print(f'   → 아래 검사는 규격 자리(왼쪽 위 기준, ×{K})와 견줘 계속한다 — 크기를 먼저 맞춰야 정확하다')
    a = np.zeros((H, W), np.uint8)
    arr = np.array(im)[:, :, 3]
    hh, ww = min(H, arr.shape[0]), min(W, arr.shape[1])
    a[:hh, :ww] = arr[:hh, :ww]
    return a

yy, xx = np.ogrid[:H, :W]
def ring_hole(a, cx, cy, label_):
    cx, cy = max(0, min(W - 1, cx)), max(0, min(H - 1, cy))
    core = (xx - cx) ** 2 + (yy - cy) ** 2 <= (5 * K if frame == 'v2' else 40) ** 2
    say(a[core].max() == 0, f'{label_}: 고리 구멍 ({cx}, {cy}) 투명')

def bbox(mask):
    ys, xs = np.nonzero(mask)
    return (xs.min(), ys.min(), xs.max(), ys.max()) if len(xs) else None

a = load(args[0], True)
sx0, sy0, sx1, sy1 = int(S['x']), int(S['y']), int(S['x'] + S['w']), int(S['y'] + S['h'])
# 구멍 모서리는 둥글어도 된다(LCD 모서리 반지름 11×배율 — 게임 화면이 그 모서리를 자른다): 모서리 사각형 중 원 밖은 검사에서 뺀다
cr = 11 * K if frame == 'v2' else 0
hy, hx = np.ogrid[sy0:sy1, sx0:sx1]
dx = np.maximum(np.maximum(sx0 + cr - hx, hx - (sx1 - 1 - cr)), 0)
dy = np.maximum(np.maximum(sy0 + cr - hy, hy - (sy1 - 1 - cr)), 0)
hole_mask = (dx * dx + dy * dy) <= cr * cr if cr else np.ones((sy1 - sy0, sx1 - sx0), bool)
inside = np.where(hole_mask, a[sy0:sy1, sx0:sx1], 0)
say(inside.max() == 0, f'앞면: 화면 구멍 ({sx0}, {sy0}) {sx1 - sx0}×{sy1 - sy0} 안이 완전 투명')
if inside.max() != 0:
    b = bbox(inside > 0)
    print(f'   → 구멍 안에 그림이 있음: x {sx0 + b[0]}~{sx0 + b[2]} · y {sy0 + b[1]}~{sy0 + b[3]} 를 투명하게 지워야 함')

# 실제 그림의 구멍(가운데에서 이어진 투명 영역)을 재서 규칙과 몇 px 다른지 말한다
cx, cy = (sx0 + sx1) // 2, (sy0 + sy1) // 2
def edge(line, start, step):
    i = start
    while 0 <= i + step < len(line) and line[i + step] == 0:
        i += step
    return i
if a[cy, cx] == 0:
    cols = range(sx0 + 8, sx1 - 8, 16)
    rows = range(sy0 + 8, sy1 - 8, 16)
    top = min(edge(a[:, x], cy, -1) for x in cols if a[cy, x] == 0)
    bot = max(edge(a[:, x], cy, 1) for x in cols if a[cy, x] == 0) + 1
    lef = min(edge(a[y, :], cx, -1) for y in rows if a[y, cx] == 0)
    rig = max(edge(a[y, :], cx, 1) for y in rows if a[y, cx] == 0) + 1
    print(f'   그림의 실제 구멍: ({lef}, {top}) {rig - lef}×{bot - top} (규칙 ({sx0}, {sy0}) {sx1 - sx0}×{sy1 - sy0})')
    def side(name, have, want, bigger_is_out, fix):
        d = have - want
        if d == 0:
            return say(True, f'화면 구멍 {name} 가장자리 = 규칙 그대로 ({want})')
        out = (d < 0) == bigger_is_out  # 구멍이 규칙보다 바깥으로 큰가
        lo, hi = sorted((have, want))
        extra = f' (기준 px 로 {abs(d) / K:g})' if K > 1 else ''
        if out:
            say(False, f'화면 구멍 {name}쪽이 {abs(d)}px 더 큼{extra}: {fix} {lo}~{hi - 1} 가 투명 → 불투명(테두리)이어야 함')
        else:
            say(False, f'화면 구멍 {name}쪽이 {abs(d)}px 작음{extra}: {fix} {lo}~{hi - 1} 가 불투명 → 투명이어야 함')
    side('위', top, sy0, True, 'y')
    side('아래', bot, sy1, False, 'y')
    side('왼', lef, sx0, True, 'x')
    side('오른', rig, sx1, False, 'x')
    print(f'   구멍 비율: 그림 {(rig - lef) / (bot - top):.3f}:1, 규칙 {(sx1 - sx0) / (sy1 - sy0):.3f}:1')
else:
    say(False, f'구멍 가운데 ({cx}, {cy}) 가 투명하지 않음 — 화면 구멍 자리가 통째로 다름')

m = 24 * (K if frame == 'v2' else 1)
band = np.zeros((H, W), bool)
band[max(0, sy0 - m):sy1 + m, max(0, sx0 - m):sx1 + m] = True
if PLAIN:  # v2: 평소 화면 범위 안만 (바깥 둘레 26px 는 자유)
    pl = np.zeros((H, W), bool)
    pl[int(PLAIN['y']):int(PLAIN['y'] + PLAIN['h']), int(PLAIN['x']):int(PLAIN['x'] + PLAIN['w'])] = True
    band &= pl
band[sy0:sy1, sx0:sx1] = False
cov = (a[band] > 200).mean()
say(cov > 0.95, f'앞면: 화면 구멍 둘레 {m}px 를 몸체가 덮음 ({cov:.0%})')
if cov <= 0.95:
    for name, ys, xs in [('위', slice(max(0, sy0 - m), sy0), slice(max(0, sx0 - m), sx1 + m)), ('아래', slice(sy1, sy1 + m), slice(max(0, sx0 - m), sx1 + m)),
                         ('왼', slice(sy0, sy1), slice(max(0, sx0 - m), sx0)), ('오른', slice(sy0, sy1), slice(sx1, sx1 + m))]:
        mk = np.zeros((H, W), bool)
        mk[ys, xs] = True
        b = bbox(mk & (a <= 200))
        if b:
            print(f'   → 구멍 {name}쪽 테두리 {m}px 에 몸체가 없는 곳: x {b[0]}~{b[2]} · y {b[1]}~{b[3]}')
for n, b in BT.items():
    c = (xx - b['cx']) ** 2 + (yy - b['cy']) ** 2 <= b['touchR'] ** 2
    cv = (a[c] > 200).mean()
    say(cv > 0.9, f'앞면: 버튼 {n} 자리 (중심 ({b["cx"]:g}, {b["cy"]:g}) 지름 {b["touchR"] * 2:g}) 그림 있음 ({cv:.0%})')
    if cv <= 0.9:
        mm = bbox(c & (a <= 200))
        print(f'   → 버튼 {n} 누름 영역에 몸체가 없는 곳: x {mm[0]}~{mm[2]} · y {mm[1]}~{mm[3]} (버튼은 몸체 위에 있어야 함)')
if PLAIN:
    # 평소 화면(844×390 범위)에서 구멍 밖은 그림이 있어야 한다 (비어 보이면 뒤 배경이 비침)
    px0, py0, px1, py1 = int(PLAIN['x']), int(PLAIN['y']), int(PLAIN['x'] + PLAIN['w']), int(PLAIN['y'] + PLAIN['h'])
    pm = np.zeros((H, W), bool)
    pm[py0:py1, px0:px1] = True
    pm[sy0:sy1, sx0:sx1] = False
    pc = (a[pm] > 200).mean()
    say(pc > 0.9, f'앞면: 평소 화면 범위 ({px0}, {py0}) {px1 - px0}×{py1 - py0} 에서 구멍 밖을 그림이 덮음 ({pc:.0%})')
    if pc <= 0.9:
        mm = bbox(pm & (a <= 200))
        print(f'   → 평소 화면에 그림이 비는 곳: x {mm[0]}~{mm[2]} · y {mm[1]}~{mm[3]} (모서리 둥근 부분이면 괜찮음)')
if ring:
    ring_hole(a, *ring, '앞면')
if len(args) > 1:
    b = load(args[1])
    if ring:
        ring_hole(b, W - 1 - ring[0], ring[1], '뒷면(좌우 반전)')

if frame == 'v2':
    print('\nitems.json 의 devices 줄에 넣을 것 (화면·버튼 자리는 규격이라 적지 않는다):')
    r = {'frame': 'v2'}
    if ring:
        r['ring'] = {'x': round(ring[0] / W * 100, 2), 'y': round(ring[1] / H * 100, 2)}
    print(json.dumps(r, ensure_ascii=False))
else:
    out = {'screen': P['itemsJson']['screen'], 'buttons': P['itemsJson']['buttons']}
    if ring:
        out['ring'] = {'x': round(ring[0] / W * 100, 2), 'y': round(ring[1] / H * 100, 2)}
    print('\nitems.json 의 devices 줄에 넣을 좌표(%):')
    print(json.dumps(out, ensure_ascii=False))
sys.exit(0 if ok else 1)
