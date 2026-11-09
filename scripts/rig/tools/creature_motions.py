#!/usr/bin/env python3
"""사용자 도트를 잘라 쓴 몸의 전용 동작 만들기 — 역관절 기본(몸 dg, 동작 11개, GDD 115-A 70·71)·덩치(몸 hb = 사용자 부위 시트 조립, 대기·걷기·공격·해방, 115-A 73·75).
(옛 이름 dg_motions.py — 덩치를 같이 다루며 이름 바꿈)
사용자 2026-11-09 "역관절 일단 2배 키우고, 필살기 저런거 말고 그냥 입 벌리는거로 해. 나루토에 미수옥 쏠 때 입 벌리는거마냥" → 2배(도트 배율 cut.scale)·아래턱(jaw)·특수1 입 벌리기 (115-A 71).
사용자 2026-11-09 원문: "지금 역관절 기본이 너무 움직임이 이상해. 내가 준 이미지 토대로 다시 자르고 움직임 싹 다시 만들어도 되니까,
캐릭터에 잘 어울리게 다시 만들어. 대기, 홈 대기, 걷기, 공격1,2 특수,1, 맞음, 해방, 박치기, 빈사, 쓰러짐만 구현하면 돼."
SPEC(아래) = 동작마다 키 시각과 뼈 각도(쉬는 자세 = 도트 그대로 기준, + = 시계 방향). 몸 높이(root y)는 키마다 발(쓰러짐은 몸 전체)의
가장 낮은 칸이 바닥 줄(y 80)에 닿게 계산해서 넣는다(걷기는 40ms 마다). 결과 = 작업본 motions.json 의 sets.digitigrade (통째로 바꿈).
편집기에서 고친 값이 있으면 이 스크립트를 다시 돌릴 때 덮이니 주의.
결과 = 몸의 묶음(bodyMotions: dg → digitigrade, hb → brute)에서 SPEC 에 있는 동작을 바꿈(그 밖 동작 — 편집기에서 고정한 것 등 — 은 그대로).
사용: python3 scripts/rig/tools/creature_motions.py [dg|hb]  (없으면 둘 다)
"""
import json, math, sys
import numpy as np
from PIL import Image
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from paths import DRAFT_DIR, ROOT  # noqa: E402
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
    asm = (rig.get('assembled') or {}).get(body)  # 부위 시트 조립 몸(덩치) — 조립 파일의 배율
    if isinstance(asm, str) and os.path.exists(os.path.join(ROOT, asm)):
        SC = json.load(open(os.path.join(ROOT, asm), encoding='utf-8')).get('scale', SC)


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
def ground_dy(motion, t):
    """t 순간 가장 낮은 발(없으면 종아리)이 바닥 줄에 닿게 몸을 내릴 칸 수"""
    feet = [s for s in FEET if s in PTS] or [s for s in ('shin_L', 'shin_R') if s in PTS]
    tr = dict(motion['tracks'])
    r = tr.get('root') or [[0, 0, 0, 0]]
    tr['root'] = [[t, *samp(r, t)[:2], 0]]
    return round(GROUND - lowest(tr, t, feet), 2)


