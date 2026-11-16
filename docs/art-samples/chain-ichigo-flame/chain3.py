# 혈쇄 이치고 사슬 불꽃 (참고 GIF 느낌): 사슬이 달아올라 빛나고, 풀린 끝은 짧게 나부끼다 고리 조각·불티로 부서져 날아간다. 16프레임(120ms) 반복
# 레이어: back(몸 뒤: 사슬 끝 + 조각 + 빛무리) → body.png(밖으로 나온 촉수를 지운 몸) → front(몸 앞: 몸에 두른 사슬의 빛무리·달아오른 점)
import math, numpy as np
from PIL import Image
body=np.array(Image.open('chain3/body.png').convert('RGBA')); SH,SW=body.shape[:2]      # 사용자 새 조각 시트(2026-11-16)를 종이인형 쉬는 자세 자리대로 조립한 몸
PADX,PADT=18,10; W,H=SW+PADX*2,SH+PADT; FR,MS=16,120
Y,X=np.mgrid[0:H,0:W]
DARK,RED,ORG,HOT,GLOW=(95,20,30),(172,49,59),(236,110,60),(255,190,90),(225,40,45)
# 사슬 띠(몸 앞 이펙트): 목 · 두 손목 · 두 발목. 몸 그림 좌표의 꺾은선
BANDS=[[(np.float64(25.5), np.float64(40.5)), (np.float64(31.5), np.float64(42.0)), (np.float64(37.5), np.float64(40.5))], [(np.float64(16.5), np.float64(63.5)), (np.float64(19.5), np.float64(65.0)), (np.float64(22.5), np.float64(63.5))], [(np.float64(44.5), np.float64(61.5)), (np.float64(47.0), np.float64(63.0)), (np.float64(49.5), np.float64(61.5))], [(np.float64(24.5), np.float64(97.5)), (np.float64(28.0), np.float64(99.0)), (np.float64(31.5), np.float64(97.5))], [(np.float64(38.5), np.float64(95.5)), (np.float64(42.0), np.float64(97.0)), (np.float64(45.5), np.float64(95.5))]]
# 풀린 끝(몸 뒤 이펙트): 띠마다 한 줄기, 짧게 나부끼다 조각·불티로 흩어진다
T=[{'x': np.float64(37.5), 'y': np.float64(40.5), 'ang': 12, 'L': 6, 'w': 1.2, 'curl': 2.0, 'ph': 0.0, 'sw': 0.25}, {'x': np.float64(16.5), 'y': np.float64(63.5), 'ang': 170, 'L': 6, 'w': 1.2, 'curl': -4.0, 'ph': 0.35}, {'x': np.float64(49.5), 'y': np.float64(61.5), 'ang': 15, 'L': 6, 'w': 1.2, 'curl': 4.0, 'ph': 0.6}, {'x': np.float64(24.5), 'y': np.float64(97.5), 'ang': 160, 'L': 5, 'w': 1.1, 'curl': -4.0, 'ph': 0.15}, {'x': np.float64(45.5), 'y': np.float64(95.5), 'ang': 20, 'L': 5, 'w': 1.1, 'curl': 4.0, 'ph': 0.8}]
def path(tn,t):
    x,y=tn['x']+PADX,tn['y']+PADT; pts=[]; s=0.0; ds=0.5; L=tn['L']
    while s<L:
        u=s/L
        a=math.radians(tn['ang']+tn['curl']*8*u*u*u+tn.get('sw',1.0)*(6+30*u)*math.sin(2*math.pi*(s/10-t/FR+tn['ph'])))
        x+=math.cos(a)*ds; y-=math.sin(a)*ds; s+=ds; pts.append((x,y,u,s,a))
    return pts
def put(lay,m,c,a=255):
    lay[m]=(c[0],c[1],c[2],a)
def dil(m,n=1):
    o=m.copy()
    for _ in range(n):
        p=o.copy()
        for dy,dx in((1,0),(-1,0),(0,1),(0,-1)): p|=np.roll(np.roll(o,dy,0),dx,1)
        o=p
    return o
# 사슬 띠 칸과 띠를 따라 잰 거리
cb=np.zeros((H,W),bool); cs=np.zeros((H,W))
for band in BANDS:
    acc=0.0
    for (x0,y0),(x1,y1) in zip(band,band[1:]):
        d=math.hypot(x1-x0,y1-y0); n=max(1,int(d/0.4))
        for i in range(n+1):
            q=i/n; px=x0+(x1-x0)*q+PADX; py=y0+(y1-y0)*q+PADT
            m=((X-px)**2+(Y-py)**2<=1.25**2)&~cb; cb|=m; cs[m]=acc+d*q
        acc+=d
