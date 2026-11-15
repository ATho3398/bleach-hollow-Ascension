# 무월 바지에서 위로 계속 타오르는 검은 불꽃 — 불덩이(퍼프)가 바지 가장자리에서 생겨 위로 올라가며 가늘어지다 사라진다. 16프레임 반복.
import math, numpy as np
from PIL import Image
from collections import deque
spr=np.array(Image.open('mug4/mugetsu.png').convert('RGBA')); SH,SW=spr.shape[:2]
PADX,PADT=44,10; W,H=SW+PADX+18,SH+PADT; FR,MS=16,120
blk=(spr[...,3]>0)&(spr[...,:3].astype(int).sum(2)==0)
m=np.zeros((SH,SW),bool); m[72:108]=blk[72:108]
seen=np.zeros_like(m); best=[]
for y in range(SH):
    for x in range(SW):
        if m[y,x] and not seen[y,x]:
            q=deque([(y,x)]); seen[y,x]=1; pts=[]
            while q:
                p=q.popleft(); pts.append(p)
                for dy,dx in((1,0),(-1,0),(0,1),(0,-1)):
                    u,v=p[0]+dy,p[1]+dx
                    if 0<=u<SH and 0<=v<SW and m[u,v] and not seen[u,v]: seen[u,v]=1; q.append((u,v))
            if len(pts)>len(best): best=pts
pm=np.zeros((H,W),bool)
for y,x in best: pm[y+PADT,x+PADX]=1
rows=sorted(set(np.where(pm)[0])); top,bot=rows[0],rows[-1]
L={y:int(np.where(pm[y])[0].min()) for y in rows}; Rr={y:int(np.where(pm[y])[0].max()) for y in rows}
rng=np.random.RandomState(11)
EM=[]   # 불 나오는 자리: 크기·높이·뾰족함·흔들림이 자리마다 다르다 (큰 불 B · 중간 M · 잔불 S)
KIND={'B':dict(size=(5.6,6.6),rise=(30,36),licks=1,taper=1.6,sway=(1.6,2.4),wl=(13,16),lean=(0.10,0.16)),
      'M':dict(size=(3.6,4.4),rise=(18,23),licks=2,taper=1.3,sway=(0.9,1.4),wl=(9,12),lean=(0.12,0.2)),
      'S':dict(size=(2.0,2.7),rise=(8,13),licks=2,taper=1.05,sway=(0.3,0.8),wl=(6,9),lean=(0.05,0.25))}
def mk(x,y,side,kind,beat):
    k=KIND[kind]; u=lambda r: float(r[0]+rng.rand()*(r[1]-r[0]))
    return dict(x=float(x),y=int(y),out=float(side),kind=kind,size=u(k['size']),rise=u(k['rise']),licks=k['licks'],taper=k['taper'],sway=u(k['sway']),wl=u(k['wl']),lean=u(k['lean']),beat=int(beat))
PAT={-1:'MSBSMSS',1:'SBSMSMB'}
for side in (-1,1):
    for i,y in enumerate(np.linspace(top+6,bot-1,7).astype(int)):
        x=(L[y] if side<0 else Rr[y]); EM.append(mk(x+side,y,side,PAT[side][i],(i*5+(0 if side<0 else 8)+rng.randint(3))%FR))
for j,x in enumerate(np.linspace(L[bot-2]+3,Rr[bot-2]-3,4).astype(int)):
    EM.append(mk(x,bot-1,rng.choice([-1,1])*0.4,'S',rng.randint(FR)))
# 엉덩이 쪽(뒷손 뒤, 바지 오른쪽 위 가장자리): 머리카락 밖으로 보이게 바깥으로 더 기울인 불 3자리
for j,(yy,kind) in enumerate(((top+2,'M'),(top+7,'B'),(top+13,'M'))):
    e=mk(Rr[yy]+1,yy,1,kind,(j*6+2)%FR); e['lean']=0.34+0.05*j; e['hip']=True; EM.append(e)
# 바지 안쪽(검정 위에 그리는 앞 레이어) 3자리
INNER=[]   # 바지 안쪽 불 10곳 (가로 위치 비율, 종류, 밑단에서 위로 몇 칸). 한 번에 2개만 켜진다: j번째는 4프레임씩 늦게 시작해 8프레임 동안 타고, 40프레임마다 되풀이
ICYC,ILIFE,ISTEP=40,8,4
for j,(fx,kind,up) in enumerate(((0.22,'B',4),(0.72,'M',22),(0.45,'M',11),(0.82,'M',5),(0.30,'M',25),(0.60,'B',16),(0.16,'M',13),(0.52,'M',29),(0.76,'M',12),(0.38,'M',19))):
    yy=bot-up; xx=L[yy]+(Rr[yy]-L[yy])*fx; e=mk(xx,yy,(-1 if j%2 else 1)*0.25,kind,0); e['licks']=1
    e['rise']=float(min(e['rise']*0.5,max(5,yy-top-3))); e['inner']=True; e['slot']=j; INNER.append(e)
# 반대쪽 팔 = 검은 불로 된 팔 (어깨 → 팔꿈치 → 칼끝처럼 길게). 좌표는 몸 그림 기준
ARM=[(16,41),(9,68),(-27,105)]
def arm_samples():
    out=[];s=0.0
    for (x0,y0),(x1,y1) in zip(ARM,ARM[1:]):
        d=math.hypot(x1-x0,y1-y0); n=int(d/0.7)
        for i in range(n): a=i/n; out.append((x0+(x1-x0)*a+PADX,y0+(y1-y0)*a+PADT,s+d*a))
        s+=d
    return out,s
