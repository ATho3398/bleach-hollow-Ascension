#!/usr/bin/env python3
"""사용자 도트를 잘라 쓴 몸의 전용 동작 만들기 — 역관절 기본(몸 dg, 동작 11개, GDD 115-A 70·71)·덩치(몸 hb, 공격·걷기, 115-A 72).
(옛 이름 dg_motions.py — 덩치를 같이 다루며 이름 바꿈)
사용자 2026-11-09 "역관절 일단 2배 키우고, 필살기 저런거 말고 그냥 입 벌리는거로 해. 나루토에 미수옥 쏠 때 입 벌리는거마냥" → 2배(도트 배율 cut.scale)·아래턱(jaw)·특수1 입 벌리기 (115-A 71).
사용자 2026-11-09 원문: "지금 역관절 기본이 너무 움직임이 이상해. 내가 준 이미지 토대로 다시 자르고 움직임 싹 다시 만들어도 되니까,
캐릭터에 잘 어울리게 다시 만들어. 대기, 홈 대기, 걷기, 공격1,2 특수,1, 맞음, 해방, 박치기, 빈사, 쓰러짐만 구현하면 돼."
SPEC(아래) = 동작마다 키 시각과 뼈 각도(쉬는 자세 = 도트 그대로 기준, + = 시계 방향). 몸 높이(root y)는 키마다 발(쓰러짐은 몸 전체)의
가장 낮은 칸이 바닥 줄(y 80)에 닿게 계산해서 넣는다(걷기는 40ms 마다). 결과 = 작업본 motions.json 의 sets.digitigrade (통째로 바꿈).
편집기에서 고친 값이 있으면 이 스크립트를 다시 돌릴 때 덮이니 주의.
결과 = 몸의 묶음(bodyMotions: dg → digitigrade, hb → brute)을 통째로 바꿈.
사용: python3 scripts/rig/tools/creature_motions.py [dg|hb]  (없으면 둘 다)
"""
import json, math, sys
import numpy as np
from PIL import Image
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from paths import DRAFT_DIR  # noqa: E402
from body_sync import write_motions  # noqa: E402
R = DRAFT_DIR + '/'
rig = json.load(open(R + 'humanoid.json'))
GROUND = 80
BONES = ['root', 'torso', 'head', 'jaw', 'arm_L', 'forearm_L', 'arm_R', 'forearm_R', 'leg_L', 'shin_L', 'foot_L', 'leg_R', 'shin_R', 'foot_R']
B, PTS, SC = {}, {}, 1


def setup(body):
    """몸 하나의 관절 자리·부위 칸·도트 배율을 읽어 둔다"""
    global B, PTS, SC
    bj = rig['bodyJoints'][body]
    B = {b['id']: dict(b, pivot=bj['pivots'].get(b['id'], b['pivot']), restRot=b.get('restRot', 0) + (bj.get('rot') or {}).get(b['id'], 0)) for b in rig['bones']}
    PTS = {}
    for slot, p in rig['bodies'][body].items():
        a = np.array(Image.open(R + 'humanoid/' + p['art'] + '.png'))[..., 3] > 0
        ys, xs = np.nonzero(a)
        PTS[slot] = np.stack([xs + p['at'][0] + .5, ys + p['at'][1] + 1.0], 1)  # 칸 아래 가운데
    SC = ((rig.get('cuts') or {}).get(body) or {}).get('scale', 1)


def mul(a, n): return [a[0]*n[0]+a[2]*n[1], a[1]*n[0]+a[3]*n[1], a[0]*n[2]+a[2]*n[3], a[1]*n[2]+a[3]*n[3], a[0]*n[4]+a[2]*n[5]+a[4], a[1]*n[4]+a[3]*n[5]+a[5]]
def ease(u): return u*u*(3-2*u)
def samp(keys, t):
    if t <= keys[0][0]: return list(keys[0][1:])
    for a, b in zip(keys, keys[1:]):
        if t <= b[0]:
            u = ease((t-a[0])/max(1, b[0]-a[0])); return [a[i]+(b[i]-a[i])*u for i in (1, 2, 3)]
    return list(keys[-1][1:])
