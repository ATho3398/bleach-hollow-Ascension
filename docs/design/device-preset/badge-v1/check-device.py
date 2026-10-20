"""기기 규격 프리셋 검사: python3 check-device.py <앞면.png> [뒷면.png]
같은 폴더의 preset.json·silhouette-*.png 와 비교해 규격을 지켰는지 본다."""
import json, sys, os
import numpy as np
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
P = json.load(open(os.path.join(HERE, 'preset.json'), encoding='utf-8'))
W, H = P['canvas']['w'], P['canvas']['h']

def alpha(path):
    im = Image.open(path).convert('RGBA')
    if im.size != (W, H):
        sys.exit(f'✗ {path}: 크기 {im.size[0]}×{im.size[1]} — 규격은 {W}×{H}')
    return np.array(im)[:, :, 3]

def check(path, side):
    a = alpha(path)
    mask = np.array(Image.open(os.path.join(HERE, f'silhouette-{side}.png')))[:, :, 3] > 0
    ok = True
    def say(good, msg):
        nonlocal ok
        ok &= good
        print(('✓ ' if good else '✗ ') + msg)
    yy, xx = np.ogrid[:H, :W]
    r = P['ring']
    rx = r['cx'] if side == 'front' else W - 1 - r['cx']
    hole = (xx - rx) ** 2 + (yy - r['cy']) ** 2 <= r['holeR'] ** 2
    body = mask.copy()
    if side == 'front':
        s = P['screen']
        body[s['y']:s['y'] + s['h'], s['x']:s['x'] + s['w']] = True
    body |= hole
    outside = (a > 16) & ~body
    say(outside.sum() < W * H * 0.001, f'{side}: 외곽 밖 그림 {outside.sum()}px (실루엣 밖은 투명이어야 함)')
    inside = body & ~hole
    if side == 'front':
        inside[s['y']:s['y'] + s['h'], s['x']:s['x'] + s['w']] = False
    empty = (a < 200) & inside
    say(empty.sum() < inside.sum() * 0.01, f'{side}: 실루엣 안 빈 곳 {empty.sum()}px (몸체는 불투명이어야 함)')
    core = (xx - rx) ** 2 + (yy - r['cy']) ** 2 <= (r['holeR'] - 3) ** 2  # 가장자리 안티앨리어싱 제외
    say(a[core].max() == 0, f'{side}: 고리 구멍 투명')
    if side == 'front':
        say(a[s['y']:s['y'] + s['h'], s['x']:s['x'] + s['w']].max() == 0, '앞면: 화면 구멍 완전 투명')
    return ok

good = check(sys.argv[1], 'front')
if len(sys.argv) > 2:
    good &= check(sys.argv[2], 'back')
print('\nitems.json 의 devices 줄에 넣을 좌표(%):')
print(json.dumps(P['itemsJson'], ensure_ascii=False))
sys.exit(0 if good else 1)