backs=[];fronts=[];frames=[]
for t in range(FR):
    pulse=0.5+0.5*math.sin(2*math.pi*t/FR)
    back=np.zeros((H,W,4),np.uint8); solid=np.zeros((H,W),bool)
    cells=[]   # (mask, colour)
    for tn in T:
        pts=path(tn,t); om=np.zeros((H,W),bool); fm=np.zeros((H,W),bool); sm=np.zeros((H,W)); um=np.zeros((H,W))
        for (x,y,u,s,a) in pts:
            w=max(tn['w']*(1-u)**0.5,0.5); d2=(X-x)**2+(Y-y)**2
            if u<0.5: om|=d2<=(w+1.0)**2
            new=(d2<=w*w)&~fm; fm|=d2<=w*w; sm[new]=s; um[new]=u
        broken=fm&((um<0.5)|((sm//2.0)%2==0))                # 끝 절반은 고리가 끊어져 보인다
        cells.append((broken&(um<0.5)&((sm//3.2)%2==1),DARK,255)); cells.append((broken&(um<0.5)&((sm//3.2)%2==0),RED,255))
        cells.append((broken&(um>=0.5)&(um<0.8),ORG,255)); cells.append((broken&(um>=0.8),HOT,255))
        solid|=broken
        # 끝에서 떨어져 날아가는 고리 조각·불티
        for k in range(6):
            tb=(k*FR/6+tn['ph']*FR)%FR; age=(t-tb)%FR
            if age>=11: continue
            px,py,_,_,ang=path(tn,tb)[-1]
            vx=math.cos(ang)*0.45+0.38; vy=-math.sin(ang)*0.25-0.42
            fx=px+vx*age+1.2*math.sin(2*math.pi*(age/9+k/6)); fy=py+vy*age
            size=2 if age<5 and k%2==0 else 1
            m=(np.abs(X-round(fx))<size)&(np.abs(Y-round(fy))<(1 if size==1 else (1 if k%4 else 2)))
            col,al=(HOT,255) if age<3 else (ORG,255) if age<6 else (RED,200) if age<9 else (RED,120)
            cells.append((m,col,al)); 
            if age<6: solid|=m
    # 빛무리: 사슬 끝·조각 둘레에 반투명 붉은 빛 (두 겹, 맥박처럼 밝아졌다 어두워짐)
    g1=dil(solid,1)&~solid; g2=dil(solid,3)&~dil(solid,1)
    put(back,g2,GLOW,int(28+30*pulse)); put(back,g1,GLOW,int(70+60*pulse))
    for m,c,a in cells: put(back,m,c,a)
    # 몸 앞: 두른 사슬이 달아오름
    front=np.zeros((H,W,4),np.uint8)
    h1=dil(cb,1)&~cb; h2=dil(cb,2)&~dil(cb,1)
    put(front,h2,GLOW,int(22+28*pulse)); put(front,h1,GLOW,int(55+55*pulse))
    put(front,cb&((cs//2.2)%2==0),RED); put(front,cb&((cs//2.2)%2==1),DARK)      # 고리 무늬
    wave=np.sin(2*math.pi*(cs/9-t/FR))
    put(front,cb&(wave>0.45),ORG); put(front,cb&(wave>0.88),HOT)                  # 달아오른 점이 사슬을 따라 흐른다
    backs.append(Image.fromarray(back)); fronts.append(Image.fromarray(front))
    c=Image.fromarray(back.copy()); c.alpha_composite(Image.fromarray(body),(PADX,PADT)); c.alpha_composite(fronts[-1]); frames.append(c)
import os
for d in ('back','front'): os.makedirs('chain3/'+d,exist_ok=True)
for i,(bk,fz) in enumerate(zip(backs,fronts),1): bk.save(f'chain3/back/back-{i:02d}.png'); fz.save(f'chain3/front/front-{i:02d}.png')
Image.fromarray(body).save('chain3/body.png')
S=4
def gif(seq,path,bg):
    g=[]
    for c in seq:
        b_=Image.new('RGBA',(W,H),bg); b_.alpha_composite(c); g.append(b_.convert('RGB').resize((W*S,H*S),0).quantize(colors=128,dither=Image.Dither.NONE))
    g[0].save(path,save_all=True,append_images=g[1:],duration=MS,loop=0,disposal=2)
gif(frames,'chain3/chain-ichigo-dark_x4.gif',(18,14,20,255)); gif(frames,'chain3/chain-ichigo_x4.gif',(70,84,74,255))
c=Image.new('RGBA',(W*4,H*2),(18,14,20,255))
for i,k in enumerate((0,4,8,12)): c.alpha_composite(frames[k],(i*W,0))
c2=Image.new('RGBA',(W*4,H),(70,84,74,255))
for i,k in enumerate((0,4,8,12)): c2.alpha_composite(frames[k],(i*W,0))
c.alpha_composite(c2,(0,H)); c.resize((W*4*3,H*2*3),0).save('chain3/eight_x3.png'); print('canvas',W,H)
