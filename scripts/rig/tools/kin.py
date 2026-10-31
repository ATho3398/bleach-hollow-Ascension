# 사람형 자세 계산기(작업본): 시각 t 의 뼈 행렬 → 칼날 방향(도, 0=뒤 180=앞 +90=아래)·관절 위치
import json, math
R='/home/user/bleach-hollow-Ascension/docs/design/rig-draft/'
rig=json.load(open(R+'humanoid.json'))
def ease(u): return u*u*(3-2*u)
def samp(keys,t):
    if not keys: return (0,0,0)
    if t<=keys[0][0]: return tuple(keys[0][1:])
    for a,b in zip(keys,keys[1:]):
        if t<=b[0]:
            u=ease((t-a[0])/max(1,b[0]-a[0])); return tuple(a[i]+(b[i]-a[i])*u for i in (1,2,3))
    return tuple(keys[-1][1:])
def mul(a,b): return [a[0]*b[0]+a[2]*b[1],a[1]*b[0]+a[3]*b[1],a[0]*b[2]+a[2]*b[3],a[1]*b[2]+a[3]*b[3],a[0]*b[4]+a[2]*b[5]+a[4],a[1]*b[4]+a[3]*b[5]+a[5]]
def mats(tracks,t,body='shinigami'):
    bj=rig['bodyJoints'].get(body) or {}
    bones={b['id']:dict(b,pivot=(bj.get('pivots') or {}).get(b['id'],b['pivot']),restRot=b.get('restRot',0)+(bj.get('rot') or {}).get(b['id'],0)) for b in rig['bones']}
    out={}
    def get(i):
        if i in out: return out[i]
        b=bones[i]; rot,x,y=samp(tracks.get(i),t)
        r=math.radians(rot+b['restRot']);c,s=math.cos(r),math.sin(r);px,py=b['pivot']
        M=[c,s,-s,c,px-c*px+s*py+x,py-s*px-c*py+y]; w=mul(get(b['parent']),M) if b['parent'] else M; out[i]=w; return w
    for b in bones: get(b)
    return out,bones
def ap(M,p): return (M[0]*p[0]+M[2]*p[1]+M[4], M[1]*p[0]+M[3]*p[1]+M[5])
def sword_dir(tracks,t,body='shinigami'):
    M,_=mats(tracks,t,body); ax=rig['swordAxis']; g,tp=ax['grip'],ax['tip']; W=M['weapon']
    dx=W[0]*(tp[0]-g[0])+W[2]*(tp[1]-g[1]); dy=W[1]*(tp[0]-g[0])+W[3]*(tp[1]-g[1]); return math.degrees(math.atan2(dy,dx))
def joint(tracks,t,bone,body='shinigami'):
    M,B=mats(tracks,t,body); b=B[bone]; return ap(M[b['parent']] if b['parent'] else M[bone], b['pivot'])
