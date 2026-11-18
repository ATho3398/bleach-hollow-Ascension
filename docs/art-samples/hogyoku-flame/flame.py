# 64x64 구슬(orb_64.png) 뒤에 떠 있는 일렁이는 불꽃 — 구슬은 빼고 불꽃만, 8프레임 반복.
# 캔버스 96x96, 구슬 자리 = 가운데 아래쪽(구슬 64칸을 (16,24)에 놓으면 딱 맞음). 불꽃은 위로 더 길게 솟는다.
# 색은 구슬과 같은 무리(보라 테두리 → 연보라 → 하늘 → 옅은 심지) 4톤, 외곽선 없음(빛 이펙트).
import math
import numpy as np
from PIL import Image

import os
CALM = os.environ.get('CALM') == '1'      # 잔잔한 불꽃 (각성 전): 낮고 느리게 일렁임
OUT = 'flame_calm' if CALM else 'flame'
os.makedirs(OUT, exist_ok=True)
W = H = 96
FRAMES, MS = 16, (90 if CALM else 60)
OX, OY = 16, 24                       # 구슬 64x64 를 놓을 왼위 자리
CX, CY, R = OX + 31.5, OY + 31.5, 30.5  # 구슬 중심·반지름(외곽 포함)
TONES = [(0.80, (236, 240, 255)), (0.58, (186, 214, 248)), (0.38, (170, 146, 226)), (0.20, (110, 92, 180))]

TONES = [(0.86, (236, 240, 255)), (0.66, (186, 214, 248)), (0.44, (170, 146, 226)), (0.22, (110, 92, 180))]
EMBERS = [(30, 0.0), (44, 0.35), (58, 0.7), (66, 0.15), (38, 0.55), (52, 0.85)]   # 불씨: x 자리, 시작 위상

TONGUES = [  # 위로 솟는 불꽃 혀: (구슬 중심 기준 x, 폭, 높이, 흔들림 위상)
    (-24, 4.5, 12, 0.0), (-16, 5.0, 19, 1.7), (-7, 5.5, 25, 3.1), (2, 5.0, 28, 4.4),
    (11, 5.5, 23, 0.9), (19, 5.0, 17, 2.6), (26, 4.0, 11, 5.2),
]

def frame(t):
    img = np.zeros((H, W, 4), np.uint8)
    ph = 2 * math.pi * t                                   # 한 바퀴 = 반복 한 번 (이음매 없음)
    def height(xs):
        h = 0.0
        for c, w, hh, p in TONGUES:
            cc = CX + c + (0.8 if CALM else 1.6) * math.sin(ph + p)           # 혀가 좌우로 흔들림
            amp = hh * (0.78 + 0.22 * math.sin((1 if CALM else 2) * ph + p * 1.7))   # 혀 길이가 오르내림
            if CALM: amp *= 0.36                                # 잔잔: 혀가 훨씬 낮다
            h = max(h, amp * math.exp(-((xs - cc) / w) ** 2))
        return h
    for y in range(H):
        for x in range(W):
            dx, dy = x + 0.5 - CX, y + 0.5 - CY
            d = math.hypot(dx, dy)
            if d < R - 2.5: continue                       # 구슬에 가려지는 안쪽은 비운다
            th = math.atan2(dy, dx)
            # 1) 구슬을 감싸는 얇은 불꽃 테 (아래·옆)
            # 테의 물결은 한 방향으로 도는 게 아니라 아래(6시)에서 양옆을 타고 위로 올라간다 (사용자 2026-11-19 "아래 6시방향에서 시작해서 양쪽으로 올라갔다가 위에서 불타는게 맞지않나")
            up = abs(math.atan2(dx, dy))                    # 아래(6시) 0 → 양옆 π/2 → 위(12시) π, 좌우 같은 값
            ring = (2.4 + 1.2 * (0.5 + 0.5 * math.sin(9 * up - ph + 1.3)) ** 2) if CALM else (3.5 + 2.5 * (0.5 + 0.5 * math.sin(13 * up - 2 * ph + 1.3)) ** 2)
            k = 1 - (d - R) / ring
            # 2) 위로 솟는 혀: 위로 갈수록 좌우로 일렁인다
            lift = max(0.0, CY - (y + 0.5))
            xs = x + 0.5 - (0.8 if CALM else 1.8) * math.sin(0.33 * y + (1 if CALM else 2) * ph) * min(1.0, lift / R)
            ddx = xs - CX
            if abs(ddx) < R + 2:
                surf = CY - math.sqrt(max(0.0, R * R - ddx * ddx))   # 그 열의 구슬 윗면
                hgt = (2 if CALM else 3) + height(xs)
                above = surf - (y + 0.5)
                if -2 <= above <= hgt:
                    k = max(k, 1 - max(0.0, above) / hgt)
            k += (0.03 if CALM else 0.06) * math.sin(0.5 * y + (1 if CALM else 2) * ph + 0.3 * x)
            if d < R: k = max(k, 0.95)                     # 구슬 가장자리 바로 밑은 밝게 (틈 방지)
            for th_k, col in TONES:
                if k >= th_k:
                    img[y, x] = (*col, 255); break
    # 불씨: 위로 떠오르며 작아지다 사라진다 (프레임 반복에 맞춰 이음매 없이)
    for ex, off in (EMBERS[:2] if CALM else EMBERS):
        p = (t + off) % 1.0
        y = int(round(CY - R - 4 - p * (12 if CALM else 22)))
        x = int(round(ex + 2 * math.sin(2 * math.pi * (p * 2 + off))))
        col = TONES[1][1] if p < 0.5 else TONES[2][1]
        if 0 <= y < H and 0 <= x < W and img[y, x, 3] == 0:
            img[y, x] = (*col, 255)
            if p < 0.3 and y + 1 < H and img[y + 1, x, 3] == 0: img[y + 1, x] = (*TONES[2][1], 255)
    return Image.fromarray(img)

frames = [frame(i / FRAMES) for i in range(FRAMES)]
orb = Image.open('orb_64.png')
sheet = Image.new('RGBA', (W * FRAMES, H))
prev_fire, prev_both = [], []
for i, f in enumerate(frames):
    f.save(f'{OUT}/flame-{i + 1}.png'); sheet.paste(f, (W * i, 0))
    both = f.copy(); both.alpha_composite(orb, (OX, OY)); both.save(f'{OUT}/with-orb-{i + 1}.png')
    for lst, im in ((prev_fire, f), (prev_both, both)):
        bg = Image.new('RGBA', (W, H), (24, 22, 34, 255)); bg.alpha_composite(im)
        lst.append(bg.convert('RGB').resize((W * 4, H * 4), Image.NEAREST))
sheet.save(OUT + '/flame-sheet.png')
prev_fire[0].save(OUT + '/flame_x4.gif', save_all=True, append_images=prev_fire[1:], duration=MS, loop=0)
prev_both[0].save(OUT + '/with-orb_x4.gif', save_all=True, append_images=prev_both[1:], duration=MS, loop=0)
m = Image.new("RGB", (W * 4 * 4, H * 4 * (FRAMES // 4)))
for i in range(FRAMES): m.paste(prev_both[i], ((i % 4) * W * 4, (i // 4) * H * 4))
m.save(OUT + '/check.png')
print('ok')
