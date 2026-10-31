# 아란칼(여) 해방(release1)을 남자 몸에: 두 팔(위팔·아래팔) 방향을 몸마다 맞추고 칼 방향도 맞춤, 나머지 뼈는 그대로
import json,re,math,importlib
import kin
from kin import mats, ap, rig
from ultik import handR_local, handL_local, piv
R=kin.R; mp=R+'motions.json'; rp=R+'humanoid.json'
mo=json.load(open(mp)); src=mo['sets']['arrancarRelease']['release1']
def rest(body):
    M,B=mats({},0,body)
    def d(a,b): return math.degrees(math.atan2(b[1]-a[1],b[0]-a[0]))
    out={}
    for s,(up,lo,hand) in {'R':('arm_R','forearm_R',handR_local),'L':('arm_L','forearm_L',handL_local)}.items():
        S=ap(M[up],B[up]['pivot']); E=ap(M[lo],B[lo]['pivot']); H=ap(M[lo],hand(body))
        out[s]=(d(S,E),d(E,H))
    out['W']=kin.sword_dir({},0,body)
    return out
rs=rest('arrancar_f')
rig_=json.load(open(rp)); bm=rig_['bodyMotions']
for body in ['shinigami','student','arrancar','bare']:
    rb=rest(body); tr=json.loads(json.dumps(src['tracks']))
    for s,(up,lo) in {'R':('arm_R','forearm_R'),'L':('arm_L','forearm_L')}.items():
        du=rs[s][0]-rb[s][0]; df=(rs[s][1]-rb[s][1])-du
        for k in tr[up]: k[1]=round(k[1]+du)
        for k in tr[lo]: k[1]=round(k[1]+df)
    dw=(rs['W']-rb['W'])-((rs['L'][1]-rb['L'][1]))  # 칼 = 아래팔 방향 차이를 뺀 나머지
    for k in tr['weapon']: k[1]=round(k[1]+dw)
    sn=bm.setdefault(body,body)
    st=mo['sets'].setdefault(sn,{})
    st['release1']={k:v for k,v in src.items() if k!='note'}|{'tracks':tr}
    print(body,sn,'R',round(rs['R'][0]-rb['R'][0]),'L',round(rs['L'][0]-rb['L'][0]),'w',round(dw))
s2=json.dumps(mo,ensure_ascii=False,indent=1)
s2=re.sub(r'\[\s+(-?[\d.]+),\s+(-?[\d.]+),\s+(-?[\d.]+),\s+(-?[\d.]+)\s+\]', r'[\1, \2, \3, \4]', s2)
s2=re.sub(r'\[\s+(-?[\d.]+),\s+(-?[\d.]+)\s+\]', r'[\1, \2]', s2)
open(mp,'w').write(s2+'\n')
import sys; sys.path.insert(0,'/home/user/bleach-hollow-Ascension/scripts/rig')
from feet_weapon import dump; dump(rig_)
