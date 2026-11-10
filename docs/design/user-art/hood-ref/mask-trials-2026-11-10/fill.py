"""외눈 가면 머리 조각의 빈 곳(투명) 채우기 (사용자 2026-11-10 "외눈가면만 살리고, 그 투명한 공간 없도록 검정으로 채우고"):
① 바깥과 이어지지 않은 구멍(정수리와 두건 사이) ② 입 속 뒤 두건 자리(y 17~19, x 17~21 — 턱이 벌어지면 보임) = 검정.
사용: python3 -I fill.py <head-cyclops.png> <출력>"""
import sys
import numpy as np
from PIL import Image

a = np.array(Image.open(sys.argv[1]).convert('RGBA'))
h, w = a.shape[:2]
tr = a[..., 3] == 0
seen = np.zeros_like(tr)
st = [(y, x) for y in range(h) for x in (0, w - 1) if tr[y, x]] + [(y, x) for x in range(w) for y in (0, h - 1) if tr[y, x]]
for y, x in st:
    seen[y, x] = True
while st:
    y, x = st.pop()
    for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
        yy, xx = y + dy, x + dx
        if 0 <= yy < h and 0 <= xx < w and tr[yy, xx] and not seen[yy, xx]:
            seen[yy, xx] = True
            st.append((yy, xx))
holes = tr & ~seen
holes[17:20, 17:22] |= tr[17:20, 17:22]
a[holes] = (0, 0, 0, 255)
Image.fromarray(a).save(sys.argv[2])
print('채운 칸', int(holes.sum()))