def build(spec):
    """spec: times, duration, loop, hit?, hold?, bones {뼈: [각도…]}, rootX?, rootRot?, ground 'feet'|'all', sample? → 동작 dict"""
    T = spec['times']; n = len(T)
    tr = {}
    for b in BONES[1:]:
        v = spec['bones'].get(b, [0]*n); assert len(v) == n, (b, len(v), n)
        tr[b] = [[t, a, 0, 0] for t, a in zip(T, v)]
    for b, ys in (spec.get('shiftY') or {}).items():  # 뼈 위아래 옮김(칸, 걷기의 든 다리 — 115-A 89)
        tr[b] = [[k[0], k[1], k[2], y] for k, y in zip(tr[b], ys)]
    rx = [v * SC for v in spec.get('rootX', [0]*n)]  # 도트 배율(115-A 71) — 몸 옮기기 칸 수도 같이
    rr = spec.get('rootRot', [0]*n); rr = spec.get('rootRot', [0]*n)
    tr['root'] = [[t, a, x, 0] for t, a, x in zip(T, rr, rx)]
    # 바닥에 닿는 부위: 발(없으면 종아리 — 짐승은 종아리에 발이 붙어 있음)
    feet = [s for s in FEET if s in PTS] or [s for s in ('shin_L', 'shin_R') if s in PTS]
    slots = list(PTS) if spec.get('ground') == 'all' else feet
    ts = list(range(0, spec['duration']+1, spec['sample'])) if spec.get('sample') else T
    if spec['sample'] if spec.get('sample') else False:
        base = tr['root']; tr['root'] = [[t, *samp(base, t)[:2], 0] for t in ts]
    keys = []
    for k in tr['root']:
        t = k[0]; k[3] = 0
        tmp = dict(tr); tmp['root'] = [[t, k[1], k[2], 0]]
        keys.append([t, round(k[1], 2), round(k[2], 2), round(GROUND - lowest(tmp, t, slots), 2)])
    # 숨쉬기 등으로 몸을 내리는 칸 수(dip, 키마다) — 제자리 동작은 정강이 고정·허벅지 풀이로 이만큼 허벅지가 굽혀짐 (115-A 78)
    for k, d in zip(keys, spec.get('dip', [0] * len(keys))):
        k[3] = round(k[3] + d * SC / 2, 2)
    tr['root'] = keys
    if spec.get('torsoY'):
        # 몸통(머리·팔이 딸림)만 더 내림(칸, 도트 배율 반영) — 회전 없이 위아래(115-A 82)
        tr['torso'] = [[k[0], k[1], k[2], round(k[3] + v * SC / 2, 2)] for k, v in zip(tr['torso'], spec['torsoY'])]
    if spec.get('bob'):
        # 몸 전체만 위아래(관절 회전 없음, 115-A 81): 정강이(종아리)를 몸이 내려간 만큼 거꾸로 옮겨 정강이·발은 제자리
        for b in ('shin_L', 'shin_R'):
            tr[b] = [[t, 0, 0, -round(d * SC / 2, 2) or 0] for t, d in zip(T, spec['dip'])]
    m = {'duration': spec['duration'], 'loop': spec.get('loop', False)}
    for k in ('hit', 'hold'):
        if k in spec: m[k] = spec[k]
    # 사람형 동작의 칼 관련 설정은 이 몸에 없음 — 비워 둠
    m.update({'flip': [], 'hide': [], 'front': spec.get('front', []), 'fx': []})
    m['tracks'] = {b: [[k[0], round(k[1], 2), k[2], k[3]] for k in v] for b, v in tr.items()}
    # 이 몸에 그림이 없는 뼈(뒷머리·망토·칼·칼집)는 사람형 동작 키가 길이 밖으로 남지 않게 멈춤으로 덮음
    for b in rig['bones']:
        m['tracks'].setdefault(b['id'], [[0, 0, 0, 0]])
    # 제자리 동작은 두 발바닥 고정(GDD 115-A 77·78): 몸 높이는 설계대로(가장 낮은 발 기준), 정강이(종아리)는 고정하고 허벅지 각을 풀어 두 발을 바닥 줄에
    if spec.get('planted', not spec.get('sample') and spec.get('ground') != 'all' and not spec.get('bob')):
        import plant as pl
        pl.cm = sys.modules[__name__]
        mode = 'sole' if 'foot_L' in PTS else 'calf'
        m['tracks'].update(pl.plant(m, mode, target=GROUND, flat_foot=(mode == 'sole'), step=50, fix_shin=True))
    return m


