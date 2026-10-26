import numpy as np, sys
from PIL import Image
from collections import Counter
OUT=(0x0e,0x0a,0x10)
def lum(c): return 0.3*c[0]+0.59*c[1]+0.11*c[2]
def dist(a,b): return sum((int(x)-int(y))**2 for x,y in zip(a,b))**.5
def crop(g,x0,x1):
    sub=g[:,x0:x1]; o=sub[...,3]>0
    ys=np.where(o.any(1))[0]; xs=np.where(o.any(0))[0]
    return sub[ys.min():ys.max()+1, xs.min():xs.max()+1].copy()
def merge_palette(a,k):
    o=a[...,3]>0
    cnt=Counter(map(tuple,a[o][:,:3]))
    pal=dict(cnt); mp={c:c for c in pal}
    while len(pal)>k:
        best=None
        cs=[c for c in pal if c!=OUT]
        for i,c in enumerate(cs):
            for d in cs[i+1:]:
                w=dist(c,d)*(min(pal[c],pal[d])**.35)   # small areas merge first
                if best is None or w<best[0]: best=(w,c,d)
        _,c,d=best
        keep,drop=(c,d) if pal[c]>=pal[d] else (d,c)
        pal[keep]+=pal.pop(drop)
        for s,t in mp.items():
            if t==drop: mp[s]=keep
    for y in range(a.shape[0]):
        for x in range(a.shape[1]):
            if a[y,x,3]: a[y,x,:3]=mp[tuple(a[y,x,:3])]
    return a
def nb(a,y,x,diag=True):
    H,W=a.shape[:2]; r=[]
    for dy in(-1,0,1):
        for dx in(-1,0,1):
            if (dy or dx) and (diag or not(dy and dx)):
                yy,xx=y+dy,x+dx
                r.append(tuple(a[yy,xx]) if 0<=yy<H and 0<=xx<W else (0,0,0,0))
    return r
def orphans(a,protect=()):
    for _ in range(2):
        H,W=a.shape[:2]; ch=[]
        for y in range(H):
            for x in range(W):
                if not a[y,x,3] or (y,x) in protect: continue
                c=tuple(a[y,x]); n4=nb(a,y,x,False)
                if c in n4: continue
                n8=[n for n in nb(a,y,x) if n[3]]
                if not n8: ch.append((y,x,None)); continue
                if tuple(c[:3])==OUT and any(n[3]==0 for n in n4): continue   # 외곽 가장자리 선은 둔다
                cand=[n for n in n8 if tuple(n[:3])!=OUT] or n8
                ch.append((y,x,Counter(cand).most_common(1)[0][0]))
        for y,x,c in ch:
            a[y,x]=(0,0,0,0) if c is None else c
    return a
def corners(a):
    H,W=a.shape[:2]; ch=[]
    isout=lambda y,x: 0<=y<H and 0<=x<W and a[y,x,3] and tuple(a[y,x,:3])==OUT
    opaque=lambda y,x: 0<=y<H and 0<=x<W and a[y,x,3]
    for y in range(H):
        for x in range(W):
            if not isout(y,x): continue
            for vy in(-1,1):
                for hx in(-1,1):
                    if isout(y+vy,x) and isout(y,x+hx) and not isout(y-vy,x) and not isout(y,x-hx) \
                       and not opaque(y-vy,x) and not opaque(y,x-hx) and not isout(y+vy,x+hx):
                        ch.append((y,x))
    for y,x in set(ch): a[y,x]=(0,0,0,0)
    return a
def save(a,name,s=10):
    Image.fromarray(a).save(name+'.png'); Image.fromarray(a).resize((a.shape[1]*s,a.shape[0]*s),0).save(name+'_x%d.png'%s)
