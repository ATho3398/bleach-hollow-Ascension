# 공통 머리(머리카락 없음) v2 — 원본 얼굴·턱은 한 칸도 다시 그리지 않는다.
# 사신 기본형 머리 층에서 머리카락 칸만 지우고, 머리카락에 가려졌던 정수리만 채운 뒤 바깥 외곽선만 잇는다.
import sys, numpy as np
from PIL import Image
R = sys.argv[1]
K = (0x0E, 0x0A, 0x10); SK = (0xFF, 0xC9, 0xA2); SD = (0xD5, 0x8C, 0x6F)
HAIR = [(0x33, 0x2D, 0x39), (0x49, 0x41, 0x4D)]
src = np.array(Image.open(f'{R}/shinigami-base/head.png'))
h, w = src.shape[:2]
rgb = src[..., :3]; op = src[..., 3] > 0
yy, xx = np.mgrid[0:h, 0:w]
is_c = lambda c: np.all(rgb == c, -1) & op
hair = is_c(HAIR[0]) | is_c(HAIR[1])
black = is_c(K)
face_col = op & ~hair & ~black                       # 피부·눈 등 색 있는 얼굴 칸
nb = np.zeros((h, w), bool)
for dy, dx in ((0, 1), (0, -1), (1, 0), (-1, 0), (1, 1), (1, -1), (-1, 1), (-1, -1)):
    nb |= np.roll(np.roll(face_col, dy, 0), dx, 1)
keep = face_col | (black & nb)                       # 얼굴에 붙은 검은 선(눈·턱 외곽선)은 그대로
BROW = 21                                            # 눈썹 줄. 이보다 위의 검은 칸은 앞머리 선이라 뺀다
keep &= ~(black & (yy < BROW))
# 앞머리에 덮였던 이마·정수리: 얼굴 피부 맨 윗줄보다 위만 둥글게 채운다
sk = is_c(SK) | is_c(SD)
ys, xs = np.nonzero(sk)
top = ys.min()
x0, x1 = xs[ys <= top + 3].min(), xs[ys <= top + 3].max()
cx = (xs.min() + xs.max()) / 2; rx = (xs.max() - xs.min()) / 2 + 1
skull = (((xx - cx) / rx) ** 2 + ((yy - (top + 2)) / 9.0) ** 2 <= 1) & (yy <= top + 2) & ~keep
# 앞머리에 가려졌던 이마 빈칸(얼굴 상자 안, 정수리 아래)도 피부로
box = (yy >= top) & (yy <= top + 4) & (xx >= xs.min()) & (xx <= xs.max()) & ~keep
fill = skull | (box & ((np.roll(sk, 1, 0)) | np.roll(sk, -1, 0)))
out = np.zeros_like(src)
out[keep] = src[keep]
out[fill] = (*SK, 255)
out[fill & (xx >= cx + rx * 0.45)] = (*SD, 255)
# 줄마다 왼쪽 끝~오른쪽 끝 사이 빈칸(머리카락이 있던 귀·뒤통수 자리)은 피부 그림자로 메운다(턱 아래 줄은 제외)
cur = keep | fill
for y in range(0, 28):
    xs_ = np.nonzero(cur[y])[0]
    if len(xs_) > 1:
        gapx = np.arange(xs_.min(), xs_.max() + 1)
        holes = gapx[~cur[y, gapx]]
        for x in holes:
            out[y, x] = (*(SD if x >= cx else SK), 255)
            fill[y, x] = True
shape = keep | fill
edge = np.zeros((h, w), bool)
for dy, dx in ((0, 1), (0, -1), (1, 0), (-1, 0)):
    edge |= np.roll(np.roll(shape, dy, 0), dx, 1)
edge &= ~shape
# 바깥 외곽선은 새로 채운 정수리 둘레에만(원래 얼굴 둘레는 원본 선 그대로 — 끊긴 곳만 이음)
near_fill = np.zeros((h, w), bool)
for dy, dx in ((0, 1), (0, -1), (1, 0), (-1, 0), (1, 1), (1, -1), (-1, 1), (-1, -1)):
    near_fill |= np.roll(np.roll(fill, dy, 0), dx, 1)
out[edge & near_fill] = (*K, 255)
# 얼굴 쪽 외곽선 끊긴 곳: 피부가 투명과 바로 맞닿은 칸 바깥에 1칸
skin_now = np.all(out[..., :3] == SK, -1) | np.all(out[..., :3] == SD, -1)
skin_now &= out[..., 3] > 0
gap = np.zeros((h, w), bool)
for dy, dx in ((0, 1), (0, -1), (1, 0), (-1, 0)):
    gap |= np.roll(np.roll(skin_now, dy, 0), dx, 1)
gap &= out[..., 3] == 0
out[gap] = (*K, 255)
Image.fromarray(out).save(f'{R}/head_bald.png')
# 원래 얼굴 칸이 하나도 안 바뀌었는지
changed = (out[keep] != src[keep]).any(-1).sum()
print('원본 얼굴 칸 변경', int(changed), '/ 유지', int(keep.sum()), '/ 새로 채운 정수리', int(fill.sum()))