def mats(tracks, t):
    M = {}
    def get(i):
        if i in M: return M[i]
        b = B[i]; rot, x, y = samp(tracks[i], t) if i in tracks else (0, 0, 0)
        r = math.radians(rot + b['restRot']); c, s = math.cos(r), math.sin(r); px, py = b['pivot']
        m = [c, s, -s, c, px-c*px+s*py+x, py-s*px-c*py+y]
        w = mul(get(b['parent']), m) if b['parent'] else m; M[i] = w; return w
    for i in BONES: get(i)
    return M
def lowest(tracks, t, slots):
    M = mats(tracks, t); out = -1e9
    for s in slots:
        m = M[s]; P = PTS[s]
        out = max(out, float((m[1]*P[:, 0] + m[3]*P[:, 1] + m[5]).max()))
    return out
FEET = ['foot_L', 'foot_R']
def build(spec):
    """spec: times, duration, loop, hit?, hold?, bones {뼈: [각도…]}, rootX?, rootRot?, ground 'feet'|'all', sample? → 동작 dict"""
    T = spec['times']; n = len(T)
    tr = {}
    for b in BONES[1:]:
        v = spec['bones'].get(b, [0]*n); assert len(v) == n, (b, len(v), n)
        tr[b] = [[t, a, 0, 0] for t, a in zip(T, v)]
    rx = [v * SC for v in spec.get('rootX', [0]*n)]  # 도트 배율(115-A 71) — 몸 옮기기 칸 수도 같이
    rr = spec.get('rootRot', [0]*n); rr = spec.get('rootRot', [0]*n)
    tr['root'] = [[t, a, x, 0] for t, a, x in zip(T, rr, rx)]
    slots = list(PTS) if spec.get('ground') == 'all' else FEET
    ts = list(range(0, spec['duration']+1, spec['sample'])) if spec.get('sample') else T
    if spec['sample'] if spec.get('sample') else False:
        base = tr['root']; tr['root'] = [[t, *samp(base, t)[:2], 0] for t in ts]
    keys = []
    for k in tr['root']:
        t = k[0]; k[3] = 0
        tmp = dict(tr); tmp['root'] = [[t, k[1], k[2], 0]]
        keys.append([t, round(k[1], 2), round(k[2], 2), round(GROUND - lowest(tmp, t, slots), 2)])
    tr['root'] = keys
    m = {'duration': spec['duration'], 'loop': spec.get('loop', False)}
    for k in ('hit', 'hold'):
        if k in spec: m[k] = spec[k]
    # 사람형 동작의 칼 관련 설정은 이 몸에 없음 — 비워 둠
    m.update({'flip': [], 'hide': [], 'front': spec.get('front', []), 'fx': []})
    m['tracks'] = {b: [[k[0], round(k[1], 2), k[2], k[3]] for k in v] for b, v in tr.items()}
    # 이 몸에 그림이 없는 뼈(뒷머리·망토·칼·칼집)는 사람형 동작 키가 길이 밖으로 남지 않게 멈춤으로 덮음
    for b in rig['bones']:
        m['tracks'].setdefault(b['id'], [[0, 0, 0, 0]])
    return m


# 역관절 기본 동작 11개 (각도 = 쉬는 자세(사용자 도트) 기준, + = 시계 방향: 몸통+ 뒤로 젖힘, 머리+ 얼굴 위로, 팔·다리+ 앞으로)
SPEC = {}
SPEC['idle'] = dict(times=[0, 500, 900, 1300, 1800], duration=1800, loop=True, bones={
    'torso': [0, 2, 3, 1, 0], 'head': [0, -3, -2, 2, 0],
    'arm_R': [0, 3, 4, 2, 0], 'forearm_R': [0, -5, -7, -3, 0],
    'arm_L': [0, -3, -4, -1, 0], 'forearm_L': [0, 6, 8, 3, 0],
    'leg_R': [0, 3, 4, 2, 0], 'shin_R': [0, -5, -7, -3, 0], 'foot_R': [0, 2, 3, 1, 0],
    'leg_L': [0, 2, 3, 1, 0], 'shin_L': [0, -3, -4, -2, 0], 'foot_L': [0, 1, 1, 1, 0]})
