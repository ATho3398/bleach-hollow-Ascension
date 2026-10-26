# 재질당 그림자 1톤 맞추기 (사용자 2026-10-26): 사신 검은 옷 3톤 → 2톤, 아란칼 흰 옷 그림자 2톤 → 1톤(머리카락 그림자는 유지)
import sys, numpy as np
from PIL import Image
D = sys.argv[1]
def h(s): return tuple(int(s[i:i + 2], 16) for i in (1, 3, 5))
def is_(a, c): return np.all(a[..., :3] == h(c), -1) & (a[..., 3] > 0)
# 사신: #201b24(21칸) → 옷 그림자 #332d39
a = np.array(Image.open(f'{D}/shinigami-base.png').convert('RGBA'))
a[is_(a, '#201b24'), :3] = h('#332d39')
Image.fromarray(a).save(f'{D}/shinigami-base.png')
# 아란칼: #8f8193 은 머리(y<25)에서는 머리카락 그림자로 두고, 몸(y>=25)에서는 흰 옷 그림자 #b8aebd 로 합친다
a = np.array(Image.open(f'{D}/arrancar-base.png').convert('RGBA'))
dark = is_(a, '#8f8193')
yy = np.arange(a.shape[0])[:, None] * np.ones((1, a.shape[1]), int)
cloth = dark & (yy >= 25)
print('arrancar #8f8193 머리', int((dark & ~cloth).sum()), '옷→#b8aebd', int(cloth.sum()))
a[cloth, :3] = h('#b8aebd')
Image.fromarray(a).save(f'{D}/arrancar-base.png')
