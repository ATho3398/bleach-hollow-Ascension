# 작업본 사람형 자세 그리기(시험용): python3 rr.py <동작 json 파일> <외형> <out.png> t1 t2 ...
import json, math, sys, os
from PIL import Image, ImageDraw
R='/home/user/bleach-hollow-Ascension/docs/design/rig-draft/'
rig=json.load(open(R+'humanoid.json'))
mot=json.load(open(sys.argv[1]))
look=sys.argv[2]; out=sys.argv[3]; ts=[int(t) for t in sys.argv[4:]]
def mul(m,n): return [m[0]*n[0]+m[2]*n[1],m[1]*n[0]+m[3]*n[1],m[0]*n[2]+m[2]*n[3],m[1]*n[2]+m[3]*n[3],m[0]*n[4]+m[2]*n[5]+m[4],m[1]*n[4]+m[3]*n[5]+m[5]]
def ease(u): return u*u*(3-2*u)
def samp(keys,t):
    if t<=keys[0][0]: return keys[0][1:]
    for a,b in zip(keys,keys[1:]):
        if t<=b[0]:
            u=ease((t-a[0])/max(1,b[0]-a[0])); return [a[i]+(b[i]-a[i])*u for i in (1,2,3)]
    return keys[-1][1:]
L=rig['looks'][look]; body=L['body']; bj=rig['bodyJoints'].get(body) or {}
bones={b['id']:dict(b,pivot=(bj.get('pivots') or {}).get(b['id'],b['pivot']),restRot=b.get('restRot',0)+(bj.get('rot') or {}).get(b['id'],0)) for b in rig['bones']}
vx,vy,vw,vh=-58,-16,113,98;K=3
frames=[]
for t in ts:
    mats={}
    def get(i):
        if i in mats: return mats[i]
        b=bones[i]; rot,x,y=samp(mot['tracks'][i],t) if i in mot['tracks'] else (0,0,0)
        r=math.radians(rot+b['restRot']);c,s=math.cos(r),math.sin(r);px,py=b['pivot']
        m=[c,s,-s,c,px-c*px+s*py+x,py-s*px-c*py+y]
        w=mul(get(b['parent']),m) if b['parent'] else m; mats[i]=w; return w
    im=Image.new('RGBA',(vw*K,vh*K),(160,180,155,255))
    slots=[x for x in rig['slots'] if x['id'] not in mot.get('hide',[])]
    fr=mot.get('front',[]); slots=[x for x in slots if x['id'] not in fr]+[x for f in fr for x in slots if False]+[x for f in fr for x in rig['slots'] if x['id']==f and x['id'] not in mot.get('hide',[])]
    for s in slots:
        part=rig['bodies'][body].get(s['id']) or (L.get(s['id']) if isinstance(L.get(s['id']),dict) else None)
        if not part: continue
        m=mul(get(s['bone']),[1,0,0,1,part['at'][0],part['at'][1]])
        if s['id'] in mot.get('flip',[]):
            ax=rig['swordAxis'] if s['id']=='weapon' else {'grip':[part['size'][0]/2,0],'tip':[part['size'][0]/2,1]}
            gx,gy=ax['grip'][0]+.5,ax['grip'][1]+.5;dx,dy=ax['tip'][0]-ax['grip'][0],ax['tip'][1]-ax['grip'][1];n=math.hypot(dx,dy);dx,dy=dx/n,dy/n
            a,b2,d=2*dx*dx-1,2*dx*dy,2*dy*dy-1; m=mul(m,[a,b2,b2,d,gx-a*gx-b2*gy,gy-b2*gx-d*gy])
        a,b,c,d,e,f=m;det=a*d-b*c;ia,ib,ic,id_=d/det,-b/det,-c/det,a/det;ie,if_=-(ia*e+ic*f),-(ib*e+id_*f)
        co=(ia/K,ic/K,ia*vx+ic*vy+ie,ib/K,id_/K,ib*vx+id_*vy+if_)
        src=Image.open(R+'humanoid/'+part['art']+'.png').convert('RGBA')
        im.alpha_composite(src.transform(im.size,Image.AFFINE,co,resample=Image.NEAREST))
    dr=ImageDraw.Draw(im); gy=(rig['ground']+1-vy)*K; dr.line([(0,gy),(vw*K,gy)],fill=(60,60,60,255)); dr.text((4,4),str(t),fill=(0,0,0,255))
    frames.append(im)
o=Image.new('RGBA',(vw*K*len(frames),vh*K))
for i,f in enumerate(frames): o.paste(f,(i*vw*K,0))
o.save(out)
