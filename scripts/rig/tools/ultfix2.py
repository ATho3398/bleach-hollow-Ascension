from ultik import *
def inv(M):
    a,b,c,d,e,f=M; det=a*d-b*c; return [d/det,-b/det,-c/det,a/det,(c*f-d*e)/det,(b*e-a*f)/det]
T=380; LAM=float(sys.argv[1]) if len(sys.argv)>1 else 0.12
SIDES={'R':('arm_R','forearm_R'),'L':('arm_L','forearm_L')}
def dirs(body,tr,s,t):
    up,lo=SIDES[s]; M,B=mats(tr,t,body)
    S=ap(M[up],B[up]['pivot']); E=ap(M[lo],B[lo]['pivot']); H=world_hand(body,tr,s,t)
    return math.degrees(math.atan2(E[1]-S[1],E[0]-S[0])), math.degrees(math.atan2(H[1]-E[1],H[0]-E[0]))
ref='shinigami'; trS=tracks_for(ref); MS,_=mats(trS,T,ref)
tgt={s:ap(inv(MS['torso']),world_hand(ref,trS,s,T)) for s in 'RL'}
want={s:dirs(ref,trS,s,T) for s in 'RL'}
sd_ref=kin.sword_dir(trS,T,ref)
out={}
for body in ['shinigami','shinigami_f','student','student_f','arrancar','arrancar_f','bare','female']:
    tr=tracks_for(body); M,_=mats(tr,T,body); res={}
    for s,(up,lo) in SIDES.items():
        tz=json.loads(json.dumps(tr)); tz[up]=[[0,0,0,0]]; tz[lo]=[[0,0,0,0]]
        du,df=dirs(body,tz,s,T); ra=want[s][0]-du; rf=want[s][1]-df-ra
        target=ap(M['torso'],tgt[s])
        Mz,B=mats(tz,T,body); S=ap(Mz[B[up]['parent']],B[up]['pivot']); E=ap(Mz[up],B[lo]['pivot']); H=world_hand(body,tz,s,T)
        A,F=np.meshgrid(np.arange(-180,181),np.arange(-180,181),indexing='ij')
        ex,ey=rot((E[0]-S[0],E[1]-S[1]),A); ex+=S[0]; ey+=S[1]
        hx,hy=rot((H[0]-E[0],H[1]-E[1]),A+F); hx+=ex; hy+=ey
        dist=np.hypot(hx-target[0],hy-target[1])
        dd=lambda x:np.abs((x+180)%360-180)
        cost=dist+LAM*(dd(A-ra)+dd(F-rf))
        i=np.unravel_index(cost.argmin(),cost.shape); a,f=int(A[i]),int(F[i])
        # 남는 거리 = 위팔째 옮김(팔꿈치는 붙은 채) — 부모(몸통) 좌표로
        Mt=mats(tz,T,body)[0][B[up]['parent']]; inv_t=inv(Mt)
        p1=ap(inv_t,(target[0],target[1])); p0=ap(inv_t,(float(hx[i]),float(hy[i])))
        res[s]=(a,f,round(p1[0]-p0[0]),round(p1[1]-p0[1]),round(float(dist[i]),1),(round(ra),round(rf)))
    tr2=json.loads(json.dumps(tr))
    for s,(up,lo) in SIDES.items():
        a,f,dx,dy=res[s][:4]
        tr2[up]=[[k[0],a,dx,dy] if k[0] in (380,700) else k for k in tr2[up]]
        tr2[lo]=[[k[0],f,0,0] if k[0] in (380,700) else k for k in tr2[lo]]
    w0=samp(tr2,'weapon',T)[0]; w=round(w0+(sd_ref-kin.sword_dir(tr2,T,body)))
    out[body]={'R':res['R'],'L':res['L'],'w':w}; print(body,res,'w',w)
json.dump(out,open('ultfix.json','w'))