# 역관절 기본 동작 11개 (각도 = 쉬는 자세(사용자 도트) 기준, + = 시계 방향: 몸통+ 뒤로 젖힘, 머리+ 얼굴 위로, 팔·다리+ 앞으로)
SPEC = {}
# 대기 = 몸 전체만 위아래로(사용자 2026-11-09 02:1x "관절을 기준으로 회전을 하지 말고, 그냥 몸 전체가 위아래로 들렸나 내려갔다만") — 관절 회전 없음,
# 허벅지 1칸·몸통(머리·팔 포함) 2칸(= 2배 도트 한 칸) 내려갔다 올라옴, 정강이·발은 그 자리(bob, 115-A 81·82 — 사용자 "대기할 때 몸이랑 팔도 같이 움직여야지")
SPEC['idle'] = dict(times=[0, 900, 1800], duration=1800, loop=True, dip=[0, 1, 0], torsoY=[0, 1, 0], bob=True, bones={})
# 홈 대기 = 대기 (hollow() 에서 — 사용자 "홈대기=대기")
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
SPEC['dying'] = dict(times=[0, 700, 1200, 1900, 2400], duration=2400, loop=True, dip=[1, 0.2, 0.4, 1.2, 1], bones={
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


# 덩치(몸 hb) = 사용자 부위 시트 조립(2026-11-09 — 처음 짐승 bst 로 넣었다가 사용자 "짐승이 아니라 덩치고" 로 옮김): 대기·걷기·공격·해방(포효), 특수2·필살기 없음
# 해골 머리·긴 발톱 팔(앞팔은 바닥을 짚음)·짧은 다리의 고릴라형. 다리는 종아리에 발이 붙어 있음(발 뼈 없음)
SPEC_HB = {}
# 덩치 대기 (115-A 87, 사용자 2026-11-09 02:5x "덩치 팔도 약간 앞뒤로 살짝 움직여야지;; 허벅지만 위아래로 움직이고, 몸이랑 고개, 팔은 각도 맞춰서 살짝씩"):
# 허벅지 = 회전 없이 1칸 위아래(정강이·발 제자리), 몸통(머리·팔 포함) 2칸 + 숨 들이쉴 때 몸통이 앞으로 1.5° 숙고 고개는 반대로 1.5°(시선 그대로),
# 팔은 뒤 −1.5° ↔ 앞 +2° 로 살짝 흔들림(아래팔이 조금 더 따라감, 먼 팔이 조금 더)
SPEC_HB['idle'] = dict(times=[0, 800, 1600], duration=1600, loop=True, dip=[0, 1, 0], torsoY=[0, 1, 0], bob=True, bones={
    'torso': [0, -1.5, 0], 'head': [0, 1.5, 0],
    'arm_R': [-1.5, 2, -1.5], 'forearm_R': [-1, 1.5, -1],
    'arm_L': [-1, 2.5, -1], 'forearm_L': [-1, 2, -1]})
# 걷기: 너클 보행 — 앞팔과 뒷다리, 뒤팔과 앞다리가 짝. 몸을 낮게 흔들며 머리는 앞을 봄
# 걷기 (115-A 89, 사용자 2026-11-09 11:2x "덩치 걷기 좀만 더 자연스럽게"): 0.1초 키 9개.
# 다리 = 디딤(앞 +14°) → 무게 받기(무릎 굽힘, 몸 가장 낮음) → 지나감(곧게, 가장 높음) → 밀기 → 뗌(무릎 접어 발 들기) → 앞으로 뻗기, 먼 다리는 반 박자 뒤.
# 몸 높이는 디딘 발 기준(sample)이라 걸음마다 내려앉았다 올라옴. 몸통은 디딜 때 앞으로 쏠리고 고개는 반대로(시선 그대로).
# 팔 = 같은 쪽 다리 반대로 흔들고 아래팔은 한 박자 늦게 따라옴. 먼 아래팔 +18° = 사용자 고정(02:05)을 바탕으로
SPEC_HB['move'] = dict(times=[0, 100, 200, 300, 400, 500, 600, 700, 800], duration=800, loop=True, sample=40, bones={
    'torso': [-5, -7, -4, -3, -5, -7, -4, -3, -5], 'head': [3, 4, 2, 1, 3, 4, 2, 1, 3],
    'arm_R': [-12, -10, -3, 5, 11, 9, 1, -9, -12], 'forearm_R': [2, -2, -6, -6, -5, 2, 6, 8, 2],
    'arm_L': [11, 9, 1, -9, -12, -10, -3, 5, 11], 'forearm_L': [13, 20, 24, 26, 20, 16, 12, 12, 13],
    'leg_R': [12, 8, 2, -5, -10, -4, 5, 12, 12], 'shin_R': [-8, -8, -2, 3, 5, -12, -16, -10, -8],
    'leg_L': [-10, -4, 5, 12, 12, 8, 2, -5, -10], 'shin_L': [5, -12, -16, -10, -8, -8, -2, 3, 5]},
    # 뒤로 민 다리는 종아리를 거의 세운 채 떼고(발끝이 바닥 밑으로 안 내려가게), 뗀 뒤에 무릎을 접으며 엉덩이째 1~3칸 들어 올림 — 몸 높이는 디딘 발이 정함
    shiftY={'leg_R': [0, 0, 0, 0, -2, -3, -3, -1, 0], 'leg_L': [-2, -3, -3, -1, 0, 0, 0, 0, -2]})
# 공격: 몸을 뒤로 젖히며 앞팔을 머리 위로 치켜들었다가 앞으로 내리찍음(발톱이 바닥을 긁음)
SPEC_HB['attack'] = dict(times=[0, 200, 320, 450, 650], duration=650, hit=320, rootX=[0, 2, -4, -3, 0], bones={
    'torso': [0, 10, -12, -8, 0], 'head': [0, 2, -6, -4, 0],
    'arm_R': [0, 140, 10, 5, 0], 'forearm_R': [0, -30, 15, 10, 0],
    'arm_L': [0, -20, 20, 12, 0], 'forearm_L': [0, 10, -10, -5, 0],
    'leg_R': [0, -6, 10, 8, 0], 'shin_R': [0, 6, -8, -6, 0],
    'leg_L': [0, -4, -8, -6, 0], 'shin_L': [0, 4, 6, 4, 0]})

# 해방 (사용자 "해방에 포효하는거 추가해"): 몸을 웅크려 모았다가(떨림) 확 일어서며 머리를 젖히고 두 팔을 활짝 벌려 포효, 잠깐 버틴 뒤 제자리
SPEC_HB['release1'] = dict(times=[0, 350, 500, 650, 800, 950, 1100, 1600], duration=1600, hit=800, bones={
    'torso': [0, -14, -16, -15, 18, 20, 16, 0], 'head': [0, -10, -12, -11, 26, 30, 24, 0],
    'arm_R': [0, -15, -17, -16, 100, 104, 96, 0], 'forearm_R': [0, 12, 14, 13, -30, -34, -28, 0],
    'arm_L': [0, 15, 17, 16, -100, -104, -96, 0], 'forearm_L': [0, -12, -14, -13, 30, 34, 28, 0],
    'leg_R': [0, 8, 9, 8, -4, -4, -3, 0], 'shin_R': [0, -12, -13, -12, 5, 5, 4, 0],
    'leg_L': [0, 6, 7, 6, -3, -3, -2, 0], 'shin_L': [0, -8, -9, -8, 3, 3, 2, 0]})
# 공격2: 뒤팔(몸 앞에 그려지는 팔)을 뒤위로 젖혔다가 앞으로 크게 휘둘러 후려침
SPEC_HB['attack2'] = dict(times=[0, 200, 320, 450, 650], duration=650, hit=320, rootX=[0, 2, -4, -3, 0], bones={
    'torso': [0, 8, -12, -8, 0], 'head': [0, 2, -4, -3, 0],
    'arm_L': [0, -60, 70, 55, 0], 'forearm_L': [0, 20, -15, -10, 0],
    'arm_R': [0, 15, -10, -6, 0], 'forearm_R': [0, -8, 6, 4, 0],
    'leg_R': [0, -6, 10, 8, 0], 'shin_R': [0, 6, -8, -6, 0],
    'leg_L': [0, -4, -8, -6, 0], 'shin_L': [0, 4, 6, 4, 0]})
SPEC_HB['hit'] = dict(times=[0, 80, 200, 360], duration=360, rootX=[0, 4, 2, 0], bones={
    'torso': [0, 14, 5, 0], 'head': [0, 16, 4, 0],
    'arm_R': [0, -18, -5, 0], 'forearm_R': [0, -12, -3, 0], 'arm_L': [0, -14, -4, 0], 'forearm_L': [0, 12, 3, 0],
    'leg_R': [0, -5, -2, 0], 'shin_R': [0, 5, 2, 0], 'leg_L': [0, -4, -1, 0], 'shin_L': [0, 3, 1, 0]})
SPEC_HB['headbutt'] = dict(times=[0, 180, 300, 420, 600], duration=600, hit=300, rootX=[0, 3, -5, -4, 0], bones={
    'torso': [0, 12, -16, -12, 0], 'head': [0, 10, -14, -9, 0],
    'arm_R': [0, -15, 15, 10, 0], 'forearm_R': [0, -8, 8, 5, 0], 'arm_L': [0, -15, 12, 8, 0], 'forearm_L': [0, 8, -6, -4, 0],
    'leg_R': [0, -4, 10, 8, 0], 'shin_R': [0, 5, -7, -5, 0], 'leg_L': [0, -2, -8, -6, 0], 'shin_L': [0, 3, 6, 4, 0]})
# 빈사: 앞으로 푹 숙여 머리를 떨구고 팔을 늘어뜨린 채 거친 숨
SPEC_HB['dying'] = dict(times=[0, 700, 1200, 1900, 2400], duration=2400, loop=True, dip=[1, 0.2, 0.4, 1.2, 1], bones={
    'torso': [-16, -12, -13, -17, -16], 'head': [-14, -9, -10, -15, -14],
    'arm_R': [14, 11, 12, 15, 14], 'forearm_R': [6, 4, 5, 7, 6], 'arm_L': [16, 13, 14, 17, 16], 'forearm_L': [-6, -4, -5, -7, -6],
    'leg_R': [10, 9, 9, 10, 10], 'shin_R': [-14, -12, -12, -14, -14], 'leg_L': [8, 7, 7, 8, 8], 'shin_L': [-10, -9, -9, -10, -10]})
# 쓰러짐: 무릎이 꺾이며 앞으로 엎어져 머리를 바닥에 (끝 자세 유지)
SPEC_HB['down'] = dict(times=[0, 200, 500, 700, 900], duration=900, hold=True, ground='all', bones={
    'torso': [0, -10, -35, -60, -55], 'head': [0, -6, 5, 20, 16],
    'arm_R': [0, 15, 35, 60, 55], 'forearm_R': [0, 8, 15, 10, 8], 'arm_L': [0, 10, 40, 80, 75], 'forearm_L': [0, -8, -12, -8, -8],
    'leg_R': [0, 10, 22, 30, 28], 'shin_R': [0, -18, -40, -55, -52], 'leg_L': [0, 12, 30, 45, 42], 'shin_L': [0, -18, -45, -65, -62]})

# 호로 몸 공통 정리 (사용자 2026-11-09 01:3x "얘네는 홈대기=대기, 해방=필살기 통일시켜. 호로는 어퍼컷, 오른손치기, 스트레이트 필요 없고,
# 홈대기=대기, 걷기, 공격12, 특수1, 맞음, 해방=필살기, 쓰러짐, 빈사, 박치기만 있으면 돼") — GDD 115-A 76
HOLLOW_OFF = ['skill2', 'uppercut', 'rpunch', 'straight', 'bath', 'punch', 'kick']


def hollow(spec):
    spec['homeIdle'] = spec['idle']
    spec['ultimate'] = spec['release1']
    for m in HOLLOW_OFF:
        spec[m] = 'off'
    return spec


hollow(SPEC_HB)

hollow(SPEC)
SPECS = {'dg': SPEC, 'hb': SPEC_HB}
NOTES = {'dg': ('역관절 기본(몸 dg, 사용자 도트 2026-11-08) 전용 동작 (GDD 115-A 70, 사용자 2026-11-09 "지금 역관절 기본이 너무 움직임이 이상해 … 캐릭터에 잘 어울리게 다시 만들어. 대기, 홈 대기, 걷기, 공격1,2 특수,1, 맞음, 해방, 박치기, 빈사, 쓰러짐만"): '
                '모든 뼈를 이 묶음에서 정함(사람형 기본 동작을 덮음). 각도 = 쉬는 자세(도트 그대로) 기준. 몸 높이(root y)는 발(쓰러짐은 몸 전체)이 바닥 줄에 닿게 계산'),
         'hb': ('덩치(몸 hb, 사용자 부위 시트 2026-11-09 조립) 전용 동작 — 대기·걷기·공격·해방(포효), 특수2·필살기 없음(off) (GDD 115-A 73·75, 사용자 "얘로 도트변경하고, 특수2, 필살기 없애고, 해방에 포효하는거 추가해. 짐승이 아니라 덩치고"). '
                '모든 뼈를 이 묶음에서 정함. 각도 = 조립한 쉬는 자세 기준. 몸 높이(root y)는 종아리(발 포함)가 바닥 줄에 닿게 계산. 그 밖 동작은 사람형 기본 그대로')}


def main(bodies):
    P = R + 'motions.json'
    mo = json.load(open(P, encoding='utf-8'))
    for body in bodies:
        setup(body)
        out = {'note': NOTES[body]}
        prev = mo['sets'].get(rig['bodyMotions'][body]) or {}
        for mid, s in SPECS[body].items():
            out[mid] = {'off': True} if s == 'off' else build(s)
            # 편집기에서 고정한 뼈 트랙(apply_editor.py 가 'edited' 로 표시)은 다시 만들어도 그대로(115-A 80)
            ed = (prev.get(mid) or {}).get('edited') or []
            if ed and s != 'off':
                out[mid]['tracks'].update({b: prev[mid]['tracks'][b] for b in ed if b in prev[mid].get('tracks', {})})
                out[mid]['edited'] = list(ed)
        # 이 스크립트가 만들지 않는 동작(편집기에서 고정한 것 등)은 그대로 두되, 제자리 동작이면 두 발바닥만 고정(115-A 77)
        import plant as pl
        pl.cm = sys.modules[__name__]
        for mid, v in (mo['sets'].get(rig['bodyMotions'][body]) or {}).items():
            if mid != 'note' and mid not in out:
                out[mid] = v
                if mid in pl.STANDING and not v.get('off'):
                    # 앞서 이 스크립트가 넣은 발 고정 트랙은 빼고 다시 풂(다시 돌려도 같은 결과)
                    v = json.loads(json.dumps(v))
                    for b in v.pop('planted', []):
                        v.get('tracks', {}).pop(b, None)
                    base = mo.get(mid) or {}
                    full = {**base, **{k: x for k, x in v.items() if k != 'tracks'}, 'tracks': {**base.get('tracks', {}), **v.get('tracks', {})}}
                    sc0 = full['tracks'].get('root') or [[0, 0, 0, 0]]
                    ts = sorted({k[0] for x in full['tracks'].values() for k in x} | {0, full['duration']} | set(range(0, full['duration'], 50)))  # 편집기에서 고친 동작은 키가 띄엄띄엄이라 50ms 마다
                    full['tracks']['root'] = [[tt, *[round(q, 2) for q in samp(sc0, tt)[:2]], ground_dy(full, tt)] for tt in ts]  # 몸 높이 = 가장 낮은 발이 바닥에 닿는 높이(다시 돌려도 겹쳐 더하지 않음)
                    out[mid] = json.loads(json.dumps(v))
                    out[mid]['tracks'] = {**v.get('tracks', {}), 'root': full['tracks']['root']}
                    mode = 'sole' if 'foot_L' in PTS else 'calf'
                    new = pl.plant(full, mode, target=GROUND, flat_foot=(mode == 'sole'), step=50, fix_shin=True)
                    out[mid]['tracks'].update(new)
                    out[mid]['planted'] = sorted({'root', *new})
        mo['sets'][rig['bodyMotions'][body]] = out
        print(body, '→', rig['bodyMotions'][body], list(out)[1:])
    write_motions(mo)


if __name__ == "__main__":
    main(sys.argv[1:] or list(SPECS))
