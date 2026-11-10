import numpy as np
from PIL import Image
PAL={'#':(0,0,0),'W':(0xe6,0xe1,0xe1),'d':(0x47,0x3b,0x48),'p':(0xc4,0xa3,0xb9),'m':(0xac,0x71,0x99),'R':(0xe2,0x10,0x14)}
INV={v:k for k,v in PAL.items()}
MASKC=set('WpmR')
def load(path):
    a=np.array(Image.open(path).convert('RGBA'))
    g=[['.' if a[y,x,3]==0 else INV[tuple(a[y,x,:3])] for x in range(a.shape[1])] for y in range(a.shape[0])]
    return g
def save(g,path):
    h,w=len(g),len(g[0]); a=np.zeros((h,w,4),np.uint8)
    for y in range(h):
        for x in range(w):
            c=g[y][x]
            if c!='.': a[y,x,:3]=PAL[c]; a[y,x,3]=255
    Image.fromarray(a).save(path)
def show(g):
    return '\n'.join('%2d '%y+''.join(r) for y,r in enumerate(g))
def hood_base(g, xmax=24):
    """가면(흰·분홍·입·눈 색 + 그 윤곽 검정)을 지운 두건: 부리 쪽(x<11)·입 아래(y>=17)는 투명, 두건 안(그 밖)은 검정(두건 속 그늘)"""
    h,w=len(g),len(g[0])
    mask=[[g[y][x] in MASKC and x<xmax for x in range(w)] for y in range(h)]
    out=[r[:] for r in g]
    for y in range(h):
        for x in range(min(w,xmax)):
            near=any(0<=y+dy<h and 0<=x+dx<w and mask[y+dy][x+dx] for dy in (-1,0,1) for dx in (-1,0,1))
            if mask[y][x] or (g[y][x]=='#' and near):
                inside = x>=11 and y<=16 and not (y<=1)
                out[y][x]='#' if inside else '.'
    return out
