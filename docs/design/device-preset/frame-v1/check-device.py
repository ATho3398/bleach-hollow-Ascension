"""[옛 규격 — 새 그림은 ../frame-v2/check-device.py] 기기 그림 규격(frame-v1) 검사
  python3 check-device.py <앞면.png> [뒷면.png] [--ring X,Y]
고정 = 이미지 크기·화면 구멍·버튼 4개. 모양·고리는 자유(--ring 에 앞면 고리 중심을 주면 그 구멍도 본다)."""
import json, sys, os
import numpy as np
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
P = json.load(open(os.path.join(HERE, 'preset.json'), encoding='utf-8'))
W, H = P['canvas']['w'], P['canvas']['h']
args = [a for a in sys.argv[1:] if not a.startswith('--')]
ring = None
if '--ring' in sys.argv:
    ring = tuple(int(v) for v in sys.argv[sys.argv.index('--ring') + 1].split(','))
    args = [a for a in args if a != sys.argv[sys.argv.index('--ring') + 1]]
if not args:
    sys.exit(__doc__)

ok = True
def say(good, msg):
    global ok
    ok &= bool(good)
    print(('✓ ' if good else '✗ ') + msg)

def load(path):
    im = Image.open(path).convert('RGBA')
    say(im.size == (W, H), f'{os.path.basename(path)}: 크기 {im.size[0]}×{im.size[1]} (규격 {W}×{H})')
    if im.size != (W, H):
        sys.exit(1)
    return np.array(im)[:, :, 3]

yy, xx = np.ogrid[:H, :W]
def ring_hole(a, cx, cy, label):
    core = (xx - cx) ** 2 + (yy - cy) ** 2 <= 40 ** 2
    say(a[core].max() == 0, f'{label}: 고리 구멍 ({cx}, {cy}) 투명')

def bbox(mask):
    ys, xs = np.nonzero(mask)
    return (xs.min(), ys.min(), xs.max(), ys.max()) if len(xs) else None

a = load(args[0])
s = P['screen']
sx0, sy0, sx1, sy1 = s['x'], s['y'], s['x'] + s['w'], s['y'] + s['h']  # 끝은 포함 안 함
inside = a[sy0:sy1, sx0:sx1]
say(inside.max() == 0, f'앞면: 화면 구멍 ({sx0}, {sy0}) {s["w"]}×{s["h"]} 안이 완전 투명')
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
    # 가운데 세로·가로 한 줄이 아니라 구멍 폭 전체에서 가장 넓게 투명한 곳까지 (모서리 둥근 구멍도 잡는다)
    cols = range(sx0 + 8, sx1 - 8, 16)
    rows = range(sy0 + 8, sy1 - 8, 16)
    top = min(edge(a[:, x], cy, -1) for x in cols if a[cy, x] == 0)
    bot = max(edge(a[:, x], cy, 1) for x in cols if a[cy, x] == 0) + 1
    lef = min(edge(a[y, :], cx, -1) for y in rows if a[y, cx] == 0)
    rig = max(edge(a[y, :], cx, 1) for y in rows if a[y, cx] == 0) + 1
    print(f'   그림의 실제 구멍: ({lef}, {top}) {rig - lef}×{bot - top} (규칙 ({sx0}, {sy0}) {s["w"]}×{s["h"]})')
    def side(name, have, want, bigger_is_out, fix):
        d = have - want
        if d == 0:
            return say(True, f'화면 구멍 {name} 가장자리 = 규칙 그대로 ({want})')
        out = (d < 0) == bigger_is_out  # 구멍이 규칙보다 바깥으로 큰가
        lo, hi = sorted((have, want))
        if out:
            say(False, f'화면 구멍 {name}쪽이 {abs(d)}px 더 큼: {fix} {lo}~{hi - 1} 가 투명 → 불투명(테두리)이어야 함')
        else:
            say(False, f'화면 구멍 {name}쪽이 {abs(d)}px 작음: {fix} {lo}~{hi - 1} 가 불투명 → 투명이어야 함')
    side('위', top, sy0, True, 'y')
    side('아래', bot, sy1, False, 'y')
    side('왼', lef, sx0, True, 'x')
    side('오른', rig, sx1, False, 'x')
    hw, hh = rig - lef, bot - top
    print(f'   구멍 비율: 그림 {hw / hh:.3f}:1, 규칙 {s["w"] / s["h"]:.3f}:1 (게임 화면 844×390 = {844 / 390:.3f}:1)')
else:
    say(False, f'구멍 가운데 ({cx}, {cy}) 가 투명하지 않음 — 화면 구멍 자리가 통째로 다름')

band = np.zeros((H, W), bool)
band[sy0 - 24:sy1 + 24, sx0 - 24:sx1 + 24] = True
band[sy0:sy1, sx0:sx1] = False
cov = (a[band] > 200).mean()
say(cov > 0.95, f'앞면: 화면 둘레 24px 를 몸체가 덮음 ({cov:.0%})')
if cov <= 0.95:
    for name, ys, xs in [('위', slice(sy0 - 24, sy0), slice(sx0 - 24, sx1 + 24)), ('아래', slice(sy1, sy1 + 24), slice(sx0 - 24, sx1 + 24)),
                         ('왼', slice(sy0, sy1), slice(sx0 - 24, sx0)), ('오른', slice(sy0, sy1), slice(sx1, sx1 + 24))]:
        m = np.zeros((H, W), bool)
        m[ys, xs] = True
        b = bbox(m & (a <= 200))
        if b:
            print(f'   → 구멍 {name}쪽 테두리 24px 에 몸체가 없는 곳: x {b[0]}~{b[2]} · y {b[1]}~{b[3]}')
for n, b in P['buttons'].items():
    c = (xx - b['cx']) ** 2 + (yy - b['cy']) ** 2 <= b['touchR'] ** 2
    cv = (a[c] > 200).mean()
    say(cv > 0.9, f'앞면: 버튼 {n} 자리 (중심 ({b["cx"]}, {b["cy"]}) 지름 {b["touchR"] * 2}) 그림 있음 ({cv:.0%})')
    if cv <= 0.9:
        m = bbox(c & (a <= 200))
        print(f'   → 버튼 {n} 누름 영역에 몸체가 없는 곳: x {m[0]}~{m[2]} · y {m[1]}~{m[3]} (버튼은 몸체 위에 있어야 함)')
if ring:
    ring_hole(a, *ring, '앞면')
if len(args) > 1:
    b = load(args[1])
    if ring:
        ring_hole(b, W - 1 - ring[0], ring[1], '뒷면(좌우 반전)')

out = {'screen': P['itemsJson']['screen'], 'buttons': P['itemsJson']['buttons']}
if ring:
    out['ring'] = {'x': round(ring[0] / W * 100, 2), 'y': round(ring[1] / H * 100, 2)}
print('\nitems.json 의 devices 줄에 넣을 좌표(%):')
print(json.dumps(out, ensure_ascii=False))
sys.exit(0 if ok else 1)
