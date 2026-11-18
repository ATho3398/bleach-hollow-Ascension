# 걷는 펫 (C.488): 사용자가 찍은 옆모습 한 장을 잘라 제자리 걸음으로 만든다 — 다리(아래로 갈수록 앞뒤로 밀림) · 뒤쪽 다리(같은 다리를 어둡게, 반대 박자) · 꼬리 살랑 · 몸 들썩.
# 사용: python3 scripts/pixelfx/pet-walk.py <펫 이름> <한 장.png> <out.webp>   (펫별 자리 = CFG, 좌표는 그림 칸)
import sys, math, numpy as np
from PIL import Image
CFG = {
    # legs: (x0, x1, 다리 뿌리 줄, 배 줄) — 다리는 뿌리(엉덩이·어깨)에서부터 통째로 흔들린다. 배 줄 아래는 몸 밖으로 나온 다리, 뿌리~배 줄은 몸 끝에 붙은 허벅지.
    # tail: x ≤ xmax, y < base 인 칸(top 쪽이 많이 흔들림)
    'yoruichi-cat-walk': dict(legs=[(12, 17, 25, 30), (25, 30, 25, 30)], tail=dict(xmax=15, base=24, top=11, amp=2), stride=3),
    'kukkapuro-walk': dict(legs=[(5, 11, 24, 30), (27, 32, 25, 30)], tail=dict(xmax=9, base=24, top=15, amp=2), stride=3),
}
name, src, out = sys.argv[1], sys.argv[2], sys.argv[3]; c = CFG[name]
a = np.array(Image.open(src).convert('RGBA')); a[a[..., 3] < 128] = 0; a[..., 3] = np.where(a[..., 3] > 0, 255, 0)
H, W = a.shape[:2]; yy, xx = np.mgrid[0:H, 0:W]; op = a[..., 3] > 0
bottom = np.where(op.any(1))[0].max()
legs = [op & (xx >= x0) & (xx <= x1) & (yy > root) for x0, x1, root, belly in c['legs']]      # 뿌리부터 발끝까지
low = [m & (yy > belly) for m, (x0, x1, root, belly) in zip(legs, c['legs'])]                # 몸 밖으로 나온 부분(뒤쪽 다리로도 씀)
T = c['tail']; tail = op & (xx <= T['xmax']) & (yy < T['base'])
body = a.copy()
for m in legs + [tail]: body[m] = 0
far = a.copy(); far[..., :3] = (far[..., :3] * 0.55).astype(np.uint8)      # 뒤쪽 다리 = 어둡게
# 허벅지가 흔들려 비는 칸을 메울 몸 색 = 몸에서 가장 많은 (검정 아닌) 색
bc, bn = np.unique(a[op & (a[..., :3].astype(int).sum(2) > 90)][:, :3], axis=0, return_counts=True); FILL = (*[int(v) for v in bc[bn.argmax()]], 255)
D, STEPT, FRAME = 2.4, 0.6, 100; N = int(D * 1000 / FRAME); frames = []
PAD = c['stride'] + 1; FWD = W + 2 * PAD
def put(f, src_img, mask, root, belly, ph, bob):
    for y in range(H):
        if not mask[y].any(): continue
        k = (y - root) / max(1, bottom - root)                # 뿌리 0 → 발 1 (사용자 2026-11-19 "다리 시작점이 아니라 중간 관절부터 움직여서 아직도 짤려보임" — 배 줄이 아니라 뿌리부터)
        dx = round(c['stride'] * math.sin(ph) * k)
        lift = 1 if (math.cos(ph) > 0.5 and y >= bottom - 1) else 0   # 앞으로 내딛는 발끝은 살짝 든다
        dy = bob if y <= belly else 0                         # 허벅지는 몸과 같이 들썩인다
        for x in np.where(mask[y])[0]:
            ty, tx = y + dy - lift, x + dx + PAD
            if 0 <= ty < H and 0 <= tx < FWD: f[ty, tx] = src_img[y, x]
            if y == belly + 1:                                # 몸이 올라간 만큼 다리를 위로 이어 붙인다
                for g in range(1, -bob + 1):
                    if 0 <= ty - g < H and 0 <= tx < FWD: f[ty - g, tx] = src_img[y, x]
for i in range(N):
    t = i * FRAME / 1000; ph = t / STEPT * 2 * math.pi
    bob = -1 if math.sin(ph * 2) > 0.3 else 0
    f = np.zeros((H, FWD, 4), np.uint8)
    for j, (m, (x0, x1, root, belly)) in enumerate(zip(low, c['legs'])): put(f, far, m, root, belly, ph + math.pi * (j + 1), bob)   # 뒤쪽 다리(먼저, 몸 밖 부분만)
    sw = math.sin(t / D * 2 * math.pi * 2)
    for y in range(H):                                        # 꼬리
        k = max(0, min(1, (T['base'] - y) / (T['base'] - T['top']))); dx = round(sw * T['amp'] * k ** 1.3)
        for x in np.where(tail[y])[0]:
            if 0 <= y + bob < H: f[y + bob, x + dx + PAD] = a[y, x]
    ys, xs = np.where(body[..., 3] > 0)
    f[ys + bob, xs + PAD] = body[ys, xs]                      # 몸
    for j, (m, (x0, x1, root, belly)) in enumerate(zip(legs, c['legs'])): put(f, a, m, root, belly, ph + math.pi * j, bob)         # 앞쪽 다리(뿌리부터)
    # 허벅지가 밀려 몸 안에 생긴 빈칸 메우기: 뿌리~배 줄에서 양옆이 막힌 짧은 틈
    for (x0, x1, root, belly) in c['legs']:
        for y in range(root + bob, belly + 1):
            row = f[y, :, 3] > 0; xs_ = np.where(row)[0]
            if len(xs_) < 2: continue
            x = xs_[0]
            while x < xs_[-1]:
                if not row[x]:
                    e = x
                    while not row[e]: e += 1
                    if e - x <= c['stride'] + 1 and x0 + PAD - 4 <= x <= x1 + PAD + 4: f[y, x:e] = FILL
                    x = e
                else: x += 1
    frames.append(Image.fromarray(f))
frames[0].save(out, save_all=True, append_images=frames[1:], duration=FRAME, loop=0, lossless=True)
FW = FWD
cs = Image.new('RGBA', (FW * 4 * 8, H * 4), (96, 110, 128, 255))
for i in range(8): cs.alpha_composite(frames[i * N // 8].resize((FW * 4, H * 4), 0), (i * FW * 4, 0))
cs.save(out.replace('.webp', '') + '-preview.png'); print(out, (FW, H), N, '장')
