# 검은 구슬(광택 없는 완전한 검정) + 흰 성스러운 후광. 32프레임, 느리게 반복.
# 후광: 폭이 일정한 빛줄기가 사방으로 곧게 뻗고, 끝이 뾰족해지는 게 아니라 멀어질수록 서서히 옅어지며 사라진다.
# 옅어짐은 실제 투명도(알파 8단계) + 도트식 점 섞기(바이엘 디더)로 단계 사이를 부드럽게.
# 캔버스 128x128, 구슬 64x64 는 가운데 (32,32). 후광 넓이는 처음의 절반. 후광은 구슬을 뺀 뒤쪽 층으로 따로도 저장.
import math, random
import numpy as np
from PIL import Image

W = H = 128
FRAMES, MS = 32, 100
CX = CY = 63.5; R = 30.5
BAYER = np.array([[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]]) / 16.0
LEVELS = 8
random.seed(11)
BEAMS = []      # 빛줄기: 각도, 길이, 반폭(px, 끝까지 일정), 밝기 위상
n = 36
for i in range(n):
    kind = i % 3
    ln = random.uniform(20, 23.5) if kind == 0 else random.uniform(14, 18) if kind == 1 else random.uniform(9, 12.5)
    hw = random.uniform(1.8, 2.6) if kind == 0 else random.uniform(1.1, 1.6) if kind == 1 else 0.9
    BEAMS.append((2 * math.pi * (i + random.uniform(-0.2, 0.2)) / n, ln, hw, random.uniform(0, 2 * math.pi)))
SPARKS = [(26, 28, 0.0), (102, 32, 0.3), (30, 100, 0.55), (100, 98, 0.8), (64, 12, 0.15), (14, 66, 0.65), (114, 64, 0.45)]

def orb():
    img = np.zeros((64, 64, 4), np.uint8)
    for y in range(64):
        for x in range(64):
            if math.hypot(x + 0.5 - 32, y + 0.5 - 32) <= 30.5: img[y, x] = (0, 0, 0, 255)   # 공허 같은 완전한 검정
    return Image.fromarray(img)

def aura(t):
    img = np.zeros((H, W, 4), np.uint8)
    ph = 2 * math.pi * t
    glow_r = 10 + 1.0 * math.sin(ph)                                   # 느리게 숨 쉬는 둥근 후광
    beams = [(math.cos(a), math.sin(a), ln * (0.92 + 0.08 * math.sin(ph + p)), hw, 0.72 + 0.28 * math.sin(ph + p * 1.7 + 1.0)) for a, ln, hw, p in BEAMS]
    for y in range(H):
        for x in range(W):
            dx, dy = x + 0.5 - CX, y + 0.5 - CY
            d = math.hypot(dx, dy)
            if d < R - 2.5: continue
            out = d - R
            a = max(0.0, 1 - out / glow_r) ** 1.6 * 0.95                # 후광: 구슬 가까이 밝고 고르게 옅어짐
            for ux, uy, ln, hw, br in beams:
                along = dx * ux + dy * uy
                if along <= 0: continue
                perp = abs(dx * uy - dy * ux)
                if perp > hw + 0.5 or out > ln: continue
                edge = 1.0 if perp <= hw - 0.5 else (hw + 0.5 - perp)   # 줄기 가장자리만 살짝 부드럽게, 폭은 끝까지 그대로
                a = max(a, br * edge * (1 - out / ln) ** 1.15)          # 길이 방향으로만 서서히 사라짐
            a *= 0.94 + 0.06 * math.sin(0.30 * out - ph)                # 바깥으로 번져 나가는 은은한 빛 물결
            if out < 0: a = 1.0
            if a <= 0.02: continue
            q = a * LEVELS
            lvl = int(q) + (1 if (q - int(q)) > BAYER[y % 4, x % 4] else 0)
            lvl = min(LEVELS, lvl)
            if lvl <= 0: continue
            img[y, x] = (255, 255, 255, round(255 * lvl / LEVELS)) if lvl >= 5 else (232, 238, 252, round(255 * lvl / LEVELS))
    for sx, sy, off in SPARKS:                                         # 십자 반짝이: 천천히 켜졌다 꺼진다
        p = (t + off) % 1.0
        if p < 0.36:
            big = 0.10 < p < 0.26
            pts = [(0, 0)] + ([(1, 0), (-1, 0), (0, 1), (0, -1)] if p > 0.04 and p < 0.32 else []) + ([(2, 0), (-2, 0), (0, 2), (0, -2)] if big else [])
            for ax, ay in pts: img[sy + ay, sx + ax] = (255, 255, 255, 255 if abs(ax) + abs(ay) < 2 else 190)
    return Image.fromarray(img)

o = orb(); o.save('holy/orb_black_64.png')
frames = [aura(i / FRAMES) for i in range(FRAMES)]
sheet = Image.new('RGBA', (W * FRAMES, H)); a_prev, b_prev = [], []
for i, f in enumerate(frames):
    f.save(f'holy/aura-{i + 1:02d}.png'); sheet.paste(f, (W * i, 0))
    both = f.copy(); both.alpha_composite(o, (32, 32)); both.save(f'holy/with-orb-{i + 1:02d}.png')
    for lst, im in ((a_prev, f), (b_prev, both)):
        bg = Image.new('RGBA', (W, H), (38, 40, 58, 255)); bg.alpha_composite(im); lst.append(bg.convert('RGB').resize((W * 3, H * 3), Image.NEAREST))
sheet.save('holy/aura-sheet.png')
a_prev[0].save('holy/aura_x3.gif', save_all=True, append_images=a_prev[1:], duration=MS, loop=0)
b_prev[0].save('holy/with-orb_x3.gif', save_all=True, append_images=b_prev[1:], duration=MS, loop=0)
m = Image.new('RGB', (W * 3 * 2, H * 3 * 2))
for k, i in enumerate((0, 8, 16, 24)): m.paste(b_prev[i], ((k % 2) * W * 3, (k // 2) * H * 3))
m.save('holy/check.png'); print('ok')