SPEC['homeIdle'] = dict(times=[0, 600, 1200, 1800, 2400], duration=2400, loop=True, bones={
    'torso': [0, -5, -7, -5, 0], 'head': [0, 10, -4, 8, 0],
    'arm_R': [0, -6, -9, -6, 0], 'forearm_R': [0, 8, 12, 8, 0],
    'arm_L': [0, 8, 12, 6, 0], 'forearm_L': [0, -10, -14, -8, 0],
    'leg_R': [0, 6, 9, 6, 0], 'shin_R': [0, -10, -15, -10, 0], 'foot_R': [0, 4, 6, 4, 0],
    'leg_L': [0, 4, 6, 4, 0], 'shin_L': [0, -6, -9, -6, 0], 'foot_L': [0, 2, 3, 2, 0]})
# 걷기: 앞다리(R) 0~360 디딤(허벅지 뒤로) · 360~720 들어 앞으로, 뒷다리(L) 반대. 발은 디딜 때 바닥과 나란히
SPEC['move'] = dict(times=[0, 180, 360, 540, 720], duration=720, loop=True, sample=40, bones={
    'torso': [0, -3, 0, -3, 0], 'head': [0, 3, 0, 3, 0],
    'arm_R': [-10, 0, 10, 0, -10], 'forearm_R': [5, 0, -6, 0, 5],
    'arm_L': [8, 0, -8, 0, 8], 'forearm_L': [-6, 0, 8, 0, -6],
    'leg_R': [8, 0, -12, 14, 8], 'shin_R': [0, 0, 0, -14, 0], 'foot_R': [-8, 0, 12, 18, -8],
    'leg_L': [-12, 4, 8, 0, -12], 'shin_L': [0, -18, 0, 0, 0], 'foot_L': [12, 22, -8, 0, 12]})
SPEC['attack'] = dict(times=[0, 160, 260, 380, 560], duration=560, hit=260, rootX=[0, 1, -4, -3, 0], bones={
    'torso': [0, 8, -12, -8, 0], 'head': [0, -4, 14, 10, 0], 'jaw': [0, -6, -18, -12, 0],
    'arm_R': [0, 150, 40, 30, 0], 'forearm_R': [0, -30, 20, 12, 0],
    'arm_L': [0, 10, -15, -10, 0], 'forearm_L': [0, -5, 10, 5, 0],
    'leg_R': [0, 6, 14, 10, 0], 'shin_R': [0, -10, -6, -4, 0], 'foot_R': [0, 4, -8, -6, 0],
    'leg_L': [0, 4, -10, -6, 0], 'shin_L': [0, -6, 6, 4, 0], 'foot_L': [0, 2, 4, 2, 0]})
# 공격2: 긴 뒤팔을 뒤위로 젖혔다가 아래로 크게 휩쓸어 해골 아래 앞을 할큄(이 동작에서만 뒤팔을 앞에 그림)
SPEC['attack2'] = dict(times=[0, 200, 320, 440, 640], duration=640, hit=320, rootX=[0, 2, -3, -2, 0], front=['arm_L', 'forearm_L'], bones={
    'torso': [0, 10, -12, -9, 0], 'head': [0, -4, 10, 7, 0],
    'arm_L': [0, -76, 88, 76, 0], 'forearm_L': [0, 20, -25, -18, 0],
    'arm_R': [0, 15, -20, -10, 0], 'forearm_R': [0, 10, -10, -5, 0],
    'leg_R': [0, -6, 12, 8, 0], 'shin_R': [0, 8, -12, -8, 0], 'foot_R': [0, -2, 6, 4, 0],
    'leg_L': [0, -4, -8, -6, 0], 'shin_L': [0, 4, 6, 4, 0], 'foot_L': [0, 0, 2, 1, 0]})
