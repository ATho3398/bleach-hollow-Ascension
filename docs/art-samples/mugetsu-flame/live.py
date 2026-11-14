# 불 나오는 자리 18곳을 몸에 붙여 두고, 나온 불은 화면에 남아 위로 올라가게 한 시험 (걷기 → 멈춤 → 돌진 → 멈춤 → 돌아오기)
import math, json, numpy as np
from PIL import Image
spr=np.array(Image.open('mug4/mugetsu.png').convert('RGBA')); SH,SW=spr.shape[:2]
EM=json.load(open('mug4/emitters.json')); INN=[e for e in EM if e.get('inner')]
blk=(spr[...,3]>0)&(spr[...,:3].astype(int).sum(2)==0); pants=np.zeros((SH,SW),bool); pants[72:108]=blk[72:108]
W,H=262,134; GROUND=H-4; DT=60; TICK=2            # 60ms 프레임, 불꽃 박자는 2프레임(120ms)에 한 칸
# 움직임 대본: (프레임 수, 프레임당 x 이동, 걷는 중인가)
SCRIPT=[(14,0,0),(44,2.0,1),(16,0,0),(9,-9.0,0),(20,0,0),(26,-0.27,1),(15,0,0)]
N=sum(s[0] for s in SCRIPT)
pos=[];x=52.0
for n,vx,walk in SCRIPT:
    for i in range(n):
        x+=vx; bob=(1 if walk and (i//4)%2 else 0); pos.append((x,bob))
drift=pos[-1][0]-52.0; pos=[(px-drift*(i+1)/N if False else px,b) for i,(px,b) in enumerate(pos)]
print('frames',N,'end x',round(pos[-1][0],1))
ARM=[(16,41),(9,68),(-27,105)]
ARMS=[];_s=0.0
for (x0,y0),(x1,y1) in zip(ARM,ARM[1:]):
    d=math.hypot(x1-x0,y1-y0); n=int(d/0.7)
    for i in range(n): a=i/n; ARMS.append((x0+(x1-x0)*a,y0+(y1-y0)*a,_s+d*a))
    _s+=d
ARML=_s
Y,X=np.mgrid[0:H,0:W]; C0,C2=(0,0,0,255),(54,48,63,255)
LIFE=26; RISE=0.62; PER=16
puffs=[]   # (태어난 프레임, x, y, 바깥 방향, 굵기, 흔들림 위상)
def emit(fr):
    sx,bob=pos[fr%N]; px,pb=pos[(fr-1)%N]
    if abs(sx-px)>40: px=sx
    k=max(1,int(math.ceil(abs(sx-px)/1.0)))          # 빨리 움직이면 사이를 메워 낸다 (한 칸에 하나)
    for j in range(k):
        a=(j+1)/k; cx=px+(sx-px)*a; oy=GROUND-SH-bob; bt=fr-1+a
        for i,e in enumerate(EM):
            if e.get('inner'):
                q=((bt/TICK-e['slot']*4)%40)/8          # 안쪽 불: 한 번에 2개만
                p=math.sin(math.pi*q)**0.6 if q<1 else 0.0
            else: p=max(0.0,math.sin(2*math.pi*((bt/TICK+e['beat'])/(PER/e['licks']))))**0.6
            if p>0.15: puffs.append((bt,cx+e['x'],oy+e['y'],e['size']*p,e))
def render(fr):
    sx,bob=pos[fr%N]; ox=int(round(sx)); oy=GROUND-SH-bob
    pm=np.zeros((H,W),bool); pm[oy:oy+SH,ox:ox+SW]=pants
    def fld(shrink,inner=False,sel=None):
        f=np.zeros((H,W),bool)
        for (b,x0,y0,th,e) in puffs:
            if bool(e.get('inner'))!=inner: continue
            if sel is not None and e is not sel: continue
            age=fr-b; life=LIFE*e['rise']/20
            if age<0 or age>=life: continue
            l=age/life; r=th*(1-l)**(0.9+0.5*e['taper'])-shrink      # 끝으로 갈수록 빨리 가늘어져 뾰족하게
            if r<0.3: continue
            r=max(r,0.5); ry=r*(1.25+1.6*l)                              # 끝은 세로로 길쭉한 바늘 모양
            u=RISE*age; cx=x0+e['out']*(0.6+e['lean']*u)+e['sway']*math.sin(2*math.pi*(u/e['wl']-fr/(PER*TICK)+e['beat']/PER))*min(1,u/5); cy=y0-u
            x1,x2=int(cx-r-1),int(cx+r+2); y1,y2=int(cy-ry-1),int(cy+ry+2)
            x1,y1=max(0,x1),max(0,y1); x2,y2=min(W,x2),min(H,y2)
            if x1>=x2 or y1>=y2: continue
            f[y1:y2,x1:x2]|=((X[y1:y2,x1:x2]-cx)/r)**2+((Y[y1:y2,x1:x2]-cy)/ry)**2<=1
        for (ax,ay,sp) in ([] if inner else ARMS):
            r=(2.9-2.1*(sp/ARML))+0.5*math.sin(2*math.pi*(sp/9-fr/(PER*TICK)))-shrink*0.8
            if r>0.35:
                r=max(r,0.5); cx=sx+ax; cy=oy+ay; x1,x2=max(0,int(cx-r-1)),min(W,int(cx+r+2)); y1,y2=max(0,int(cy-r-1)),min(H,int(cy+r+2))
                if x1<x2 and y1<y2: f[y1:y2,x1:x2]|=(X[y1:y2,x1:x2]-cx)**2+(Y[y1:y2,x1:x2]-cy)**2<=r*r
        base=np.zeros((H,W),bool)
        if shrink==0 and not inner:
            for dy,dx in((-1,0),): base|=np.roll(np.roll(pm,dy,0),dx,1)
        return (f&pm) if inner else ((f|base)&~pm)
    f=fld(0); core=fld(1.1)
    lay=np.zeros((H,W,4),np.uint8); lay[f]=C2; lay[f&core]=C0; lay[f&~core&np.roll(pm,-1,0)]=C0
    c=Image.new('RGBA',(W,H),(70,84,74,255)); c.alpha_composite(Image.fromarray(lay)); c.alpha_composite(Image.fromarray(spr),(ox,oy))
    fz=np.zeros((H,W,4),np.uint8)
    for e in INN:
        fi=fld(0,True,e); ci=fld(1.1,True,e); fz[fi]=C0; rim=fi&~ci
        rows_=np.where(fi.any(1))[0]
        if not len(rows_): continue
        keep=np.zeros((H,W),bool)
        for y in rows_:
            xs_=np.where(fi[y])[0]; xl,xr=xs_.min(),xs_.max()
            keep[y,int(math.ceil(xl+0.3*(xr-xl+1))):]=True
        keep[rows_.min():rows_.min()+3]=True
        fz[rim&keep]=C2
    c.alpha_composite(Image.fromarray(fz)); return c
# 한 바퀴 미리 돌려 불을 채운 뒤 두 번째 바퀴를 찍는다 (처음과 끝이 이어지게)
for fr in range(N): emit(fr)
out=[]
for fr in range(N,2*N):
    emit(fr); puffs=[p for p in puffs if fr-p[0]<LIFE*2]; out.append(render(fr))
S=3; g=[c.convert('RGB').resize((W*S,H*S),0).quantize(colors=64,dither=Image.Dither.NONE) for c in out]
g[0].save('mug4/live-demo_x3.gif',save_all=True,append_images=g[1:],duration=DT,loop=0,disposal=2)
pick=[20,40,60,76,80,84,100,125]
c=Image.new('RGB',(W*4,H*2),(70,84,74))
for i,k in enumerate(pick): c.paste(out[k].convert('RGB'),((i%4)*W,(i//4)*H))
c.resize((W*4*2,H*2*2),0).save('mug4/live-contact_x2.png'); print('ok')
