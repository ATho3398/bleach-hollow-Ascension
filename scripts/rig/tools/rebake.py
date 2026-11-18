# 종이인형 → 도트 다시 굽기 시험(사용자 2026-11-19 "12프레임정도로 해서 해볼 수 있음???")
import json, sys, base64, io
import numpy as np
from PIL import Image

def load(u):
    return Image.open(io.BytesIO(base64.b64decode(u.split(',', 1)[1]))).convert('RGBA')

def scale2x(a):
    # EPX: a = H×W×4 uint8 → 2H×2W×4
    H, W = a.shape[:2]
    P = np.pad(a, ((1, 1), (1, 1), (0, 0)), mode='edge')
    E = P[1:-1, 1:-1]; B = P[:-2, 1:-1]; D = P[1:-1, :-2]; F = P[1:-1, 2:]; Hh = P[2:, 1:-1]
    eq = lambda x, y: np.all(x == y, axis=2)
    nB_H = ~eq(B, Hh); nD_F = ~eq(D, F)
    c = nB_H & nD_F
    E0 = np.where((c & eq(D, B))[..., None], D, E)
    E1 = np.where((c & eq(B, F))[..., None], F, E)
    E2 = np.where((c & eq(D, Hh))[..., None], D, E)
    E3 = np.where((c & eq(Hh, F))[..., None], F, E)
    out = np.zeros((H * 2, W * 2, 4), np.uint8)
    out[0::2, 0::2] = E0; out[0::2, 1::2] = E1; out[1::2, 0::2] = E2; out[1::2, 1::2] = E3
    return out

def affine_paste(dst, img, m, scale, ox, oy):
    """img(이미 scale 배로 키운 그림)을 행렬 m(도트 단위)로 dst(scale 배 캔버스)에 nearest 로 덮기(알파 128 이상만)"""
    a, b, c, d, e, f = m
    # 캔버스 화소 (X, Y)(scale 배) → 도트 (x, y) = X/scale - ox … → 그림 도트 (u, v) = M⁻¹((x, y) − (e, f)) → 그림 화소 = (u, v)·scale
    det = a * d - b * c
    ia, ib, ic, id_ = d / det, -b / det, -c / det, a / det
    H, W = dst.shape[:2]
    Y, X = np.mgrid[0:H, 0:W]
    x = (X + 0.5) / scale - ox - e; y = (Y + 0.5) / scale - oy - f
    u = ia * x + ic * y; v = ib * x + id_ * y
    U = np.floor(u * scale).astype(int); V = np.floor(v * scale).astype(int)
    ok = (U >= 0) & (V >= 0) & (U < img.shape[1]) & (V < img.shape[0])
    px = np.zeros((H, W, 4), np.uint8)
    px[ok] = img[V[ok], U[ok]]
    on = px[..., 3] >= 128
    dst[on] = px[on]

def block_mode(big, s):
    H, W = big.shape[0] // s, big.shape[1] // s
    out = np.zeros((H, W, 4), np.uint8)
    blk = big[:H * s, :W * s].reshape(H, s, W, s, 4).transpose(0, 2, 1, 3, 4).reshape(H, W, s * s, 4)
    key = (blk[..., 0].astype(np.int64) << 24) | (blk[..., 1].astype(np.int64) << 16) | (blk[..., 2].astype(np.int64) << 8) | blk[..., 3]
    for yy in range(H):
        for xx in range(W):
            k = key[yy, xx]; op = blk[yy, xx, :, 3] >= 128
            if op.sum() * 2 < s * s:
                continue
            vals, cnt = np.unique(k[op], return_counts=True)
            v = vals[cnt.argmax()]
            out[yy, xx] = [(v >> 24) & 255, (v >> 16) & 255, (v >> 8) & 255, 255]
    return out

def render(frame, parts, mode, box, scale_out):
    x0, y0, w, h = box
    ox, oy = -x0, -y0
    if mode == 'smooth':   # 지금처럼: 화면 배율에서 바로 돌림(돌아간 큰 도트)
        s = scale_out
        canvas = np.zeros((h * s, w * s, 4), np.uint8)
        for l in sorted(frame['layers'], key=lambda l: (l['z'], l['order'])):
            im = parts[l['src']]
            affine_paste(canvas, np.kron(im, np.ones((s, s, 1), np.uint8)) if False else np.repeat(np.repeat(im, s, 0), s, 1), l['m'], s, ox, oy)
        return canvas, s
    if mode == 'naive':    # 1배에서 바로 돌림
        canvas = np.zeros((h, w, 4), np.uint8)
        for l in sorted(frame['layers'], key=lambda l: (l['z'], l['order'])):
            affine_paste(canvas, parts[l['src']], l['m'], 1, ox, oy)
        return canvas, 1
    # rotsprite: 8배로 키워(scale2x ×3) 돌린 뒤 8×8 칸마다 가장 많은 색
    S = 8
    canvas = np.zeros((h * S, w * S, 4), np.uint8)
    for l in sorted(frame['layers'], key=lambda l: (l['z'], l['order'])):
        affine_paste(canvas, parts8[l['src']], l['m'], S, ox, oy)
    return block_mode(canvas, S), 1

d = json.load(open(sys.argv[1]))
parts = {k: np.array(load(u)) for k, u in d['srcs'].items()}
parts8 = {k: scale2x(scale2x(scale2x(v))) for k, v in parts.items()}
mode, outp, n_keep = sys.argv[2], sys.argv[3], None
BG = (155, 176, 148)
c0 = d['frames'][0]['canvases'][0] if d['frames'][0]['canvases'] else None
box = (int(c0['left']), int(c0['top']), c0['w'], c0['h']) if c0 else (-30, -30, 170, 160)
SHOW = 3
ims = []
for fr in d['frames']:
    body, s = render(fr, parts, mode, box, SHOW)
    # 불꽃 층(1배): 뒤(z 작음) → 몸 → 앞
    back = [c for c in fr['canvases'] if c['z'] < 100]; front = [c for c in fr['canvases'] if c['z'] >= 100]
    base = Image.new('RGBA', (box[2], box[3]), BG + (255,))
    for c in back: base.alpha_composite(load(c['png']))
    if s == 1:
        base.alpha_composite(Image.fromarray(body))
        for c in front: base.alpha_composite(load(c['png']))
        img = base.resize((box[2] * SHOW, box[3] * SHOW), Image.NEAREST)
    else:
        img = base.resize((box[2] * SHOW, box[3] * SHOW), Image.NEAREST)
        img.alpha_composite(Image.fromarray(body))
        for c in front: img.alpha_composite(load(c['png']).resize((box[2] * SHOW, box[3] * SHOW), Image.NEAREST))
    ims.append(img.convert('RGB'))
dur = int(sys.argv[4])
q = [i.quantize(64) for i in ims]
q[0].save(outp, save_all=True, append_images=q[1:], duration=dur, loop=0)
ims[len(ims) // 2].save(outp.replace('.gif', '-mid.png'))
print('ok', mode, len(ims))
