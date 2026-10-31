import json,math,sys
import numpy as np
from PIL import Image
sys.path.insert(0,'.')
import kin
from kin import mats, ap, rig
R=kin.R
mo=json.load(open(R+'motions.json'))
def tracks_for(body,mid='ultimate'):
    t=json.loads(json.dumps(mo[mid]['tracks'])); sn=rig['bodyMotions'].get(body)
    if sn and mid in mo['sets'].get(sn,{}): t.update(mo['sets'][sn][mid].get('tracks',{}))
    return t
def piv(body,i):
    bj=rig['bodyJoints'].get(body) or {}; return (bj.get('pivots') or {}).get(i, next(b for b in rig['bones'] if b['id']==i)['pivot'])
def handR_local(body):
    part=rig['bodies'][body]['forearm_R']; a=np.array(Image.open(R+'humanoid/'+part['art']+'.png'))[...,3]>0
    ys,xs=np.nonzero(a); xs=xs+part['at'][0]+.5; ys=ys+part['at'][1]+.5; el=piv(body,'forearm_R')
    k=((xs-el[0])**2+(ys-el[1])**2).argmax(); return (xs[k],ys[k])
def handL_local(body): return piv(body,'weapon')
def world_hand(body,tr,side,t):
    M,B=mats(tr,t,body)
    if side=='R': return ap(M['forearm_R'],handR_local(body))
    return ap(M['forearm_L'],handL_local(body))
def samp(tr,b,t): return kin.samp(tr.get(b),t)
def rot(v,deg):
    r=np.radians(deg); c,s=np.cos(r),np.sin(r); return (c*v[0]-s*v[1], s*v[0]+c*v[1])
def solve(body,tr,side,target,ref,t):
    up,lo=('arm_R','forearm_R') if side=='R' else ('arm_L','forearm_L')
    tz=json.loads(json.dumps(tr))
    for b in (up,lo): tz[b]=[[0,0,0,0],[2000,0,0,0]]
    M,B=mats(tz,t,body)
    S=ap(M[B[up]['parent']],B[up]['pivot']); E=ap(M[B[lo]['parent']],B[lo]['pivot'])
    H=world_hand(body,tz,side,t)
    A,F=np.meshgrid(np.arange(-180,181),np.arange(-180,181),indexing='ij')
    ex,ey=rot((E[0]-S[0],E[1]-S[1]),A); ex+=S[0]; ey+=S[1]
    hx,hy=rot((H[0]-E[0],H[1]-E[1]),A+F); hx+=ex; hy+=ey
    cost=np.hypot(hx-target[0],hy-target[1])+0.01*(np.abs(A-ref[0])+np.abs(F-ref[1]))
    i=np.unravel_index(cost.argmin(),cost.shape); return int(A[i]),int(F[i]),float(np.hypot(hx-target[0],hy-target[1])[i])
