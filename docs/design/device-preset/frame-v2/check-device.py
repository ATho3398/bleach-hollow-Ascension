"""기기 그림 검사 (frame-v2, GDD 33-2): UI 묶음(화면 구멍 + 버튼 4개)과 몸체가 덮을 곳만 본다. 그림 크기·모양·구멍 위치는 자유.
  python3 check-device.py <앞면.png> [뒷면.png] [--hole X,Y] [--ring X,Y] [--item device-id]
    --hole  구멍 왼쪽 위(그림 픽셀). 없으면 --item(items.json 의 hole)을 읽고, 그것도 없으면 그림에서 투명 구멍을 찾아 그 왼쪽 위를 쓴다
    --ring  앞면 고리 구멍 중심(그림 픽셀) — 그 구멍이 투명한지 본다
  규격(×3): 구멍 1938×1080 완전 투명, 구멍 둘레 72px·버튼 4개 자리는 몸체. 어긋나면 어디가 몇 px 틀렸는지 말한다.
  옛 규격(frame-v1)은 `--frame v1`."""
import json, os, sys, subprocess
from collections import deque
import numpy as np
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
argv = sys.argv[1:]
if '--frame' in argv and argv[argv.index('--frame') + 1] == 'v1':
    rest = [a for i, a in enumerate(argv) if a != '--frame' and (i == 0 or argv[i - 1] != '--frame')]
    sys.exit(subprocess.call([sys.executable, os.path.join(HERE, '..', 'frame-v1', 'check-device.py'), *rest]))
def take(flag):
    if flag in argv:
        i = argv.index(flag); v = argv[i + 1]; del argv[i:i + 2]; return v
    return None
hole_arg, ring_arg, item_arg = take('--hole'), take('--ring'), take('--item')
args = [a for a in argv if not a.startswith('--')]
if not args:
    sys.exit(__doc__)
P = json.load(open(os.path.join(HERE, 'preset.json'), encoding='utf-8'))
X3 = P['x3']; HW, HH = X3['hole']['w'], X3['hole']['h']; R = X3['hole']['radius']; M = X3['cover']; MAXS = P['maxSide']

ok = True
def say(good, msg):
    global ok
    ok &= bool(good)
    print(('✓ ' if good else '✗ ') + msg)
def bbox(mask):
    ys, xs = np.nonzero(mask)
    return (xs.min(), ys.min(), xs.max(), ys.max()) if len(xs) else None

im = Image.open(args[0]).convert('RGBA')
W, H = im.size
a = np.array(im)[:, :, 3]
name = os.path.basename(args[0])
say(max(W, H) <= MAXS * 1.05, f'{name}: 크기 {W}×{H} (자유, 한 변 약 {MAXS}px 까지)')
if max(W, H) > MAXS * 1.05:
    print(f'   → 긴 변이 {max(W, H) - MAXS}px 넘음. 상한은 안내값이지만 너무 크면 느려진다')

# ── 구멍 왼쪽 위 정하기 ──
def read_item(item):
    for d in json.load(open(os.path.join(HERE, '..', '..', '..', '..', 'src', 'data', 'shop', 'items.json'), encoding='utf-8'))['devices']:
        if d['id'] == item and d.get('hole'):
            return tuple(d['hole'])
    sys.exit(f'items.json 에 {item} 의 hole 이 없다')
