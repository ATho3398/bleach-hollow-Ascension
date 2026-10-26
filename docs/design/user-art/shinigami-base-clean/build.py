import sys; sys.path.insert(0,'/tmp/claude-0/w')
from clean import *
g=np.array(Image.open('/tmp/claude-0/w/native.png'))
res={}
for n,(x0,x1) in {'L':(0,59),'R':(59,120)}.items():
    a=crop(g,x0,x1)
    if n=='R':
        for y in range(34,37):
            for x in range(14,18): a[y,x]=(252,196,159,255)   # 옛 4x3 검은 구멍 → 살색
    a=merge_palette(a,9); a=orphans(a); a=corners(a); a=orphans(a)
    if n=='R':
        cy,cx=35,16
        for y in range(cy-3,cy+4):
            for x in range(cx-3,cx+4):
                if (x-cx)**2+(y-cy)**2<=5: a[y,x]=(*OUT,255)
    res[n]=a
    print(n,len(set(map(tuple,a[a[...,3]>0][:,:3]))),'colors',a.shape)
    save(a,'/tmp/claude-0/w/final_'+n)