# 특수1 (사용자 2026-11-09 "필살기 저런거 말고 그냥 입 벌리는거로 해. 나루토에 미수옥 쏠 때 입 벌리는거마냥"): 발톱을 바닥에 박고 버티며
# 아래턱을 크게 벌려 모으고(떨림) 쏘는 순간 머리가 들리며 몸이 살짝 밀림, 입 벌린 채 잠깐 뒤 다뭄 (쏘는 덩어리는 게임 연출)
SPEC['skill'] = dict(times=[0, 250, 450, 550, 650, 750, 1000, 1250], duration=1250, hit=750, rootX=[0, 0, 0, 0, 0, 2, 1, 0], bones={
    'torso': [0, -6, -4, -5, -4, 6, 4, 0], 'head': [0, -2, 6, 5, 6, 10, 8, 0], 'jaw': [0, -15, -38, -35, -38, -40, -30, 0],
    'arm_R': [0, -10, -14, -13, -14, -6, -6, 0], 'forearm_R': [0, 6, 8, 7, 8, 3, 3, 0],
    'arm_L': [0, 25, 30, 29, 30, 15, 15, 0], 'forearm_L': [0, -10, -12, -11, -12, -6, -6, 0],
    'leg_R': [0, 6, 8, 8, 8, 4, 5, 0], 'shin_R': [0, -10, -12, -12, -12, -6, -8, 0], 'foot_R': [0, 4, 4, 4, 4, 2, 3, 0],
    'leg_L': [0, 4, 6, 6, 6, 2, 3, 0], 'shin_L': [0, -6, -8, -8, -8, -3, -4, 0], 'foot_L': [0, 2, 2, 2, 2, 1, 1, 0]})
SPEC['hit'] = dict(times=[0, 80, 200, 360], duration=360, rootX=[0, 4, 2, 0], bones={
    'torso': [0, 16, 6, 0], 'head': [0, 18, 4, 0], 'jaw': [0, -14, -4, 0],
    'arm_R': [0, -25, -6, 0], 'forearm_R': [0, -20, -4, 0],
    'arm_L': [0, -15, -4, 0], 'forearm_L': [0, 15, 4, 0],
    'leg_R': [0, -6, -2, 0], 'shin_R': [0, 6, 2, 0], 'foot_R': [0, 0, 0, 0],
    'leg_L': [0, -4, -1, 0], 'shin_L': [0, 3, 1, 0], 'foot_L': [0, 0, 0, 0]})
# 해방: 웅크려 몸을 말았다가(떨림) 일어서며 두 팔을 활짝 벌리고 머리를 젖혀 포효
SPEC['release1'] = dict(times=[0, 400, 600, 750, 900, 1200, 1700], duration=1700, hit=900, bones={
    'torso': [0, -18, -20, -19, 16, 14, 0], 'head': [0, -14, -17, -15, 26, 24, 0], 'jaw': [0, 0, 0, 0, -38, -34, 0],
    'arm_R': [0, 30, 33, 31, 75, 72, 0], 'forearm_R': [0, 30, 33, 31, -30, -28, 0],
    'arm_L': [0, 30, 35, 32, -80, -76, 0], 'forearm_L': [0, -20, -23, -21, -10, -8, 0],
    'leg_R': [0, 10, 11, 10, -6, -5, 0], 'shin_R': [0, -16, -18, -16, 8, 7, 0], 'foot_R': [0, 6, 7, 6, -2, -2, 0],
    'leg_L': [0, 6, 7, 6, -4, -3, 0], 'shin_L': [0, -10, -11, -10, 4, 3, 0], 'foot_L': [0, 4, 4, 4, 0, 0, 0]})
