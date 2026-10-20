"""frame-v2 가이드 생성: preset.json(기준 px + 배율별 좌표)과 layout-guide.png(추천 배율, 실제 그림 크기)을 만든다.
  python3 make-guide.py            # 추천 ×3 (2688×1326)
기준값은 기본형(CSS 기기) 평소 화면을 844×390 에서 잰 값(GDD 33-1). 게임 코드의 같은 값: src/data/shop/frameV2.ts"""
import json, os, sys
from PIL import Image, ImageDraw, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
# ── 기준(×1) px: 왼쪽 위 = 그림 (0,0). 그림 한 장 = 기본형 몸체 896×442 (평소 화면 844×390 + 둘레 26) ──
BASE = {
    'canvas': {'w': 896, 'h': 442},
    'plain': {'x': 26, 'y': 26, 'w': 844, 'h': 390},
    'lcd': {'x': 125, 'y': 41, 'w': 646, 'h': 360},
    'buttons': {
        'up': {'x': 46, 'y': 161, 'w': 52, 'h': 52},
        'down': {'x': 46, 'y': 229, 'w': 52, 'h': 52},
        'ok': {'x': 792, 'y': 159, 'w': 64, 'h': 64},
        'back': {'x': 802, 'y': 239, 'w': 44, 'h': 44},
    },
}
SCALES = [2, 3, 4]
RECOMMENDED = 3
RING_EXAMPLE = {'x': 60, 'y': 14, 'note': '예시일 뿐 — 고리는 모양에 맞는 곳 아무 데나(그림 안). 정한 중심 (x, y)를 items.json ring % 로 적는다'}

def rect_k(r, k):
    return {a: r[a] * k for a in 'xywh'}

def button_k(b, k):
    cx, cy = (b['x'] + b['w'] / 2) * k, (b['y'] + b['h'] / 2) * k
    return {'cx': cx, 'cy': cy, 'touchR': b['w'] * k / 2, 'rect': rect_k(b, k)}

def build_preset():
    scales = {}
    for k in SCALES:
        scales[f'x{k}'] = {
            'canvas': {'w': BASE['canvas']['w'] * k, 'h': BASE['canvas']['h'] * k},
            'plain': rect_k(BASE['plain'], k),
            'screen': rect_k(BASE['lcd'], k),
            'buttons': {n: button_k(b, k) for n, b in BASE['buttons'].items()},
        }
    pct = lambda r: {'x': round(r['x'] / BASE['canvas']['w'] * 100, 2), 'y': round(r['y'] / BASE['canvas']['h'] * 100, 2),
                     'w': round(r['w'] / BASE['canvas']['w'] * 100, 2), 'h': round(r['h'] / BASE['canvas']['h'] * 100, 2)}
    return {
        'preset': 'frame-v2',
        'name': '기기 그림 규격 v2 (기본형 평소 화면 px 그대로)',
        'note': '기본형(CSS 기기) 평소 화면을 가로 844×390 에서 DOM 으로 잰 값(GDD 33-1). 그림 한 장 = 기본형 몸체 896×442(평소 화면 844×390 + 둘레 26px)의 정수배. '
                '평소 화면에서 그림 몸체가 기본형 몸체와 같은 배율·같은 자리로 놓이고, 다마고치 모드(줌아웃)에서는 둘레 26px 장식과 고리까지 보인다. 단위 px, 왼쪽 위 (0,0).',
        'base': {**BASE, 'unit': '기준 px (×1)'},
        'measured': {
            'viewport': '가로 844×390 · 세로 출력(390×844 → 기기를 90도 돌려 그림) · PC 1688×780(1배) 모두 기기 안 좌표가 같음',
            'device': {'x': 0, 'y': 0, 'w': 844, 'h': 390},
            'lcdFrame(베젤)': {'x': 92, 'y': 8, 'w': 660, 'h': 374, 'radius': {'hollow': 16, 'shinigami': 6}},
            'lcd': {'x': 99, 'y': 15, 'w': 646, 'h': 360, 'radius': {'hollow': 11, 'shinigami': 4}},
            'buttons(기기 좌표)': {
                'up': {'x': 20, 'y': 135, 'w': 52, 'h': 52, 'cx': 46, 'cy': 161, 'radius(모서리)': {'hollow': 16, 'shinigami': 6}},
                'down': {'x': 20, 'y': 203, 'w': 52, 'h': 52, 'cx': 46, 'cy': 229, 'radius(모서리)': {'hollow': 16, 'shinigami': 6}},
                'ok': {'x': 766, 'y': 133, 'w': 64, 'h': 64, 'cx': 798, 'cy': 165, 'radius(모서리)': '원(지름 64)'},
                'back': {'x': 776, 'y': 213, 'w': 44, 'h': 44, 'cx': 798, 'cy': 235, 'radius(모서리)': '원(지름 44)'},
            },
            'body(다마고치 모드 CSS 몸체, 기기 좌표)': {'x': -26, 'y': -26, 'w': 896, 'h': 442, 'radius': {'hollow': 48, 'shinigami': 18}},
            'ring(기본형 CSS 고리, 기기 좌표)': {'cx': -34, 'cy': -34, 'r': 11, 'note': '몸체 밖 모서리에서 비스듬히 나옴. v2 그림은 고리를 그림 안 아무 데나'},
            'toGuide': '그림 좌표 = 기기 좌표 + 26',
        },
        'recommended': f'x{RECOMMENDED}',
        'scales': scales,
        'ring': RING_EXAMPLE,
        'fixed': ['그림 크기 = 896×442 의 정수배(추천 ×3 = 2688×1326), 앞면·뒷면 같음', '화면 구멍(LCD) = 완전 투명, 위치·크기 그대로', '버튼 4개 자리(누름 영역 사각형)'],
        'free': ['몸체 바깥 모양·둘레 26px 장식(사각형 밖으로 튀어나와도 됨, 평소 화면에서는 안 보임)', '재질·색·문양', '고리 위치', '뒷면 그림'],
        'itemsJson': {'frame': 'v2', 'ring': '디자인마다 (x/896*100, y/442*100) — 화면·버튼 자리는 규격이라 적지 않는다'},
        'itemsJsonScreenPct(참고)': {'screen': pct(BASE['lcd']), 'buttons': {n: pct(b) for n, b in BASE['buttons'].items()}},
    }