def find_hole():
    """그림 안(가장자리에 안 닿는) 가장 큰 투명 덩어리의 가운데 → 그 가운데에서 픽셀 단위로 구멍 가장자리를 잰다"""
    s = 6
    hh, ww = H // s, W // s
    small = a[:hh * s, :ww * s].reshape(hh, s, ww, s).max(axis=(1, 3)) == 0
    seen = np.zeros_like(small)
    best = None
    for y0 in range(hh):
        for x0 in range(ww):
            if not small[y0, x0] or seen[y0, x0]:
                continue
            q = deque([(y0, x0)]); seen[y0, x0] = True; cells = []; edge = False
            while q:
                y, x = q.popleft(); cells.append((y, x))
                if y in (0, hh - 1) or x in (0, ww - 1): edge = True
                for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                    ny, nx = y + dy, x + dx
                    if 0 <= ny < hh and 0 <= nx < ww and small[ny, nx] and not seen[ny, nx]:
                        seen[ny, nx] = True; q.append((ny, nx))
            if not edge and (best is None or len(cells) > len(best)):
                best = cells
    if not best:
        return None
    ys = [c[0] for c in best]; xs = [c[1] for c in best]
    return ((min(xs) + max(xs) + 1) * s // 2, (min(ys) + max(ys) + 1) * s // 2)

def measure(cx, cy):
    """가운데 (cx, cy) 에서 이어진 투명 영역의 실제 구멍 사각형(둥근 모서리도 잡도록 여러 줄·열을 본다)"""
    def edge(line, start, step):
        i = start
        while 0 <= i + step < len(line) and line[i + step] == 0:
            i += step
        return i
    cols = range(max(0, cx - HW // 2 + 8), min(W, cx + HW // 2 - 8), 16)
    rows = range(max(0, cy - HH // 2 + 8), min(H, cy + HH // 2 - 8), 16)
    top = min(edge(a[:, x], cy, -1) for x in cols if a[cy, x] == 0)
    bot = max(edge(a[:, x], cy, 1) for x in cols if a[cy, x] == 0) + 1
    lef = min(edge(a[y, :], cx, -1) for y in rows if a[y, cx] == 0)
    rig = max(edge(a[y, :], cx, 1) for y in rows if a[y, cx] == 0) + 1
    return lef, top, rig, bot

if hole_arg:
    hx, hy = (int(v) for v in hole_arg.split(','))
    src_note = '--hole'
elif item_arg:
    hx, hy = read_item(item_arg); src_note = f'{item_arg} (items.json)'
else:
    c = find_hole()
    if not c:
        say(False, '그림에서 투명 화면 구멍을 못 찾음 — 구멍이 가장자리에 닿았거나 불투명. 구멍 위치를 --hole X,Y 로 알려 주세요')
        sys.exit(1)
    if a[c[1], c[0]] != 0:
        say(False, '구멍 후보 가운데가 투명하지 않음'); sys.exit(1)
    lef, top, rig, bot = measure(*c)
    hx, hy = lef, top; src_note = '그림에서 찾은 구멍 왼쪽 위'
    print(f'   구멍을 그림에서 찾음: ({lef}, {top}) {rig - lef}×{bot - top}')
print(f'   구멍 왼쪽 위 hole = [{hx}, {hy}] ({src_note})')

# ── 1. 화면 구멍 ──
sx0, sy0, sx1, sy1 = hx, hy, hx + HW, hy + HH
inb = sx0 >= 0 and sy0 >= 0 and sx1 <= W and sy1 <= H
say(inb, f'구멍 ({sx0}, {sy0}) {HW}×{HH} 이 그림 안에 있음')
if not inb:
    print(f'   → 그림 {W}×{H} 밖으로 나감: 왼쪽 {max(0, -sx0)} · 위 {max(0, -sy0)} · 오른쪽 {max(0, sx1 - W)} · 아래 {max(0, sy1 - H)}px')
    sys.exit(1)
yy, xx = np.ogrid[sy0:sy1, sx0:sx1]
dx = np.maximum(np.maximum(sx0 + R - xx, xx - (sx1 - 1 - R)), 0)
dy = np.maximum(np.maximum(sy0 + R - yy, yy - (sy1 - 1 - R)), 0)
inside = np.where(dx * dx + dy * dy <= R * R, a[sy0:sy1, sx0:sx1], 0)
say(inside.max() == 0, f'화면 구멍 안이 완전 투명 (모서리 반지름 {R} 은 둥글어도 됨)')
if inside.max() != 0:
    b = bbox(inside > 0)
    print(f'   → 구멍 안에 그림이 있음: x {sx0 + b[0]}~{sx0 + b[2]} · y {sy0 + b[1]}~{sy0 + b[3]} 를 투명하게 지워야 함')
cx, cy = (sx0 + sx1) // 2, (sy0 + sy1) // 2
if a[cy, cx] == 0:
    lef, top, rig, bot = measure(cx, cy)
    print(f'   그림의 실제 구멍: ({lef}, {top}) {rig - lef}×{bot - top} (규격 ({sx0}, {sy0}) {HW}×{HH})')
    def side(nm, have, want, grow_is_out, axis):
        d = have - want
        if d == 0:
            return say(True, f'화면 구멍 {nm} 가장자리 = 규격 그대로 ({want})')
        out = (d < 0) == grow_is_out
        lo, hi = sorted((have, want))
        if out:
            say(False, f'화면 구멍 {nm}쪽이 {abs(d)}px 더 큼 (기준 {abs(d) / 3:.1f}px): {axis} {lo}~{hi - 1} 가 투명 → 불투명(테두리)이어야 함')
        else:
            say(False, f'화면 구멍 {nm}쪽이 {abs(d)}px 작음 (기준 {abs(d) / 3:.1f}px): {axis} {lo}~{hi - 1} 가 불투명 → 투명이어야 함')
    side('위', top, sy0, True, 'y'); side('아래', bot, sy1, False, 'y'); side('왼', lef, sx0, True, 'x'); side('오른', rig, sx1, False, 'x')
    print(f'   구멍 크기: 그림 {rig - lef}×{bot - top}, 규격 {HW}×{HH} (가로 {rig - lef - HW:+d}px · 세로 {bot - top - HH:+d}px)')
else:
    say(False, f'구멍 가운데 ({cx}, {cy}) 가 투명하지 않음 — 화면 구멍 자리가 통째로 다름')

# ── 3. 몸체가 덮을 곳: 구멍 둘레 72px (그림 안 부분만) ──
band = np.zeros((H, W), bool)
band[max(0, sy0 - M):min(H, sy1 + M), max(0, sx0 - M):min(W, sx1 + M)] = True
band[sy0:sy1, sx0:sx1] = False
cov = (a[band] > 200).mean()
say(cov > 0.95, f'구멍 둘레 {M}px 를 몸체가 덮음 ({cov:.0%})')
if cov <= 0.95:
    for nm, ys, xs in [('위', slice(max(0, sy0 - M), sy0), slice(max(0, sx0 - M), min(W, sx1 + M))), ('아래', slice(sy1, min(H, sy1 + M)), slice(max(0, sx0 - M), min(W, sx1 + M))),
                       ('왼', slice(sy0, sy1), slice(max(0, sx0 - M), sx0)), ('오른', slice(sy0, sy1), slice(sx1, min(W, sx1 + M)))]:
        mk = np.zeros((H, W), bool); mk[ys, xs] = True
        b = bbox(mk & (a <= 200))
        if b:
            print(f'   → 구멍 {nm}쪽 테두리 {M}px 에 몸체가 없는 곳: x {b[0]}~{b[2]} · y {b[1]}~{b[3]}')
    if sx0 - M < 0 or sy0 - M < 0 or sx1 + M > W or sy1 + M > H:
        print('   → 구멍 둘레 72px 가 그림 밖으로 나가는 쪽이 있음: 구멍을 그림 안쪽으로 옮기거나 그림을 키우세요')

# ── 버튼 4개 (구멍 기준 상대 위치) ──
Y, Xg = np.ogrid[:H, :W]
for n, b in X3['buttons'].items():
    bx, by, r = hx + b['dx'], hy + b['dy'], b['touchR']
    c = (Xg - bx) ** 2 + (Y - by) ** 2 <= r ** 2
    inb_btn = bx - r >= 0 and by - r >= 0 and bx + r <= W and by + r <= H
    if not inb_btn:
        say(False, f'버튼 {n} 자리 (중심 ({bx:g}, {by:g}) 지름 {r * 2:g}) 가 그림 밖으로 나감 — 구멍을 안쪽으로 옮기거나 그림을 키우세요')
        continue
    cv = (a[c] > 200).mean()
    say(cv > 0.9, f'버튼 {n} 자리 (중심 ({bx:g}, {by:g}) 지름 {r * 2:g}) 에 그림 있음 ({cv:.0%})')
    if cv <= 0.9:
        m = bbox(c & (a <= 200))
        print(f'   → 버튼 {n} 누름 영역에 몸체가 없는 곳: x {m[0]}~{m[2]} · y {m[1]}~{m[3]} (버튼은 몸체 위에 있어야 함)')

# ── 고리·뒷면 ──
def ring_hole(arr, rx, ry, label):
    rx, ry = max(0, min(arr.shape[1] - 1, rx)), max(0, min(arr.shape[0] - 1, ry))
    yy2, xx2 = np.ogrid[:arr.shape[0], :arr.shape[1]]
    core = (xx2 - rx) ** 2 + (yy2 - ry) ** 2 <= 15 ** 2
    say(arr[core].max() == 0, f'{label}: 고리 구멍 ({rx}, {ry}) 투명')
ring = tuple(int(v) for v in ring_arg.split(',')) if ring_arg else None
if ring:
    ring_hole(a, *ring, '앞면')
if len(args) > 1:
    ib = Image.open(args[1]).convert('RGBA')
    say(ib.size == (W, H), f'{os.path.basename(args[1])}: 앞면과 같은 크기 {ib.size[0]}×{ib.size[1]} (앞면 {W}×{H})')
    if ring and ib.size == (W, H):
        ring_hole(np.array(ib)[:, :, 3], W - 1 - ring[0], ring[1], '뒷면(좌우 반전)')

print('\nitems.json 의 devices 줄에 넣을 것 (화면·버튼 크기·자리는 규격이라 적지 않는다):')
out = {'frame': 'v2', 'hole': [hx, hy]}
if ring:
    out['ring'] = {'x': round(ring[0] / W * 100, 2), 'y': round(ring[1] / H * 100, 2)}
print(json.dumps(out, ensure_ascii=False))
sys.exit(0 if ok else 1)
