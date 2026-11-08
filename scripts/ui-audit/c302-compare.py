# C.302 (GDD 190장 2): 전투 캡처 나란히 비교 — 왼쪽 C.281(68acec7 빌드) / 오른쪽 C.302, 위 호로 / 아래 사신. 한 상태 = 한 장.
# 쓰기: python3 scripts/ui-audit/c302-compare.py <옛 폴더> <새 폴더> <저장 폴더>
import os, sys
from PIL import Image, ImageDraw

old, new, out = sys.argv[1:4]
os.makedirs(out, exist_ok=True)
STATES = ['normal', 'chain2', 'chain3', 'seal', 'items', 'lib', 'pause']
for mode in ['pc', 'phone']:
    for st in STATES:
        cells = []
        for fac in ['hollow', 'shinigami']:
            row = []
            for d in (old, new):
                p = os.path.join(d, f'{mode}-{fac}-{st}.png')
                row.append(Image.open(p).convert('RGB') if os.path.exists(p) else None)
            cells.append(row)
        w = max(i.width for r in cells for i in r if i)
        h = max(i.height for r in cells for i in r if i)
        LBL = 16
        img = Image.new('RGB', (w * 2 + 8, (h + LBL) * 2 + 4), (255, 255, 255))
        dr = ImageDraw.Draw(img)
        for ri, (fac, r) in enumerate(zip(['hollow', 'shinigami'], cells)):
            for ci, (name, im) in enumerate(zip(['OLD C.281', 'NEW C.302'], r)):
                x, y = ci * (w + 8), ri * (h + LBL + 4)
                dr.text((x + 2, y + 2), f'{name} {fac} {mode} {st}', fill=(0, 0, 0))
                if im: img.paste(im, (x, y + LBL))
        img.save(os.path.join(out, f'cmp-{mode}-{st}.png'), optimize=True)
print('ok')