def font(size):
    for p in ['/usr/share/fonts/truetype/wqy/wqy-zenhei.ttc', '/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc']:
        if os.path.exists(p):
            return ImageFont.truetype(p, size)
    return ImageFont.load_default()

def draw_guide(k):
    W, H = BASE['canvas']['w'] * k, BASE['canvas']['h'] * k
    im = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(im, 'RGBA')
    f, fs = font(11 * k), font(9 * k)
    P, L = BASE['plain'], BASE['lcd']
    # 몸체 윤곽(권장 예시): 평소 화면 + 둘레 26 전체 = 그림 전체
    d.rounded_rectangle((0, 0, W - 1, H - 1), radius=48 * k, outline=(150, 150, 150, 255), width=2 * k)
    # 안전 여백: 평소 화면 범위
    d.rectangle((P['x'] * k, P['y'] * k, (P['x'] + P['w']) * k - 1, (P['y'] + P['h']) * k - 1), outline=(40, 180, 80, 255), width=2 * k)
    d.text(((P['x'] + 6) * k, (P['y'] + 4) * k), '초록 = 평소 화면에 보이는 범위(844×390) · 둘레 26px 는 다마고치 모드에서만 보임', fill=(40, 180, 80, 255), font=fs)
    # 화면 구멍
    d.rounded_rectangle((L['x'] * k, L['y'] * k, (L['x'] + L['w']) * k - 1, (L['y'] + L['h']) * k - 1), radius=11 * k, fill=(60, 120, 255, 60), outline=(60, 120, 255, 255), width=2 * k)
    d.text(((L['x'] + L['w'] / 2) * k, (L['y'] + L['h'] / 2 - 14) * k), '화면 구멍 (투명)', fill=(60, 120, 255, 255), font=f, anchor='mm')
    d.text(((L['x'] + L['w'] / 2) * k, (L['y'] + L['h'] / 2 + 6) * k), f"{L['w']}×{L['h']} (×{k} = {L['w'] * k}×{L['h'] * k}) · 왼쪽 위 ({L['x'] * k}, {L['y'] * k})", fill=(60, 120, 255, 255), font=fs, anchor='mm')
    # 버튼
    names = {'up': '위', 'down': '아래', 'ok': '확정', 'back': '뒤로'}
    for n, b in BASE['buttons'].items():
        cx, cy, r = (b['x'] + b['w'] / 2) * k, (b['y'] + b['h'] / 2) * k, b['w'] * k / 2
        d.ellipse((cx - r, cy - r, cx + r, cy + r), fill=(255, 60, 60, 80), outline=(255, 60, 60, 255), width=2 * k)
        d.line((cx - 5 * k, cy, cx + 5 * k, cy), fill=(255, 60, 60, 255), width=k)
        d.line((cx, cy - 5 * k, cx, cy + 5 * k), fill=(255, 60, 60, 255), width=k)
        left = cx < W / 2
        ax, an = (cx + r + 5 * k, 'lm') if left else (cx - r - 5 * k, 'rm')
        d.text((ax, cy - 6 * k), f'{names[n]} 버튼', fill=(255, 90, 90, 255), font=fs, anchor=an)
        d.text((ax, cy + 6 * k), f"({cx / k:g}, {cy / k:g}) 지름 {b['w']}", fill=(255, 90, 90, 255), font=fs, anchor=an)
    # 고리 예시
    rx, ry = RING_EXAMPLE['x'] * k, RING_EXAMPLE['y'] * k
    d.ellipse((rx - 11 * k, ry - 11 * k, rx + 11 * k, ry + 11 * k), outline=(230, 150, 0, 255), width=2 * k)
    d.text((rx + 16 * k, ry), '고리 예시(자유): 어디든', fill=(230, 150, 0, 255), font=fs, anchor='lm')
    # 안전 여백(구멍 둘레 몸체)
    m = 24 * k
    d.rectangle((L['x'] * k - m, max(P['y'] * k, L['y'] * k - m), (L['x'] + L['w']) * k + m - 1, (L['y'] + L['h']) * k + m - 1), outline=(170, 90, 220, 200), width=k)
    d.text((W / 2, (L['y'] + L['h'] + 14) * k), '보라 = 구멍 둘레 24px 는 몸체가 있어야 함(안전 여백)', fill=(170, 90, 220, 255), font=fs, anchor='mt')
    d.text((W / 2, H - 4 * k), f'그림 크기 {W}×{H} = 896×442 × {k}', fill=(120, 120, 120, 255), font=fs, anchor='mb')
    return im

if __name__ == '__main__':
    preset = build_preset()
    json.dump(preset, open(os.path.join(HERE, 'preset.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=2)
    draw_guide(RECOMMENDED).save(os.path.join(HERE, 'layout-guide.png'), optimize=True)
    print('preset.json·layout-guide.png 생성', RECOMMENDED)
