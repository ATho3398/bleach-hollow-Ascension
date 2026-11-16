# 공통 팔레트 2톤 도트화 (사용자 2026-11-17): 재질마다 기본색 1 + 음영색 1, 검정 외곽 1. 캐릭터가 달라도 같은 재질은 같은 색.
# 한 재질 안에 다른 재질 색을 섞지 않는다(가면 안에 머리·피부 그늘색 금지) — 작은 섬은 둘러싼 재질로 바꾼다.
# 사용: python3 master2.py <grid.png> <out.png> [재질 바꿔치기 a=b,...]   예: skin=mask (살색을 가면색으로)
import sys, numpy as np
from PIL import Image
from collections import deque, Counter
MASTER={ # 재질: (기본색, 음영색)
 'mask':((252,236,207),(203,171,149)),     # 가면·흰 몸 (게임 적 가면과 같은 색)
 'skin':((250,198,154),(201,130,99)),      # 사람 살
 'orange':((251,129,28),(178,77,13)),      # 주황 머리
 'brown':((175,84,62),(98,44,41)),         # 붉은 갈색 머리
 'red':((222,57,31),(127,18,16)),          # 붉은 털·피
 'purple':((130,66,96),(87,50,70)),        # 보라 천
 'dark':((119,99,108),(55,47,56)),         # 검은 옷·검은 몸 (밝은 쪽 = 주름 빛)
 'navy':((79,88,112),(31,37,59)),          # 남색
 'green':((104,118,85),(88,102,73)),
}
BLACK=(0,0,0)
def classify(a):
    r,g,b=[a[...,i].astype(float) for i in range(3)]; op=a[...,3]>0
    lum=0.299*r+0.587*g+0.114*b; mx=np.maximum(np.maximum(r,g),b); mn=np.minimum(np.minimum(r,g),b); sat=(mx-mn)/np.maximum(1,mx)
    mat=np.full(a.shape[:2],'',dtype=object); left=op.copy()
    def take(name,m):
        m=m&left; mat[m]=name; left[m]=False
    take('black',lum<26)
    take('purple',(r>g+18)&(b>g+12)&(sat>0.28)&(lum<140))
    take('orange',(r>215)&(g>=0.42*r)&(g<0.80*r)&(b<0.50*r)&(sat>0.5))
    take('red',(r>g+55)&(g<0.36*r)&(b<0.45*r)&(sat>0.55))
    take('brown',(r>g+25)&(g<0.62*r)&(sat>0.35)&(lum<150))
    take('orange',(r>150)&(g>=0.38*r)&(g<0.80*r)&(b<0.40*r)&(sat>0.6)&(lum>=95))
    take('skin',(r>180)&(r-b>70)&(g>0.6*r)&(g<0.86*r)&(sat>0.28))
    take('navy',(b>r+12)&(b>g+6)&(sat>0.22))
    take('green',(g>r+6)&(g>b+14)&(sat>0.15))
    take('mask',(lum>=135))
    take('dark',left.copy())
    return mat,lum,op
def run(src,dst,swap):
    a=np.array(Image.open(src).convert('RGBA')); H,W=a.shape[:2]; mat,lum,op=classify(a)
    for k,v in swap.items(): mat[mat==k]=v
    # 작은 섬(3칸 이하)은 둘러싼 재질로
    for _ in range(2):
        seen=np.zeros((H,W),bool)
        for y in range(H):
            for x in range(W):
                if not op[y,x] or seen[y,x] or mat[y,x]=='black': continue
                m0=mat[y,x]; q=deque([(y,x)]); seen[y,x]=1; pts=[]
                while q:
                    p=q.popleft(); pts.append(p)
                    for dy in(-1,0,1):
                        for dx in(-1,0,1):
                            u,v=p[0]+dy,p[1]+dx
                            if 0<=u<H and 0<=v<W and op[u,v] and not seen[u,v] and mat[u,v]==m0: seen[u,v]=1; q.append((u,v))
                if len(pts)<=3:
                    nb=Counter()
                    for (py,px) in pts:
                        for dy in(-1,0,1):
                            for dx in(-1,0,1):
                                u,v=py+dy,px+dx
                                if 0<=u<H and 0<=v<W and op[u,v] and mat[u,v] not in ('black',m0): nb[mat[u,v]]+=1
                    if nb:
                        for p in pts: mat[p]=nb.most_common(1)[0][0]
    out=np.zeros_like(a)
    for name in set(mat[op]):
        m=(mat==name)&op
        if name=='black': out[m]=(*BLACK,255); continue
        base,shade=MASTER[name]; L=lum[m]
        if len(L)<2: out[m]=(*base,255); continue
        # 밝기 두 무리로 나눔
        c0,c1=np.percentile(L,20),np.percentile(L,80)
        for _ in range(12):
            hi=np.abs(L-c1)<np.abs(L-c0)
            if hi.all() or (~hi).all(): break
            c0,c1=L[~hi].mean(),L[hi].mean()
        hi=np.abs(L-c1)<np.abs(L-c0)
        if abs(c1-c0)<14: hi=np.ones(len(L),bool) if (name!='dark') else (L>75)
        ys,xs=np.where(m); out[ys[hi],xs[hi]]=(*base,255); out[ys[~hi],xs[~hi]]=(*shade,255)
    # 외곽 닫기: 투명과 맞닿은 비검정 칸은 그대로 둔다(원본 선 유지)
    Image.fromarray(out).save(dst)
    cols=Counter(tuple(int(v) for v in p[:3]) for p in out.reshape(-1,4) if p[3]); print(dst,out.shape[:2],len(cols),'색',Counter(mat[op]).most_common())
if __name__=='__main__':
    swap=dict(kv.split('=') for kv in sys.argv[3].split(',')) if len(sys.argv)>3 else {}
    run(sys.argv[1],sys.argv[2],swap)
