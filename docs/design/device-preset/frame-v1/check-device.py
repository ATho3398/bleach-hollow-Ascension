"""기기 그림 규격(frame-v1) 검사
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

a = load(args[0])
s = P['screen']
say(a[s['y']:s['y'] + s['h'], s['x']:s['x'] + s['w']].max() == 0, '앞면: 화면 구멍 완전 투명')
band = np.zeros((H, W), bool)
band[s['y'] - 24:s['y'] + s['h'] + 24, s['x'] - 24:s['x'] + s['w'] + 24] = True
band[s['y']:s['y'] + s['h'], s['x']:s['x'] + s['w']] = False
say((a[band] > 200).mean() > 0.95, f'앞면: 화면 둘레 24px 를 몸체가 덮음 ({(a[band] > 200).mean():.0%})')
for n, b in P['buttons'].items():
    c = (xx - b['cx']) ** 2 + (yy - b['cy']) ** 2 <= b['touchR'] ** 2
    say((a[c] > 200).mean() > 0.9, f'앞면: 버튼 {n} 자리 그림 있음 ({(a[c] > 200).mean():.0%})')
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
