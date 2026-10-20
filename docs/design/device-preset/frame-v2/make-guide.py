"""frame-v2 가이드 생성 (GDD 33-2): preset.json, layout-guide.png(UI 묶음 스티커, 실제 ×3 크기), 예시 모양 3장.
  python3 make-guide.py
고정 = UI 묶음 하나(화면 구멍 + 버튼 4개의 크기·구멍 기준 상대 위치 — 기본형 평소 화면 844×390 실측 그대로). 나머지(그림 크기·모양·구멍 위치·고리·재질·뒷면)는 자유.
게임 코드의 같은 값: src/data/shop/frameV2.ts"""
import json, math, os
from PIL import Image, ImageDraw, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
K = 3  # 그림 1 논리 px = 그림 픽셀 3개
HOLE = {'w': 646, 'h': 360, 'radius': 11}
COVER = 24  # ×3 = 72
# 버튼 사각형: 구멍 왼쪽 위 (0,0) 기준 논리 px
BUTTONS = {
    'up': {'x': -79, 'y': 120, 'w': 52, 'h': 52},
    'down': {'x': -79, 'y': 188, 'w': 52, 'h': 52},
    'ok': {'x': 667, 'y': 118, 'w': 64, 'h': 64},
    'back': {'x': 677, 'y': 198, 'w': 44, 'h': 44},
}
BUNDLE = {'x': -79, 'y': 0, 'w': 810, 'h': 360}
NAMES = {'up': '위', 'down': '아래', 'ok': '확정', 'back': '뒤로'}

def build_preset():
    x3 = {
        'hole': {'w': HOLE['w'] * K, 'h': HOLE['h'] * K, 'radius': HOLE['radius'] * K, 'inside': '완전 투명(알파 0)'},
        'cover': COVER * K,
        'buttons': {n: {'dx': (b['x'] + b['w'] / 2) * K, 'dy': (b['y'] + b['h'] / 2) * K, 'touchR': b['w'] * K / 2,
                        'rect': {a: b[a] * K for a in 'xywh'}} for n, b in BUTTONS.items()},
        'bundle': {a: BUNDLE[a] * K for a in 'xywh'},
        'note': 'dx·dy = 구멍 왼쪽 위 (hole x, y)에서 버튼 가운데까지(그림 픽셀). 버튼 누름 영역 = 가운데 ± touchR',
    }
    return {
        'preset': 'frame-v2',
        'name': '기기 그림 규격 v2 — UI 묶음만 고정, 모양·크기 자유 (GDD 33-2)',
        'note': '기본형(CSS 기기) 평소 화면을 가로 844×390 에서 DOM 으로 잰 값(GDD 33-1). 고정 = UI 묶음(화면 구멍 + 버튼 4개의 크기와 구멍 기준 상대 위치). '
                '그림 크기(한 변 약 4000px 이하)·기기 모양·묶음을 그림 안 어디에 둘지(구멍 왼쪽 위 hole)·고리·재질·뒷면은 자유. 그림 1 논리 px = 그림 픽셀 3개(×3).',
        'scale': K,
        'maxSide': 4000,
        'base': {'unit': '논리 px (기본형 844×390 기준, ×1)', 'hole': HOLE, 'cover': COVER, 'buttons': BUTTONS, 'bundle': BUNDLE},
        'x3': x3,
        'measured': {
            'viewport': '가로 844×390 · 세로 출력(390×844) · PC 1688×780(1배) 모두 기기 안 좌표가 같음',
            'device': {'x': 0, 'y': 0, 'w': 844, 'h': 390},
            'lcd': {'x': 99, 'y': 15, 'w': 646, 'h': 360, 'radius': {'hollow': 11, 'shinigami': 4}},
            'buttons(기기 좌표)': {'up': [20, 135, 52, 52], 'down': [20, 203, 52, 52], 'ok': [766, 133, 64, 64], 'back': [776, 213, 44, 44]},
            'note': '구멍 기준 상대 위치 = 기기 좌표 − LCD(99, 15)',
        },
        'fixed': ['화면 구멍 = 1938×1080(×3), 완전 투명, 모서리 반지름 약 33', '버튼 4개 크기(위·아래 156, 확정 192, 뒤로 132)와 구멍 기준 상대 위치(x3.buttons)', '몸체가 덮을 곳: 구멍 둘레 72px·버튼 4개 누름 영역'],
        'free': ['그림 크기(가로·세로 아무 값, 한 변 약 4000px 까지)', '기기 모양(사각형 아님: 하트·동그라미·비대칭…)', 'UI 묶음 위치(그림마다 구멍 왼쪽 위 hole 만 정함)', '고리 위치', '재질·색·문양·버튼 모양', '뒷면'],
        'itemsJson': {'frame': 'v2', 'hole': '[구멍 왼쪽 위 x, y] 그림 픽셀', 'ring': '{ x: 고리x/그림가로*100, y: 고리y/그림세로*100 }', 'note': '화면·버튼 크기·자리는 규격이라 적지 않는다'},
    }

def font(size):
    for p in ['/usr/share/fonts/truetype/wqy/wqy-zenhei.ttc', '/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc']:
        if os.path.exists(p):
            return ImageFont.truetype(p, size)
    return ImageFont.load_default()

