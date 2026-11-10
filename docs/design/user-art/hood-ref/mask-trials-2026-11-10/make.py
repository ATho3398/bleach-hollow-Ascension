import json, math, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import numpy as np
from PIL import Image, ImageDraw, ImageFont
from lib import load, save, hood_base, PAL, MASKC
from designs import D
R = '/home/user/bleach-hollow-Ascension/'
HD = R + 'docs/design/rig-draft/humanoid/hd/'
OUT = os.path.dirname(os.path.abspath(__file__)) + '/out'
os.makedirs(OUT, exist_ok=True)

def base():
    org = load(HD + 'head.png')
    g = hood_base(org)
    for y in range(len(g)):
        for x in range(len(g[0])):
            if x < 11: g[y][x] = '.'
            elif 13 <= y <= 16 and x <= 20: g[y][x] = '#'
            elif 17 <= y <= 19 and x < 22: g[y][x] = 'm' if org[y][x] == 'm' else '.'  # 입 속(턱이 벌어지면 보임)은 원래대로
    return g

def paint(tpl):
    g = base()
    h, w = len(g), len(g[0])
    drawn = [[False] * w for _ in range(h)]
    for y, row in enumerate(tpl):
        for x, c in enumerate(row):
            if c != ' ':
                g[y][x] = '#' if c == 'o' else c
                drawn[y][x] = True
    # 윤곽: 칠한 칸 둘레(4방향)의 빈 칸·두건 칸 = 검정 (칠한 칸 바깥 한 겹)
    out = [r[:] for r in g]
    for y in range(h):
        for x in range(w):
            if drawn[y][x]:
                continue
            if any(0 <= y + dy < h and 0 <= x + dx < w and drawn[y + dy][x + dx] and g[y + dy][x + dx] in MASKC for dy, dx in ((0, 1), (0, -1), (1, 0), (-1, 0))):
                out[y][x] = '#'
    # 그늘: 흰 칸 중 바로 아래가 윤곽이면 분홍 (원본처럼 아랫변 그늘)
    for y in range(h - 1):
        for x in range(w):
            if out[y][x] == 'W' and drawn[y][x] and out[y + 1][x] == '#' and not drawn[y + 1][x]:
                out[y][x] = 'p'
    return out

# 미리보기: 작업본 뼈대로 쉬는 자세 (still.py 와 같은 식) — 머리·턱만 바꿔 끼움
RIG = json.load(open(R + 'docs/design/rig-draft/humanoid.json', encoding='utf-8'))
def mul(m, n):
    return [m[0]*n[0]+m[2]*n[1], m[1]*n[0]+m[3]*n[1], m[0]*n[2]+m[2]*n[3], m[1]*n[2]+m[3]*n[3], m[0]*n[4]+m[2]*n[5]+m[4], m[1]*n[4]+m[3]*n[5]+m[5]]
def bone_mats(body, extra=None):
    j = RIG['bodyJoints'].get(body) or {}
    by = {b['id']: dict(b, pivot=(j.get('pivots') or {}).get(b['id'], b['pivot']), restRot=b.get('restRot', 0) + (j.get('rot') or {}).get(b['id'], 0) + (extra or {}).get(b['id'], 0), shift=(j.get('shift') or {}).get(b['id'], [0, 0])) for b in RIG['bones']}
    out = {}
    def get(i):
        if i in out: return out[i]
        b = by[i]; r = math.radians(b['restRot']); c, s = math.cos(r), math.sin(r); px, py = b['pivot']; sx, sy = b['shift']
        m = [c, s, -s, c, px - c*px + s*py + sx, py - s*px - c*py + sy]
        out[i] = mul(get(b['parent']), m) if b['parent'] else m
        return out[i]
    for b in by: get(b)
    return out
def render(over, K=6, extra=None):
    body = 'hd'; parts = RIG['bodies'][body]; bo = RIG['bodySlots'][body]
    mats = bone_mats(body, extra)
    vx, vy, vw, vh = -20, 18, 60, 66
    img = Image.new('RGBA', (vw*K, vh*K), (150, 170, 150, 255))
    for s in sorted(RIG['slots'], key=lambda x: bo.index(x['id']) if x['id'] in bo else 999):
        p = parts.get(s['id'])
        if not p: continue
        src = over.get(s['id']) or Image.open(R + 'docs/design/rig-draft/humanoid/' + p['art'] + '.png').convert('RGBA')
        m = mul(mats[s['bone']], [1, 0, 0, 1, p['at'][0], p['at'][1]])
        a, b, c, d, e, f = m; det = a*d - b*c
        ia, ib, ic, id_ = d/det, -b/det, -c/det, a/det; ie, if_ = -(ia*e + ic*f), -(ib*e + id_*f)
        co = (ia/K, ic/K, ia*vx + ic*vy + ie, ib/K, id_/K, ib*vx + id_*vy + if_)
        img.alpha_composite(src.transform(img.size, Image.AFFINE, co, resample=Image.NEAREST))
    return img

def g2img(g):
    h, w = len(g), len(g[0]); a = np.zeros((h, w, 4), np.uint8)
    for y in range(h):
        for x in range(w):
            if g[y][x] != '.': a[y, x, :3] = PAL[g[y][x]]; a[y, x, 3] = 255
    return Image.fromarray(a)

if __name__ == '__main__':
    OPEN = {'jaw': -40}
    tiles = [('원래(부리)', render({}), Image.open(HD + 'head.png').convert('RGBA'), render({}, 4, OPEN))]
    for key, (name, tpl) in D.items():
        g = paint(tpl)
        head = g2img(g); head.save(f'{OUT}/head-{key}.png')
        tiles.append((name, render({'head': head}), head, render({'head': head}, 4, OPEN)))
    font = ImageFont.truetype('/usr/share/fonts/truetype/wqy/wqy-zenhei.ttc', 22)
    W = tiles[0][1].width; H = tiles[0][1].height
    oh = tiles[0][3].height
    sheet = Image.new('RGBA', (W * len(tiles), H + 40 + 29 * 6 + 20 + oh + 40), (255, 255, 255, 255))
    dr = ImageDraw.Draw(sheet)
    for i, (name, full, head, opened) in enumerate(tiles):
        sheet.paste(full, (i * W, 40))
        hb = Image.new('RGBA', head.size, (150, 170, 150, 255)); hb.alpha_composite(head)
        sheet.paste(hb.resize((head.width * 6, head.height * 6), Image.NEAREST), (i * W + (W - head.width * 6) // 2, 40 + H + 10))
        y2 = 40 + H + 29 * 6 + 20
        dr.text((i * W + 10, y2 + 4), '입 벌림', fill=(90, 90, 90), font=font)
        sheet.paste(opened, (i * W + (W - opened.width) // 2, y2 + 36))
        dr.text((i * W + 10, 6), name, fill=(0, 0, 0), font=font)
    sheet.save(f'{OUT}/sheet-preview.png')
    print('ok', len(tiles))