SPEC['headbutt'] = dict(times=[0, 180, 300, 420, 600], duration=600, hit=300, rootX=[0, 3, -5, -4, 0], bones={
    'torso': [0, 14, -18, -13, 0], 'head': [0, 12, -12, -8, 0],
    'arm_R': [0, -20, 20, 12, 0], 'forearm_R': [0, -10, 10, 6, 0],
    'arm_L': [0, -20, 10, 6, 0], 'forearm_L': [0, 10, -5, -3, 0],
    'leg_R': [0, -4, 14, 10, 0], 'shin_R': [0, 6, -8, -6, 0], 'foot_R': [0, 0, -4, -3, 0],
    'leg_L': [0, -2, -12, -8, 0], 'shin_L': [0, 3, 8, 6, 0], 'foot_L': [0, 0, 2, 1, 0]})
# 빈사: 몸을 앞으로 푹 숙이고 머리를 떨군 채 긴 팔을 바닥에 늘어뜨림, 거친 숨
SPEC['dying'] = dict(times=[0, 700, 1200, 1900, 2400], duration=2400, loop=True, bones={
    'torso': [-20, -15, -16, -21, -20], 'head': [-18, -12, -14, -19, -18], 'jaw': [-10, -14, -13, -9, -10],
    'arm_R': [20, 16, 17, 21, 20], 'forearm_R': [10, 8, 9, 11, 10],
    'arm_L': [30, 26, 27, 31, 30], 'forearm_L': [-10, -8, -9, -11, -10],
    'leg_R': [12, 11, 11, 12, 12], 'shin_R': [-20, -18, -18, -20, -20], 'foot_R': [8, 7, 7, 8, 8],
    'leg_L': [10, 9, 9, 10, 10], 'shin_L': [-14, -12, -12, -14, -14], 'foot_L': [4, 3, 3, 4, 4]})
# 쓰러짐: 무릎이 꺾여 다리가 몸 아래로 접히며 몸통이 앞으로 엎어져 머리를 바닥에 떨굼 (끝 자세 유지)
SPEC['down'] = dict(times=[0, 200, 500, 700, 900], duration=900, hold=True, ground='all', bones={
    'torso': [0, -10, -35, -60, -55], 'head': [0, -6, 5, 22, 18], 'jaw': [0, -6, -14, -12, -10],
    'arm_R': [0, 20, 40, 66, 60], 'forearm_R': [0, 10, 20, 12, 10],
    'arm_L': [0, 10, 40, 95, 90], 'forearm_L': [0, -10, -15, -10, -10],
    'leg_R': [0, 12, 25, 32, 30], 'shin_R': [0, -22, -45, -58, -55], 'foot_R': [0, 10, 20, 26, 25],
    'leg_L': [0, 20, 45, 58, 55], 'shin_L': [0, -30, -70, -90, -86], 'foot_L': [0, 12, 25, 32, 30]})


# 덩치(몸 hb, 사용자 도트 2026-11-09) — 공격·걷기만 (사용자 "얘로 한번 공격, 이동만 구현해볼래?"). 발톱 손이 바닥 가까이 닿는 고릴라형
SPEC_HB = {}
# 대기: 사람형 기본 대기가 이 몸에선 부위가 크게 틀어져, 숨쉬기만(공격·걷기 확인용 — 사용자가 따로 정할 때까지)
SPEC_HB['idle'] = dict(times=[0, 800, 1600], duration=1600, loop=True, bones={
    'torso': [0, 2, 0], 'head': [0, -2, 0], 'arm_R': [0, 2, 0], 'forearm_R': [0, -2, 0], 'arm_L': [0, -2, 0], 'forearm_L': [0, 2, 0],
    'leg_R': [0, 2, 0], 'shin_R': [0, -3, 0], 'foot_R': [0, 1, 0], 'leg_L': [0, 1, 0], 'shin_L': [0, -2, 0], 'foot_L': [0, 1, 0]})
