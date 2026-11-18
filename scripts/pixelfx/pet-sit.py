# 앉은 펫 움직임 (2026-11-18): 사용자가 찍은 한 장을 잘라서 꼬리 살랑(줄 단위로 옆으로 밀기)·머리 끄덕(1칸)·깜빡임을 입힌 움직이는 webp 로 만든다.
# 사용: python3 scripts/pixelfx/pet-sit.py <펫 이름> <한 장.png> <out.webp>   (펫별 자리 = 아래 CFG, 좌표는 48×48 그림 칸)
import sys, math, numpy as np
from PIL import Image
CFG = {
    # tail: x ≤ xmax 이고 y < base 인 칸 = 꼬리(뿌리 base 줄은 고정, 위로 갈수록 많이 흔들림 — 최대 amp 칸)
    # head: x ≥ xmin 이고 y ≤ ymax 인 칸 = 머리(1칸 내려 끄덕). eye: 눈 색(이 색 칸을 lid 색으로 바꾸면 감은 눈)
    'yoruichi-cat': dict(tail=dict(xmax=19, base=34, top=19, amp=2), head=dict(xmin=23, ymax=24), eye=(255, 210, 60), eye_tol=70, blink_at=1.3),
}
name, src, out = sys.argv[1], sys.argv[2], sys.argv[3]; c = CFG[name]
a = np.array(Image.open(src).convert('RGBA')); a[a[..., 3] < 128] = 0; a[..., 3] = np.where(a[..., 3] > 0, 255, 0)
N = 48; assert a.shape[:2] == (N, N)
yy, xx = np.mgrid[0:N, 0:N]; op = a[..., 3] > 0
tail = op & (xx <= c['tail']['xmax']) & (yy < c['tail']['base'])
head = op & (xx >= c['head']['xmin']) & (yy <= c['head']['ymax'])
eye = head & (np.abs(a[..., :3].astype(int) - c['eye']).sum(2) < c['eye_tol'])
# 감은 눈 색 = 머리에서 가장 많은 색(털)
cols, cnt = np.unique(a[head & ~eye][:, :3], axis=0, return_counts=True); lid = cols[cnt.argmax()]
body = a.copy(); body[tail | head] = 0
D, FPS, STEP = 4.8, 30, 3; frames = []   # 4.8초 반복, 한 장 100ms
for i in range(0, int(D * FPS), STEP):
    t = i / FPS; f = body.copy()
    sw = math.sin(t / D * 2 * math.pi)       # 꼬리는 4.8초에 한 번 왕복 (사용자 2026-11-18 "꼬리 너무빨라 엄청 느리게")
    T = c['tail']
    for y in range(N):                       # 꼬리: 줄마다 옆으로
        k = (T['base'] - y) / (T['base'] - T['top']); dx = round(sw * T['amp'] * max(0, min(1, k)) ** 1.3)
        for x in range(N):
            if tail[y, x] and 0 <= x + dx < N: f[y, x + dx] = a[y, x]
    h = a.copy()
    if (t - c['blink_at']) % (D / 2) < 0.14: h[eye, :3] = lid
    dy = 1 if math.sin(t / D * 2 * math.pi * 2) > 0.6 else 0   # 머리 끄덕
    for y in range(N - 1, -1, -1):
        for x in range(N):
            if head[y, x] and y + dy < N: f[y + dy, x] = h[y, x]
    frames.append(Image.fromarray(f))
frames[0].save(out, save_all=True, append_images=frames[1:], duration=round(1000 * STEP / FPS), loop=0, lossless=True)
cs = Image.new('RGBA', (N * 4 * 8, N * 4), (96, 110, 128, 255))
pick = [0, 6, 12, 13, 18, 24, 30, 42]
for i, k in enumerate(pick): cs.alpha_composite(frames[k].resize((N * 4, N * 4), 0), (i * N * 4, 0))
cs.save(out.replace('.webp', '') + '-preview.png'); print(out, len(frames), '장', 'tail', int(tail.sum()), 'head', int(head.sum()), 'eye', int(eye.sum()))
