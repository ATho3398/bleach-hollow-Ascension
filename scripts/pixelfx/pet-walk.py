# 걷는 펫 (C.488): 사용자가 찍은 옆모습 한 장을 잘라 제자리 걸음으로 만든다 — 다리(아래로 갈수록 앞뒤로 밀림) · 뒤쪽 다리(같은 다리를 어둡게, 반대 박자) · 꼬리 살랑 · 몸 들썩.
# 사용: python3 scripts/pixelfx/pet-walk.py <펫 이름> <한 장.png> <out.webp>   (펫별 자리 = CFG, 좌표는 그림 칸)
import sys, math, numpy as np
from PIL import Image
CFG = {
    # legs: (x0, x1, 엉덩이 줄 — 이 줄 아래가 다리) · tail: x ≤ xmax, y < base 인 칸(top 쪽이 많이 흔들림)
    'yoruichi-cat-walk': dict(legs=[(12, 17, 30), (25, 30, 30)], tail=dict(xmax=15, base=24, top=11, amp=2), stride=3),
    'kukkapuro-walk': dict(legs=[(5, 11, 30), (27, 32, 30)], tail=dict(xmax=9, base=24, top=15, amp=2), stride=3),
}
name, src, out = sys.argv[1], sys.argv[2], sys.argv[3]; c = CFG[name]
a = np.array(Image.open(src).convert('RGBA')); a[a[..., 3] < 128] = 0; a[..., 3] = np.where(a[..., 3] > 0, 255, 0)
H, W = a.shape[:2]; yy, xx = np.mgrid[0:H, 0:W]; op = a[..., 3] > 0
bottom = np.where(op.any(1))[0].max()
legs = [op & (xx >= x0) & (xx <= x1) & (yy > hip) for x0, x1, hip in c['legs']]
T = c['tail']; tail = op & (xx <= T['xmax']) & (yy < T['base'])
body = a.copy()
for m in legs + [tail]: body[m] = 0
far = a.copy(); far[..., :3] = (far[..., :3] * 0.55).astype(np.uint8)      # 뒤쪽 다리 = 어둡게
D, STEPT, FRAME = 2.4, 0.6, 100; N = int(D * 1000 / FRAME); frames = []
PAD = c['stride'] + 1
def put(f, src_img, mask, hip, ph, dy):
    for y in range(H):
        if not mask[y].any(): continue
        k = (y - hip) / max(1, bottom - hip)                  # 엉덩이 0 → 발 1
        dx = round(c['stride'] * math.sin(ph) * k)
        lift = 1 if (math.cos(ph) > 0.5 and y >= bottom - 1) else 0   # 앞으로 내딛는 발끝은 살짝 든다
        for x in np.where(mask[y])[0]:
            ty, tx = y - lift, x + dx + PAD
            if 0 <= ty < H and 0 <= tx < W + 2 * PAD: f[ty, tx] = src_img[y, x]
            # 몸이 들썩여 올라간 만큼 다리 맨 윗줄을 위로 이어 붙인다 (C.490 — 몸과 다리 사이가 한 줄 끊겨 보이던 것)
            if y == hip + 1:
                for g in range(1, -dy + 1):
                    if 0 <= ty - g < H and 0 <= tx < W + 2 * PAD: f[ty - g, tx] = src_img[y, x]
for i in range(N):
    t = i * FRAME / 1000; ph = t / STEPT * 2 * math.pi
    bob = -1 if math.sin(ph * 2) > 0.3 else 0
    f = np.zeros((H, W + 2 * PAD, 4), np.uint8)
    for j, (m, (x0, x1, hip)) in enumerate(zip(legs, c['legs'])): put(f, far, m, hip, ph + math.pi * (j + 1), bob)      # 뒤쪽 다리(먼저)
    sw = math.sin(t / D * 2 * math.pi * 2)
    for y in range(H):                                        # 꼬리
        k = max(0, min(1, (T['base'] - y) / (T['base'] - T['top']))); dx = round(sw * T['amp'] * k ** 1.3)
        for x in np.where(tail[y])[0]:
            if 0 <= y + bob < H: f[y + bob, x + dx + PAD] = a[y, x]
    ys, xs = np.where(body[..., 3] > 0)
    f[ys + bob, xs + PAD] = body[ys, xs]                      # 몸
    for j, (m, (x0, x1, hip)) in enumerate(zip(legs, c['legs'])): put(f, a, m, hip, ph + math.pi * j, bob)            # 앞쪽 다리
    frames.append(Image.fromarray(f))
frames[0].save(out, save_all=True, append_images=frames[1:], duration=FRAME, loop=0, lossless=True)
FW = W + 2 * PAD
cs = Image.new('RGBA', (FW * 4 * 8, H * 4), (96, 110, 128, 255))
for i in range(8): cs.alpha_composite(frames[i * N // 8].resize((FW * 4, H * 4), 0), (i * FW * 4, 0))
cs.save(out.replace('.webp', '') + '-preview.png'); print(out, (FW, H), N, '장')
