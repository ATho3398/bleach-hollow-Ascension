import json,math
from PIL import Image
import numpy as np
R='/home/user/bleach-hollow-Ascension/docs/design/rig-draft/'
rig=json.load(open(R+'humanoid.json'))
B={b['id']:b for b in rig['bones']}
def info(body, rot_over=None):
    bj=rig['bodyJoints'].get(body) or {}; pv=bj.get('pivots') or {}; rt=dict(bj.get('rot') or {})
    if rot_over: rt.update(rot_over)
    P=lambda i: pv.get(i,B[i]['pivot'])
    sh,el=P('arm_R'),P('forearm_R')
    part=rig['bodies'][body]['forearm_R']; a=np.array(Image.open(R+'humanoid/'+part['art']+'.png'))[...,3]>0
    ys,xs=np.nonzero(a); xs=xs+part['at'][0]+.5; ys=ys+part['at'][1]+.5
    d=(xs-el[0])**2+(ys-el[1])**2; k=d.argmax(); hand=(xs[k],ys[k])
    dU=math.degrees(math.atan2(el[1]-sh[1],el[0]-sh[0]))
    dF=math.degrees(math.atan2(hand[1]-el[1],hand[0]-el[0]))
    t=rt.get('torso',0); u=rt.get('arm_R',0); f=rt.get('forearm_R',0)
    return dU+t+u, dF+t+u+f   # world dirs at motion 0
tU,tF=info('arrancar_f',{'arm_R':28,'forearm_R':-47})
print('target',round(tU),round(tF))
for b in ['shinigami','shinigami_f','student','student_f','arrancar','arrancar_f','bare','female']:
    U,F=info(b); mu=tU-U; mf=tF-F-mu
    print(b, round(mu), round(mf))
