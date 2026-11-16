# 무월 불꽃 — 움직임 시험 2: 불을 '뿌려 쌓는' 대신, 제자리 그림(flame3.py)과 똑같은 불 줄기 모양을 매 프레임 지금 자리에서 다시 그린다.
# 줄기의 높은 곳일수록 '조금 전의 몸 위치'를 따라가게 해서(지연) 움직이면 줄기가 뒤로 휘어 끌린다. 서 있으면 제자리 그림과 같다.
import math, json, numpy as np
from PIL import Image
spr=np.array(Image.open('mug4/mugetsu.png').convert('RGBA')); SH,SW=spr.shape[:2]
EM=json.load(open('mug4/emitters.json'))
blk=(spr[...,3]>0)&(spr[...,:3].astype(int).sum(2)==0); pants=np.zeros((SH,SW),bool); pants[72:108]=blk[72:108]
wd=pants.sum(1); pants[int(np.where(wd>=0.5*wd.max())[0].max())+1:]=False
W,H=262,134; GROUND=H-4; DT=60; TICK=2; FR=16
SCRIPT=[(14,0,0),(44,2.0,1),(16,0,0),(9,-9.0,0),(20,0,0),(26,-0.27,1),(15,0,0)]
N=sum(s[0] for s in SCRIPT); pos=[]; x=52.0
for n,vx,walk in SCRIPT:
    for i in range(n): x+=vx; pos.append((x,(1 if walk and (i//4)%2 else 0)))
ARM=[(16,41),(9,68),(-27,105)]; ARMS=[]; _s=0.0
for (x0,y0),(x1,y1) in zip(ARM,ARM[1:]):
    d=math.hypot(x1-x0,y1-y0); n=int(d/0.7)
    for i in range(n): a=i/n; ARMS.append((x0+(x1-x0)*a,y0+(y1-y0)*a,_s+d*a))
    _s+=d
ARML=_s
Y,X=np.mgrid[0:H,0:W]; C0,C2=(0,0,0,255),(54,48,63,255)
LAG=0.55      # 불이 프레임(60ms)마다 올라가는 칸 수 — 높이 u 인 곳은 u/LAG 프레임 전의 몸 위치를 따른다
MAXLAG=9.0   # 줄기가 뒤로 끌리는 최대 칸 수 (빨리 달려도 줄기가 끊기지 않게)
def at(fr,delay):
    cur,bob=pos[fr%N]; t0=fr-delay; i0=math.floor(t0); a=t0-i0
    x0=pos[int(i0)%N][0]; x1=pos[int(i0+1)%N][0]
    if abs(x0-cur)>60: x0=cur
    if abs(x1-cur)>60: x1=cur
    sx=x0+(x1-x0)*a
    return cur+max(-MAXLAG,min(MAXLAG,sx-cur)),GROUND-SH-bob
def disc(f,cx,cy,rx,ry):
    x1,x2=max(0,int(cx-rx-1)),min(W,int(cx+rx+2)); y1,y2=max(0,int(cy-ry-1)),min(H,int(cy+ry+2))
    if x1<x2 and y1<y2: f[y1:y2,x1:x2]|=((X[y1:y2,x1:x2]-cx)/rx)**2+((Y[y1:y2,x1:x2]-cy)/ry)**2<=1
def field(fr,shrink,inner):
    t=fr//TICK; f=np.zeros((H,W),bool)            # 불꽃 모양은 120ms(2프레임)마다 한 번만 바뀐다 — 도트 게임 느낌
    for e in EM:
        if bool(e.get('inner'))!=inner: continue
        arm=e.get('arm') is not None; r0,rise,ph=e['size'],e['rise'],e['beat']
        if not inner and not arm: r0*=1.7; rise*=1.4
        licks=[0] if inner else range(e['licks'])
        for k in licks:
            if inner:
                q=(t-e['slot']*4)%40
                if q>=8: continue
                l=q/8
            else: l=((t+ph+k*FR/e['licks'])%FR)/FR
            if arm: amp=0.5-0.5*math.cos(2*math.pi*l); h=rise*0.75*(0.35+0.65*amp); st=0.0; thick=1.55*r0*(0.6+0.4*amp)-shrink
            else: h=rise*l**0.9; st=rise*(max(0.0,(l-0.42)/0.58))**1.15*0.97; thick=r0*min(l/0.15,1)*(1-0.6*l)-shrink
            if thick<=0.4 or h-st<0.3: continue
            hk=(1 if (ph+k)%2 else -1); span=h-st+1e-6; u=st
            def P(u_):                                   # 높이 u 인 점의 화면 자리 (지연된 몸 위치 기준)
                q_=(u_-st)/span; sx,oy=at(fr,0 if arm else min(22,u_/LAG))
                cx=sx+e['x']+e['out']*(0.6+e['lean']*u_)+e['sway']*math.sin(2*math.pi*(u_/e['wl']-t/FR+ph/FR))*min(1,u_/5)+hk*0.34*span*q_**2.6
                return cx,oy+e['y']-u_+0.10*span*q_**4,q_
            while u<=h:
                cx,cy,q_=P(u); r=thick*(1-q_)**e['taper']*min(1.0,(u-st+0.7)/max(1.0,0.9*thick))
                if r>0.3: disc(f,cx,cy,max(r,0.5),max(r,0.5)*1.35)
                u+=0.6
            if not inner and thick>1.6 and span>6:         # 옆 가시
                q0=0.38; u0=st+span*q0; bx,by,_=P(u0); r0_=thick*(1-q0)**e['taper']; bl_=0.42*span; v=0.0
                while v<bl_:
                    qq=v/bl_; rr=r0_*0.75*(1-qq)**1.4
                    if rr>0.3: disc(f,bx-hk*(0.55*v+0.25*bl_*qq*qq),by-0.85*v,max(rr,0.5),max(rr,0.5)*1.3)
                    v+=0.6
    return f
def blade(fr,shrink):
    f=np.zeros((H,W),bool); t=fr//TICK
    for i,(ax,ay,sp) in enumerate(ARMS):
        sx,oy=at(fr,min(6,3.0*sp/ARML))                    # 칼끝이 살짝 늦게 따라온다
        r=2.0*(2.9-2.7*(sp/ARML))+0.9*(1-0.85*sp/ARML)*math.sin(2*math.pi*(sp/9-t/FR))-shrink*0.8
        if r>0.35: disc(f,sx+ax,oy+ay,max(r,0.5),max(r,0.5))
    return f
def render(fr):
    sx,bob=pos[fr%N]; ox=int(round(sx)); oy=GROUND-SH-bob
    pm=np.zeros((H,W),bool); pm[oy:oy+SH,ox:ox+SW]=pants
    f=(field(fr,0,False)|blade(fr,0)|np.roll(pm,-1,0))&~pm; core=(field(fr,1.1,False)|blade(fr,1.1))&~pm
    lay=np.zeros((H,W,4),np.uint8); lay[f]=C2; lay[f&core]=C0
    c=Image.new('RGBA',(W,H),(70,84,74,255)); c.alpha_composite(Image.fromarray(lay)); c.alpha_composite(Image.fromarray(spr),(ox,oy))
    fi=field(fr,0,True)&pm; ci=field(fr,1.1,True)&pm; fz=np.zeros((H,W,4),np.uint8); fz[fi]=C0
    rim=fi&~ci; ys=np.where(fi.any(1))[0]
    if len(ys):
        keep=np.zeros((H,W),bool)
        for y in ys:
            xs=np.where(fi[y])[0]; keep[y,int(math.ceil(xs.min()+0.3*(xs.max()-xs.min()+1))):]=True
        fz[rim&keep]=C2
    c.alpha_composite(Image.fromarray(fz)); return c
out=[render(fr) for fr in range(N,2*N)]
S=3; g=[c.convert('RGB').resize((W*S,H*S),0).quantize(colors=64,dither=Image.Dither.NONE) for c in out]
g[0].save('mug4/live2-demo_x3.gif',save_all=True,append_images=g[1:],duration=DT,loop=0,disposal=2)
pick=[20,40,60,76,80,84,100,125]; c=Image.new('RGB',(W*4,H*2),(70,84,74))
for i,k in enumerate(pick): c.paste(out[k].convert('RGB'),((i%4)*W,(i//4)*H))
c.resize((W*4*2,H*2*2),0).save('mug4/live2-contact_x2.png'); print('ok',N)
