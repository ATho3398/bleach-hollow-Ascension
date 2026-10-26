# 사신·아란칼 공통 머리(머리카락 없음) — 사신 대머리 머리에서 얼굴(눈·눈썹)만 살리고 뒤통수·귀·턱·목을 깨끗하게 다시 그린다
import sys, numpy as np
from PIL import Image, ImageDraw
R = sys.argv[1]
K = (0x0E, 0x0A, 0x10, 255); SK = (0xFF, 0xC9, 0xA2, 255); SD = (0xD5, 0x8C, 0x6F, 255)
src = np.array(Image.open(f'{R}/shinigami-base/head_bald.png'))
h, w = src.shape[:2]
yy, xx = np.mgrid[0:h, 0:w]
# 머리 모양 = 정수리 타원 + 얼굴(턱) 다각형 + 귀
skull = ((xx - 15.5) / 8.6) ** 2 + ((yy - 19.0) / 8.6) ** 2 <= 1
jaw = Image.new('L', (w, h), 0)
ImageDraw.Draw(jaw).polygon([(8, 19), (24, 19), (23, 24), (21, 27), (17, 29), (11, 29), (9, 27), (8, 24)], fill=255)
ear = (xx >= 20) & (xx <= 22) & (yy >= 21) & (yy <= 24)
neck = (xx >= 14) & (xx <= 18) & (yy >= 29) & (yy <= 31)
shape = skull | (np.array(jaw) > 0) | ear | neck
out = np.zeros_like(src)
out[shape] = SK
# 그림자 1톤: 뒤통수 쪽(오른쪽)과 목
out[shape & (xx >= 19) & (yy <= 26)] = SD
out[neck] = SD
out[ear] = SD
# 얼굴 살리기: 원래 대머리 머리의 눈·눈썹 칸(x 9~18, y 21~27 의 검정·주황·흰색)
feat = (xx >= 9) & (xx <= 18) & (yy >= 21) & (yy <= 27)
keep = feat & (src[..., 3] > 0) & ~np.all(src[..., :3] == SK[:3], -1) & ~np.all(src[..., :3] == SD[:3], -1)
out[keep] = src[keep]
# 귀 안쪽 선 1칸
out[22, 21] = K
# 외곽선 1칸(바깥)
edge = np.zeros((h, w), bool)
for dy, dx in ((0, 1), (0, -1), (1, 0), (-1, 0)):
    edge |= np.roll(np.roll(shape, dy, 0), dx, 1)
edge &= ~shape
out[edge] = K
# 턱 아래 = 목과 만나는 줄만 그림자로(검은 수염처럼 보이지 않게 외곽선은 바깥만)
out[(yy == 29) & (xx >= 14) & (xx <= 18)] = SD
Image.fromarray(out).save(f'{R}/head_bald.png')
print('ok', int(shape.sum()))