ARMS,ARML=arm_samples()
for i,sp in enumerate(np.arange(ARML*0.22,ARML-1,5.2)):
    x,y,_=min(ARMS,key=lambda p:abs(p[2]-sp)); e=mk(x,y-1,-0.35,'SMSBSMSMSSBS'[i%12],(i*7+3)%FR); e['arm']=round(float(sp),1); EM.append(e)
print('emitters',len(EM))
Y,X=np.mgrid[0:H,0:W]
C0,C2=(0,0,0,255),(54,48,63,255)
def field(t,shrink=0.0,ems=None):
    f=np.zeros((H,W),bool)
    for e in (EM if ems is None else ems):
        ex,ey,side,r0,ph,rise=e['x'],e['y'],e['out'],e['size'],e['beat'],e['rise']
        for k in range(e['licks']):
            l=((t+ph+k*FR/e['licks'])%FR)/FR
            h=rise*l**0.9
            st=rise*(max(0.0,(l-0.42)/0.58))**1.15*0.97
            thick=r0*min(l/0.15,1)*(1-0.6*l)-shrink
            if thick<=0.4 or h-st<0.3: continue
            u=st
            while u<=h:
                r=thick*(1-(u-st)/(h-st+1e-6))**e['taper']
                if r>0.3:
                    cy=ey-u; cx=ex+side*(0.6+e['lean']*u)+e['sway']*math.sin(2*math.pi*(u/e['wl']-t/FR+ph/FR))*min(1,u/5)
                    f|=((X-cx)/max(r,0.5))**2+((Y-cy)/(max(r,0.5)*1.25))**2<=1
                u+=0.6
    for (ax,ay,sp) in (ARMS if ems is None else []):                     # 팔 몸통: 어깨 쪽이 굵고 끝으로 갈수록 가늘다, 굵기가 물결치며 일렁임
        r=(2.9-2.1*(sp/ARML))+0.5*math.sin(2*math.pi*(sp/9-t/FR))-shrink*0.8
        if r>0.35: f|=(X-ax)**2+(Y-ay)**2<=max(r,0.5)**2
    base=np.zeros((H,W),bool)                # 바지 둘레에 늘 붙어 있는 얇은 불 띠
    for dy,dx in((-1,0),): base|=np.roll(np.roll(pm,dy,0),dx,1)
    return ((f|base)&~pm) if ems is None else (f&pm)
def back(t):
    f=field(t); core=field(t,1.1)
    lay=np.zeros((H,W,4),np.uint8); lay[f]=C2; lay[f&core]=C0; return Image.fromarray(lay)
def front(t):
    fr_=np.zeros((H,W,4),np.uint8)
    for e in INNER:                       # 켜진 불만: 속은 검정, 테두리는 왼쪽 30%만 지우고 끝(사라지는 쪽)은 살린다
        q=(t-e['slot']*ISTEP)%ICYC
        if q>=ILIFE: continue
        tt=q*FR/ILIFE
        fi=field(tt,0,[e]); ci=field(tt,1.1,[e]); fr_[fi]=C0; rim=fi&~ci
        rows_=np.where(fi.any(1))[0]
        if not len(rows_): continue
        keep=np.zeros((H,W),bool)
        for y in rows_:
            xs_=np.where(fi[y])[0]; xl,xr=xs_.min(),xs_.max()
            keep[y,int(math.ceil(xl+0.3*(xr-xl+1))):]=True
        keep[rows_.min():rows_.min()+3]=True
        fr_[rim&keep]=C2
    return Image.fromarray(fr_)
only=[back(t) for t in range(FR)]; fronts=[front(t) for t in range(ICYC)]
frames=[]
for t in range(80):                       # 몸 뒤 16프레임 × 몸 앞 40프레임 = 80프레임마다 한 바퀴
    c=only[t%FR].copy(); c.alpha_composite(Image.fromarray(spr),(PADX,PADT)); c.alpha_composite(fronts[t%ICYC]); frames.append(c)
import os; os.makedirs('mug4/flame',exist_ok=True); os.makedirs('mug4/full',exist_ok=True)
os.makedirs('mug4/front',exist_ok=True)
import glob
for f in glob.glob('mug4/front/*.png')+glob.glob('mug4/full/*.png'): os.remove(f)
for i,o in enumerate(only,1): o.save(f'mug4/flame/flame-{i:02d}.png')
for i,fz in enumerate(fronts,1): fz.save(f'mug4/front/front-{i:02d}.png')
for i,c in enumerate(frames,1): c.save(f'mug4/full/full-{i:02d}.png')
sheet=Image.new('RGBA',(W*8,H*2),(0,0,0,0))
for i,o in enumerate(only): sheet.paste(o,((i%8)*W,(i//8)*H))
sheet.save('mug4/flame-sheet.png')
S=4; bg=(70,84,74,255)
def gif(seq,path):
    g=[]
    for c in seq:
        b=Image.new('RGBA',(W,H),bg); b.alpha_composite(c); g.append(b.convert('RGB').resize((W*S,H*S),0).quantize(colors=64,dither=Image.Dither.NONE))
    g[0].save(path,save_all=True,append_images=g[1:],duration=MS,loop=0,disposal=2)
gif(frames,'mug4/mugetsu-flame_x4.gif'); gif(only,'mug4/flame-only_x4.gif')
c=Image.new('RGBA',(W*8,H),bg)
for i in range(8): c.alpha_composite(frames[i],(i*W,0))
c.resize((W*8*2,H*2),0).save('mug4/eight_x2.png')
import json; json.dump([dict(e,x=round(e['x']-PADX,1),y=e['y']-PADT) for e in EM+INNER],open('mug4/emitters.json','w'))