# 걷기: 너클 보행 — 대각선 짝(앞팔 + 뒷다리, 뒤팔 + 앞다리)이 같이 앞으로. 앞다리(R) 0~400 디딤 · 400~800 들어 앞으로, 뒷다리(L) 반대.
# 다리가 짧고 굵어 크게 돌리면 부위가 겹쳐 보여 작게, 몸을 좌우로 흔들어 무게감
SPEC_HB['move'] = dict(times=[0, 200, 400, 600, 800], duration=800, loop=True, sample=40, bones={
    'torso': [0, -4, 0, -4, 0], 'head': [0, 2, 0, 2, 0],
    'arm_R': [-7, 0, 7, 0, -7], 'forearm_R': [4, -6, -4, 0, 4],
    'arm_L': [7, 0, -7, 0, 7], 'forearm_L': [-4, 0, 4, -6, -4],
    'leg_R': [6, -1, -8, 2, 6], 'shin_R': [0, 0, 0, -14, 0], 'foot_R': [-6, 1, 8, 14, -6],
    'leg_L': [-8, 2, 6, -1, -8], 'shin_L': [0, -14, 0, 0, 0], 'foot_L': [8, 14, -6, 1, 8]})
# 공격: 몸을 뒤로 일으키며 앞팔을 머리 위로 치켜들었다가 앞으로 내리찍음
SPEC_HB['attack'] = dict(times=[0, 200, 320, 450, 650], duration=650, hit=320, rootX=[0, 2, -4, -3, 0], bones={
    'torso': [0, 8, -12, -8, 0], 'head': [0, -2, -4, -3, 0],
    'arm_R': [0, 140, 10, 5, 0], 'forearm_R': [0, -30, 15, 10, 0],
    'arm_L': [0, -20, 20, 12, 0], 'forearm_L': [0, 10, -10, -5, 0],
    'leg_R': [0, -6, 10, 8, 0], 'shin_R': [0, 6, -8, -6, 0], 'foot_R': [0, 0, -2, -2, 0],
    'leg_L': [0, -4, -8, -6, 0], 'shin_L': [0, 4, 6, 4, 0], 'foot_L': [0, 0, 2, 2, 0]})

SPECS = {'dg': SPEC, 'hb': SPEC_HB}
NOTES = {'dg': ('역관절 기본(몸 dg, 사용자 도트 2026-11-08) 전용 동작 (GDD 115-A 70, 사용자 2026-11-09 "지금 역관절 기본이 너무 움직임이 이상해 … 캐릭터에 잘 어울리게 다시 만들어. 대기, 홈 대기, 걷기, 공격1,2 특수,1, 맞음, 해방, 박치기, 빈사, 쓰러짐만"): '
                '모든 뼈를 이 묶음에서 정함(사람형 기본 동작을 덮음). 각도 = 쉬는 자세(도트 그대로) 기준. 몸 높이(root y)는 발(쓰러짐은 몸 전체)이 바닥 줄에 닿게 계산'),
         'hb': ('덩치(몸 hb, 사용자 도트 2026-11-09) 전용 동작 — 공격·걷기(+ 숨쉬기만 하는 대기) (GDD 115-A 72, 사용자 "얘 추가하고, 얘로 한번 공격, 이동만 구현해볼래?"). '
                '모든 뼈를 이 묶음에서 정함. 각도 = 쉬는 자세(도트 그대로) 기준. 몸 높이(root y)는 발이 바닥 줄에 닿게 계산. 그 밖 동작은 사람형 기본 그대로')}


def main(bodies):
    P = R + 'motions.json'
    mo = json.load(open(P, encoding='utf-8'))
    for body in bodies:
        setup(body)
        out = {'note': NOTES[body]}
        for mid, s in SPECS[body].items():
            out[mid] = build(s)
        mo['sets'][rig['bodyMotions'][body]] = out
        print(body, '→', rig['bodyMotions'][body], list(out)[1:])
    write_motions(mo)


if __name__ == "__main__":
    main(sys.argv[1:] or list(SPECS))