def draw_bundle(d, ox, oy, k, labels=True, hole_fill=True, f=None, fs=None):
    """UI 묶음을 그린다: (ox, oy) = 구멍 왼쪽 위(그림 픽셀), k = 논리 px → 그림 픽셀 배율"""
    hw, hh = HOLE['w'] * k, HOLE['h'] * k
    m = COVER * k
    d.rectangle((ox - m, oy - m, ox + hw + m - 1, oy + hh + m - 1), outline=(170, 90, 220, 220), width=max(1, round(k)))
    d.rounded_rectangle((ox, oy, ox + hw - 1, oy + hh - 1), radius=HOLE['radius'] * k, fill=(60, 120, 255, 50 if hole_fill else 0), outline=(60, 120, 255, 255), width=max(1, round(2 * k)))
    for n, b in BUTTONS.items():
        cx, cy, r = ox + (b['x'] + b['w'] / 2) * k, oy + (b['y'] + b['h'] / 2) * k, b['w'] * k / 2
        d.ellipse((cx - r, cy - r, cx + r, cy + r), fill=(255, 60, 60, 80), outline=(255, 60, 60, 255), width=max(1, round(2 * k)))
        if labels:
            left = n in ('up', 'down')
            ax, an = (cx + r + 5 * k, 'lm') if left else (cx - r - 5 * k, 'rm')
            d.text((ax, cy - 6 * k), f'{NAMES[n]} 버튼', fill=(255, 90, 90, 255), font=fs, anchor=an)
            d.text((ax, cy + 6 * k), f'지름 {b["w"] * K // 1:g}', fill=(255, 90, 90, 255), font=fs, anchor=an)

def sticker():
    """layout-guide.png: UI 묶음 스티커 — 실제 ×3 크기, 투명 배경. 구멍 왼쪽 위가 스티커 안 (79×3, 0)"""
    W, H = BUNDLE['w'] * K, BUNDLE['h'] * K
    im = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(im, 'RGBA')
    f, fs = font(11 * K), font(9 * K)
    ox, oy = -BUNDLE['x'] * K, 0
    draw_bundle(d, ox, oy, K, True, True, f, fs)
    hw, hh = HOLE['w'] * K, HOLE['h'] * K
    d.text((ox + hw / 2, oy + hh / 2 - 22 * K), '화면 구멍 (완전 투명)', fill=(60, 120, 255, 255), font=f, anchor='mm')
    d.text((ox + hw / 2, oy + hh / 2), f'{hw}×{hh}  (그림 {K}배)', fill=(60, 120, 255, 255), font=fs, anchor='mm')
    d.text((ox + hw / 2, oy + hh / 2 + 22 * K), '구멍 왼쪽 위 = 이 스티커의 (237, 0) → items.json hole 에 그림 속 좌표', fill=(60, 120, 255, 255), font=fs, anchor='mm')
    d.text((ox + hw / 2, oy + hh - 6 * K), f'보라 = 구멍 둘레 {COVER * K}px 는 몸체가 있어야 함', fill=(170, 90, 220, 255), font=fs, anchor='mb')
    d.text((6 * K, 6 * K), f'UI 묶음 스티커 {W}×{H} (실제 크기)', fill=(120, 120, 120, 255), font=fs, anchor='lt')
    im.save(os.path.join(HERE, 'layout-guide.png'), optimize=True)

def example(name, size, shape_fn, hole_xy, ring_xy):
    """예시 모양 그림: 그림 픽셀 size, shape_fn(d) 로 몸체, 구멍 왼쪽 위 hole_xy(그림 픽셀), 1/3 로 줄여 저장"""
    W, H = size
    im = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(im, 'RGBA')
    shape_fn(d, W, H)
    draw_bundle(d, hole_xy[0], hole_xy[1], K, False, False, None, None)
    # 구멍 안 투명 표시
    hh = ImageDraw.Draw(im, 'RGBA')
    rx, ry = ring_xy
    hh.ellipse((rx - 36, ry - 36, rx + 36, ry + 36), outline=(230, 150, 0, 255), width=9)
    fs = font(40)
    hh.text((W / 2, H - 30), f'{name}: 그림 {W}×{H} · hole = [{hole_xy[0]}, {hole_xy[1]}] (예시일 뿐)', fill=(230, 230, 230, 255), font=fs, anchor='mb')
    bg = Image.new('RGBA', (W, H), (30, 30, 34, 255))
    bg.alpha_composite(im)
    bg.convert('RGB').resize((W // 3, H // 3), Image.LANCZOS).save(os.path.join(HERE, f'example-{name}.png'), optimize=True)

def make_examples():
    body = (110, 118, 150, 255)
    edge = (200, 200, 210, 255)
    def round_(d, W, H):
        d.ellipse((0, 0, W - 1, H - 1), fill=body, outline=edge, width=24)
    example('round', (3600, 3600), round_, (831, 900), (1800, 150))
    def heart(d, W, H):
        r = W * 0.27
        d.ellipse((W * 0.5 - 2 * r + 20, H * 0.12, W * 0.5 + 20, H * 0.12 + 2 * r), fill=body)
        d.ellipse((W * 0.5 - 20, H * 0.12, W * 0.5 + 2 * r - 20, H * 0.12 + 2 * r), fill=body)
        d.polygon([(W * 0.5 - 2 * r + 60, H * 0.12 + 1.3 * r), (W * 0.5 + 2 * r - 60, H * 0.12 + 1.3 * r), (W * 0.5, H * 0.98)], fill=body)
    example('heart', (3600, 3300), heart, (831, 760), (1800, 330))
    def wide(d, W, H):
        d.rounded_rectangle((0, 0, W - 1, H - 1), radius=H // 2, fill=body, outline=edge, width=24)
    example('wide', (3900, 1500), wide, (800, 210), (3500, 750))

if __name__ == '__main__':
    json.dump(build_preset(), open(os.path.join(HERE, 'preset.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=2)
    sticker()
    make_examples()
    print('preset.json · layout-guide.png · example-*.png 생성')
