import json,subprocess,sys
from PIL import Image
R='/home/user/bleach-hollow-Ascension/docs/design/rig-draft/'
mo=json.load(open(R+'motions.json')); rig=json.load(open(R+'humanoid.json'))
mid=sys.argv[1]; ts=sys.argv[2].split(','); out=sys.argv[3]
ls='shinigami-base shinigami-base-f shinigami-student shinigami-student-f arrancar-base arrancar-base-f bare-base female-base'.split()
rows=[]
for l in ls:
    b=rig['looks'][l]['body']; sn=rig['bodyMotions'].get(b); m=json.loads(json.dumps(mo.get(mid) or {'duration':1700,'tracks':{}}))
    if sn and mid in mo['sets'].get(sn,{}) and mid not in mo: m={**m,**{k:v for k,v in mo['sets'][sn][mid].items() if k!='tracks'}}
    if sn and mid in mo['sets'].get(sn,{}): m['tracks'].update(mo['sets'][sn][mid].get('tracks',{}))
    json.dump(m,open('tmp_m.json','w')); subprocess.run(['python3','rr.py','tmp_m.json',l,'tmp.png',*ts],check=True)
    rows.append(Image.open("tmp.png").copy())
W,H=rows[0].size; c=Image.new('RGBA',(W,H*len(rows)))
for i,r in enumerate(rows): c.paste(r,(0,i*H))
c.save(out); print(c.size)
