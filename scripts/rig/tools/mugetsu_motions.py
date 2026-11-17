#!/usr/bin/env python3
"""이치고(무월) 동작 만들기 (GDD 115-A 133, 사용자 2026-11-14 "무월은 관절 다 나눠줬는데 모션 만들 수 있잖아. 모션 구현해 무월").
동작 8: 대기·이동·무기 공격 1(내려베기)·무기 공격 2(올려베기)·특수 1(높이 들어 크게 내려벰)·맞음·빈사·쓰러짐.
키 = [t, 각도(+ = 시계), x, y]. 왼쪽을 보므로 팔·다리(관절 아래로 늘어진 부위)는 + 가 앞(왼쪽)으로, 몸·머리(관절 위)는 − 가 앞으로 숙임.
뒷머리 가닥·뒷머리 베이스·왼 아래팔은 엔진 따라가기(rig.sway)라 키 없음. 대기는 원래 것 그대로.
편집기에서 동작을 고정하면 그 뒤로는 mugetsu-motions.json 이 기준(다시 돌리면 덮임).
사용: python3 scripts/rig/tools/mugetsu_motions.py → docs/design/rig-draft/mugetsu-motions.json
"""
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from paths import DRAFT_DIR  # noqa: E402

OUT = os.path.join(DRAFT_DIR, 'mugetsu-motions.json')


STEP = 16  # 촘촘한 키 간격(ms)
# 뒤따라 움직이는 뼈(같은 곡선을 조금 늦게) — 팔 → 아래팔 → 칼, 몸 → 머리 순으로 힘이 전해지는 느낌
LATE = {'forearm_sword': 25, 'sword': 50, 'forearm_back': 30, 'head': 30, 'shin_f': 20, 'shin_b': 20}


def curve(ts, vs, loop, dur):
    """조절 키를 지나는 부드러운 곡선(꺾이는 곳·머무는 곳에서는 기울기 0 — 넘치지 않음). t → 값 함수"""
    n = len(ts)
    sl = []
    for i in range(n):
        if loop:
            i0, i1 = (i - 1) % (n - 1), (i + 1) % (n - 1) if i < n - 1 else 1
            if i == 0:
                d0, h0 = vs[0] - vs[n - 2], dur - ts[n - 2]
                d1, h1 = vs[1] - vs[0], ts[1] - ts[0]
            elif i == n - 1:
                d0, h0 = vs[n - 1] - vs[n - 2], ts[n - 1] - ts[n - 2]
                d1, h1 = vs[1] - vs[0], ts[1] - ts[0]
            else:
                d0, h0, d1, h1 = vs[i] - vs[i - 1], ts[i] - ts[i - 1], vs[i + 1] - vs[i], ts[i + 1] - ts[i]
        elif i in (0, n - 1):
            sl.append(0.0)
            continue
        else:
            d0, h0, d1, h1 = vs[i] - vs[i - 1], ts[i] - ts[i - 1], vs[i + 1] - vs[i], ts[i + 1] - ts[i]
        sl.append(0.0 if d0 * d1 <= 0 else (d0 + d1) / (h0 + h1))

    def f(t):
        t = min(max(t, ts[0]), ts[-1])
        for i in range(1, n):
            if t <= ts[i]:
                h = ts[i] - ts[i - 1]
                u = (t - ts[i - 1]) / h
                return ((2 * u ** 3 - 3 * u ** 2 + 1) * vs[i - 1] + (u ** 3 - 2 * u ** 2 + u) * h * sl[i - 1]
                        + (-2 * u ** 3 + 3 * u ** 2) * vs[i] + (u ** 3 - u ** 2) * h * sl[i])
        return vs[-1]
    return f


def dense(duration, fns, loop):
    """뼈마다 (각, x, y) 함수 → 16ms 마다 키. 엔진은 키 사이를 '느리게 출발·느리게 도착'으로 이어 키마다 멈칫하므로(사용자 2026-11-15 "모션이 너무 끊긴다 … 막 튄다"),
    키를 화면 한 장보다 촘촘히 깔아 멈칫이 안 보이게 한다."""
    n = max(2, round(duration / STEP))
    ts = [round(duration * i / n) for i in range(n + 1)]
    tr = {}
    for b, (fr, fx, fy) in fns.items():
        late = LATE.get(b, 0)
        g = (lambda f: (lambda t: f((t - late) % duration if loop else t - late))) if late else (lambda f: f)
        keys = [[t, round(g(fr)(t), 1), round(g(fx)(t), 2), round(g(fy)(t), 2)] for t in ts]
        if loop:
            keys[-1][1:] = keys[0][1:]
        tr[b] = keys
    return tr


def m(duration, times, root, bones, loop=False, hit=None, hold=False):
    zero = lambda t: 0.0  # noqa: E731
    fns = {'root': tuple(curve(times, [r[k] for r in root], loop, duration) for k in range(3))}
    for b, v in bones.items():
        assert len(v) == len(times), (b, len(v), len(times))
        fns[b] = (curve(times, v, loop, duration), zero, zero)
    out = {'duration': duration, 'loop': loop}
    if hit is not None:
        out['hit'] = hit
    if hold:
        out['hold'] = True
    out['tracks'] = dense(duration, fns, loop)
    return out


Z = (0, 0, 0)
SPEC = {
    # 무기 공격 1 — 내려베기: 칼을 머리 위로 들었다가 앞으로 내려벰
    'attack': m(600, [0, 180, 300, 420, 600], [Z, (0, 2, 0), (0, -5, 1), (0, -4, 1), Z],
                {'upper': [0, 5, -9, -7, 0], 'head': [0, -3, 4, 3, 0],
                 'arm_sword': [0, 135, 48, 42, 0], 'forearm_sword': [0, 30, 8, 6, 0], 'sword': [0, 28, -8, -6, 0],
                 'arm_back': [0, -14, 12, 10, 0], 'thigh_f': [0, -4, 10, 8, 0], 'thigh_b': [0, 4, -8, -6, 0]}, hit=300),
    # 무기 공격 2 — 올려베기: 칼을 뒤로 뺐다가 아래에서 앞 위로 쓸어 올림
    'attack2': m(550, [0, 160, 280, 400, 550], [Z, (0, 3, 1), (0, -5, -1), (0, -4, -1), Z],
                 {'upper': [0, 6, -6, -5, 0], 'head': [0, 3, -3, -2, 0],
                  'arm_sword': [0, -38, 92, 100, 0], 'forearm_sword': [0, -18, 26, 30, 0], 'sword': [0, -12, 30, 34, 0],
                  'arm_back': [0, 10, -16, -14, 0], 'thigh_f': [0, -6, 10, 8, 0], 'thigh_b': [0, 6, -6, -5, 0]}, hit=280),
    # 특수 1: 천천히 칼을 높이 들고(몸이 살짝 뜸) 잠깐 멈췄다가 크게 내려벰
    'skill': m(1400, [0, 450, 700, 800, 1050, 1400], [Z, (0, 1, -2), (0, 2, -3), (0, -8, 2), (0, -7, 2), Z],
               {'upper': [0, 6, 8, -14, -12, 0], 'head': [0, -6, -8, 8, 6, 0],
                'arm_sword': [0, 150, 165, 30, 26, 0], 'forearm_sword': [0, 24, 30, 4, 2, 0], 'sword': [0, 20, 26, -14, -12, 0],
                'arm_back': [0, -18, -22, 18, 16, 0], 'thigh_f': [0, -4, -6, 14, 12, 0], 'shin_f': [0, 0, 0, -8, -6, 0],
                'thigh_b': [0, 3, 4, -10, -8, 0]}, hit=800),
    # 맞음: 뒤로 젖혀졌다가 돌아옴
    'hit': m(320, [0, 90, 200, 320], [Z, (0, 4, 0), (0, 2, 0), Z],
             {'upper': [0, 9, 4, 0], 'head': [0, 8, 3, 0], 'arm_sword': [0, -12, -5, 0], 'arm_back': [0, -10, -4, 0]}),
    # 빈사: 몸을 숙이고 칼을 늘어뜨린 채 가쁘게 숨쉼
    'dying': m(2400, [0, 1200, 2400], [(0, 0, 2), (0, 0, 3), (0, 0, 2)],
               {'upper': [-13, -16, -13], 'head': [-9, -12, -9], 'arm_sword': [-8, -6, -8], 'forearm_sword': [-6, -4, -6], 'sword': [36, 36, 36],  # 칼 36° = 편집기 고정 2026-11-16 01:48('이 동작에만')
                'arm_back': [10, 13, 10], 'thigh_f': [6, 7, 6], 'thigh_b': [-5, -6, -5]}, loop=True),
    # 쓰러짐: 무릎이 꺾이며 뒤로 넘어가 눕는다(발 관절로 돌리므로 몸이 칸 가운데·땅 위에 오게 x·y 를 같이 옮김)
    'down': m(900, [0, 250, 550, 720, 900], [Z, (8, 0, 1), (55, -34, -20), (88, -64, -40), (86, -64, -39)],
              {'upper': [0, -8, 4, 2, 0], 'head': [0, -6, 8, 4, 2], 'arm_sword': [0, 10, -25, -40, -38], 'sword': [0, 0, -10, -20, -18],
               'arm_back': [0, 8, -20, -30, -28], 'thigh_f': [0, 10, 6, 0, 0], 'shin_f': [0, -14, -8, 0, 0]}, hold=True),
}


def walk():
    """이동 (사용자 2026-11-15 "특히 걷기는 다리가 교차하게 해. 막 튄다 지금"):
    - 두 발이 같은 가운데 선을 중심으로 앞뒤로 오가 **서로 엇갈려 지나간다**(전에는 쉬는 자세의 벌어진 자리에서 각자 흔들려 안 엇갈렸음).
    - 발목이 갈 자리를 먼저 정하고(디딘 발은 땅에 붙어 뒤로, 뗀 발은 들려 앞으로) 허벅지·정강이 각도를 거꾸로 풀어 맞춘다. 발은 굴림(뒤꿈치 → 발끝).
    - 16ms 마다 키(dense) — 키마다 멈칫하던 것 없앰."""
    import math
    rig = json.load(open(os.path.join(DRAFT_DIR, 'mugetsu.json'), encoding='utf-8'))
    piv = {b['id']: b['pivot'] for b in rig['bones']}
    piv.update((rig.get('bodyJoints') or {}).get('parts', {}).get('pivots', {}))
    D, STRIDE, LIFT = 880, 8.0, 3.5
    mid = (piv['foot_f'][0] + piv['foot_b'][0]) / 2  # 두 발이 오가는 가운데 선
    bob = lambda t: 1.2 * math.cos(4 * math.pi * t / D)  # noqa: E731 — 두 발이 벌어졌을 때 낮고, 엇갈릴 때 높음
    zero = lambda t: 0.0  # noqa: E731
    fns = {'root': (zero, zero, bob)}

    # 발 굴림(사용자 2026-11-16 02:0x "발을 뒤로 할 땐, 발 각도를 뒤쪽으로 살짝 틀어야하고, 다시 앞으로 가져올 땐 발 앞을 살짝 들어야 걷는 느낌"):
    # + = 발끝이 들림, − = 뒤꿈치가 들림(발끝은 땅). 디딤(0~0.5): 딛는 순간 발끝 살짝 들림(+4) → 평평 → 뒤로 밀려 갈수록 뒤꿈치가 들려 뒤쪽으로 틀어짐(−12)
    # 뗌(0.5~1): 뒤에서 떼어 앞으로 가져오며 발끝이 들림(+10) → 딛기 직전 +4
    roll = curve([0, 0.075, 0.275, 0.5, 0.675, 0.825, 1.0], [4, 0, 0, -12, 3, 10, 4], True, 1.0)

    def leg(name, ph0):
        H, K, A = piv['thigh_' + name], piv['shin_' + name], piv['foot_' + name]
        l1, l2 = math.dist(H, K), math.dist(K, A)
        r1, r2 = math.atan2(K[1] - H[1], K[0] - H[0]), math.atan2(A[1] - K[1], A[0] - K[0])

        def solve(t):
            ph = (t / D + ph0) % 1
            if ph < 0.5:  # 디딤: 앞(왼쪽, −x) → 뒤, 땅에 붙어 같은 빠르기로
                u = ph / 0.5
                fx, fy = mid - STRIDE + 2 * STRIDE * u, 0.0
                pass
            else:         # 뗌: 뒤 → 앞(처음·끝은 느리게), 가운데서 가장 높이
                u = (ph - 0.5) / 0.5
                e = (1 - math.cos(math.pi * u)) / 2
                fx, fy = mid + STRIDE - 2 * STRIDE * e, -LIFT * math.sin(math.pi * u)
                pass
            pitch = roll(ph)
            tx, ty = fx - H[0], A[1] + fy - bob(t) - H[1]
            d0 = math.hypot(tx, ty)
            d = min(d0, l1 + l2 - 0.05)
            base = math.atan2(ty, tx)
            c = max(-1, min(1, (l1 * l1 + d * d - l2 * l2) / (2 * l1 * d)))
            best = None
            for sgn in (1, -1):  # 무릎은 앞(왼쪽)으로 — 걸음답게
                a1 = base + sgn * math.acos(c)
                kx, ky = l1 * math.cos(a1), l1 * math.sin(a1)
                a2 = math.atan2(ty * d / d0 - ky, tx * d / d0 - kx)
                if best is None or kx < best[0]:
                    best = (kx, a1, a2)
            w1 = (math.degrees(best[1] - r1) + 180) % 360 - 180
            w2 = (math.degrees(best[2] - r2) + 180) % 360 - 180
            # 딛고 뒤로 밀릴 때 무릎을 뒤로 5° 더 굽힘(사용자 2026-11-17 04:3x "발 떼는 쪽 다리는 뒤로 조금만 더 굽혀도 될 듯? 한 5도정도만??" →
            # 05:2x "앞다리쪽에만이 아니라 하...어 딛고 뒤로 밀릴때를 말한거야"): 두 다리 모두, 디딤 뒷부분(뒤로 밀려 갈수록)에서 커져 디딤 끝(발 떼는 순간)에 5°,
            # 뗌 앞부분에서 0으로. 정강이를 반시계(−, 발이 뒤로), 발 각도는 그만큼 되돌림(발끝은 그대로 뒤쪽으로 틀어짐)
            k = (ph - 0.2) / 0.3 if 0.2 <= ph < 0.5 else (1 - (ph - 0.5) / 0.2 if 0.5 <= ph < 0.7 else 0.0)
            fold = -5.0 * (0.5 - 0.5 * math.cos(math.pi * max(0.0, min(1.0, k))))
            return w1, w2 - w1 + fold, -w2 + pitch - fold
        # 편집기 고정('이 동작에만', 걷기 동안 계속 같은 옮김): 01:27 왼 하카마 아래 → 오른쪽 3칸 / 19:36 오른 하카마 위 → 오른쪽 3·위 5칸, 오른 하카마 아래 → 아래 6칸 / 21:06 오른발 → 왼쪽 4칸
        shift = {'thigh_f': (3.0, -5.0), 'shin_f': (0.0, 6.0), 'shin_b': (3.0, 0.0), 'foot_f': (-4.0, 0.0)}  # 21:06 오른발 → 왼쪽 4칸
        sx, sy = shift.get('thigh_' + name, (0.0, 0.0))
        fns['thigh_' + name] = (lambda t: solve(t)[0], lambda t: sx, lambda t: sy)
        sx2, sy2 = shift.get('shin_' + name, (0.0, 0.0))
        fns['shin_' + name] = (lambda t: solve(t)[1], lambda t: sx2, lambda t: sy2)
        fx3, fy3 = shift.get('foot_' + name, (0.0, 0.0))
        fns['foot_' + name] = (lambda t: solve(t)[2], lambda t: fx3, lambda t: fy3)
    leg('f', 0.0)
    leg('b', 0.5)
    sw = lambda amp, off=0.0: (lambda t: amp * math.cos(2 * math.pi * (t / D + off)))  # noqa: E731
    two = lambda base, amp: (lambda t: base + amp * math.cos(4 * math.pi * t / D))  # noqa: E731
    add = lambda f, g: (lambda t: f(t) + g(t))  # noqa: E731
    # 몸: 앞으로 숙이고 걸음마다 살짝 끄덕, 어깨는 다리와 반대로 틀림. 팔은 다리와 엇갈려 흔들고 아래팔·칼이 늦게 따라옴(LATE)
    # 팔은 반대쪽 다리와 같이 나간다(사용자 2026-11-16 "지금 왼손, 왼발 같이 나가거든?? 왼손-오른발로 나가게수정해"): 오른발(f, 위상 0)이 앞일 때 왼팔(arm_back)이 앞, 왼발이 앞일 때 오른팔(arm_sword)이 앞
    for bone, f in (('upper', add(two(-4, 0.8), sw(1.2, 0.5))), ('lower', sw(1.0)), ('head', add(two(2.5, -0.6), sw(-0.8, 0.5))),
                    ('arm_sword', sw(5, 0.5)), ('forearm_sword', sw(3, 0.5)), ('sword', sw(2, 0.5)), ('arm_back', sw(10, 0.0)), ('forearm_back', sw(6, 0.0))):
        fns[bone] = (f, zero, zero)
    LATE.pop('shin_f', None); LATE.pop('shin_b', None)  # 다리는 계산한 그대로(늦추면 발이 땅에서 뜬다)
    tr = dense(D, fns, True)
    LATE.update({'shin_f': 20, 'shin_b': 20})
    return {'duration': D, 'loop': True, 'tracks': tr}


def kneel():
    """쓰러짐 = 한쪽 무릎 꿇기 (사용자 2026-11-16 21:0x "쓰러짐이 존나 빈티나거든?? 무릎 한쪽만 굽히고 꿇어앉은 자세로 하자. 뒤로 넘어가는건 좀 그래"):
    몸이 내려앉으며 뒷다리(왼, thigh_b) 무릎이 땅에 닿고 정강이는 뒤로 눕고 발끝으로 땅을 짚음, 앞다리(오른, thigh_f)는 발을 그 자리에 둔 채 무릎을 세움.
    윗몸은 앞으로 숙이고 고개를 떨굼, 칼 든 팔은 늘어뜨리고 뒷손은 앞 무릎 위에. 무릎이 닿을 때 살짝 튕긴 뒤 끝 자세로 멈춤(hold).
    다리 각도는 걷기와 같은 방식(발목 자리 → 허벅지·정강이 각도를 거꾸로 풂)."""
    import math
    rig = json.load(open(os.path.join(DRAFT_DIR, 'mugetsu.json'), encoding='utf-8'))
    piv = {b['id']: b['pivot'] for b in rig['bones']}
    piv.update((rig.get('bodyJoints') or {}).get('parts', {}).get('pivots', {}))
    # 사용자가 쓰러짐을 맞춘(2026-11-17 01:1x '고정') 때의 다리 각도는 뒷무릎 관절이 (69, 78)일 때 푼 값 — 같은 고정에서 관절을 (67, 72)로 옮겼어도 각도는 그대로 둔다
    piv['shin_b'] = [69, 78]
    ground = max(piv['foot_f'][1], piv['foot_b'][1]) + 4

    def ik(name, ax, ay, drop):
        H, K, A = piv['thigh_' + name], piv['shin_' + name], piv['foot_' + name]
        l1, l2 = math.dist(H, K), math.dist(K, A)
        r1, r2 = math.atan2(K[1] - H[1], K[0] - H[0]), math.atan2(A[1] - K[1], A[0] - K[0])
        tx, ty = ax - H[0], ay - drop - H[1]
        d0 = math.hypot(tx, ty)
        d = min(d0, l1 + l2 - 0.05)
        base = math.atan2(ty, tx)
        c = max(-1, min(1, (l1 * l1 + d * d - l2 * l2) / (2 * l1 * d)))
        best = None
        for sgn in (1, -1):  # 무릎은 앞(왼쪽)으로
            a1 = base + sgn * math.acos(c)
            kx, ky = l1 * math.cos(a1), l1 * math.sin(a1)
            a2 = math.atan2(ty * d / d0 - ky, tx * d / d0 - kx)
            if best is None or kx < best[0]:
                best = (kx, a1, a2)
        w1 = (math.degrees(best[1] - r1) + 180) % 360 - 180
        w2 = (math.degrees(best[2] - r2) + 180) % 360 - 180
        return w1, w2 - w1, -w2

    # 끝 자세: 뒷무릎이 땅(ground − 1)에 닿을 만큼 몸을 내림. 뒷정강이는 뒤(오른쪽)로 눕고 살짝 들림
    Hb, Kb, Ab = piv['thigh_b'], piv['shin_b'], piv['foot_b']
    l1b, l2b = math.dist(Hb, Kb), math.dist(Kb, Ab)
    knee = (Hb[0] - 3, ground - 2)
    drop = (knee[1] - Hb[1]) - math.sqrt(max(1.0, l1b * l1b - 9))
    back_ankle = (knee[0] + l2b * math.cos(math.radians(-12)), knee[1] + l2b * math.sin(math.radians(-12)))
    times = [0, 220, 420, 520, 640, 900]
    frac = [0, 0.4, 0.92, 1.04, 0.98, 1.0]   # 내려앉는 정도(1 = 무릎이 땅) — 520 에 살짝 튕김
    reach = [0, 0.25, 0.85, 1.0, 1.0, 1.0]   # 뒷발이 끝 자리로 간 정도
    legs = {k: [] for k in ('thigh_f', 'shin_f', 'foot_f', 'thigh_b', 'shin_b', 'foot_b')}
    for fr_, rc in zip(frac, reach):
        dr = drop * fr_
        a, b, c = ik('f', piv['foot_f'][0], piv['foot_f'][1], dr)   # 앞발은 제자리, 발바닥 평평
        legs['thigh_f'].append(round(a, 1)); legs['shin_f'].append(round(b, 1)); legs['foot_f'].append(round(c, 1))
        bx = Ab[0] + (back_ankle[0] - Ab[0]) * rc
        by = Ab[1] + (back_ankle[1] - Ab[1]) * rc - 3 * math.sin(math.pi * rc)  # 들려서 뒤로 감
        a, b, c = ik('b', bx, by + dr, dr)
        legs['thigh_b'].append(round(a, 1)); legs['shin_b'].append(round(b, 1)); legs['foot_b'].append(round(c - 55 * rc, 1))  # 발끝으로 땅을 짚음
    root = [(0, 0, round(drop * f_, 2)) for f_ in frac]
    bones = {**legs,
             'upper': [0, -4, -14, -18, -15, -16], 'lower': [0, -2, -6, -7, -6, -6], 'head': [0, 2, 10, 14, 12, 13],
             'arm_sword': [0, -6, -14, -10, -12, -12], 'forearm_sword': [0, -4, -10, -6, -8, -8], 'sword': [0, -4, -14, -12, -12, -12],
             'arm_back': [0, 10, 28, 34, 30, 32], 'forearm_back': [0, 6, 20, 26, 22, 24]}
    # 편집기 '고정'(사용자 2026-11-17 01:1x, 쓰러짐 '이 동작에만'): 뒷정강이 −43°·(−7, +7), 칼 든 팔 +93°·(+6, −10), 칼 든 아래팔 +10° — 끝 자세 값, 내려앉는 만큼 들어간다
    prog = [0, 0.4, 0.9, 1.0, 1.0, 1.0]
    # 두 번째 고정(2026-11-17 03:5x): 칼 든 팔 +17°, 칼 든 아래팔 +3°, 칼 −115° 더
    # 세 번째 고정(2026-11-17 17:2x): 뒷허벅지 +39°·(0, +6), 뒷정강이 −46°·(+6, +5) 더, 앞정강이 (+5, +10)
    fix = {'shin_b': (-43 - 46, -7 + 6, 7 + 5), 'thigh_b': (39, 0, 6), 'shin_f': (0, 5, 10),
           'arm_sword': (93 + 17, 6, -10), 'forearm_sword': (10 + 3, 0, 0), 'sword': (-115, 0, 0)}
    for b, (dr, _, _) in fix.items():
        bones[b] = [round(v + dr * p_, 1) for v, p_ in zip(bones[b], prog)]
    out = m(900, times, root, bones, hold=True)
    pc = curve(times, prog, False, 900)
    for b, (_, dx, dy) in fix.items():
        if dx or dy:
            for k in out['tracks'][b]:
                k[2] = round(k[2] + dx * pc(k[0]), 2); k[3] = round(k[3] + dy * pc(k[0]), 2)
    return out


def kneel_breath(down):
    """쓰러진 채 숨 헐떡이기(사용자 2026-11-17 17:2x "쓰러짐을 행하는 모션이랑, 이미 쓰러져서 무릎앉아 있는 상태에서 숨만 헐떡거려 위아래로 호흡하는 모션도 필요해"):
    쓰러짐(down) 끝 자세 그대로 멈춘 채, 빠른 숨(한 번 = 640ms)에 맞춰 윗몸이 위아래로 오르내리고(들숨에 어깨가 올라감) 고개·팔이 살짝 따라간다. 다리·칼은 그대로(땅에 붙음). 반복(loop)."""
    import math
    D = 1280  # 숨 두 번
    end = {b: ks[-1] for b, ks in down['tracks'].items()}
    breath = lambda t: 0.5 - 0.5 * math.cos(4 * math.pi * t / D)  # noqa: E731 — 0 = 내쉼, 1 = 들숨 끝
    osc = {  # 뼈: (각도, x, y) × 들숨 정도
        'upper': (-2.0, 0.0, -1.2), 'lower': (-0.6, 0.0, -0.4), 'head': (1.6, 0.0, 0.0),
        'arm_sword': (1.0, 0.0, 0.0), 'arm_back': (-2.0, 0.0, 0.0), 'forearm_back': (-1.5, 0.0, 0.0),
    }
    fns = {}
    for b, k in end.items():
        a, x, y = osc.get(b, (0.0, 0.0, 0.0))
        fns[b] = ((lambda k, a: lambda t: k[1] + a * breath(t))(k, a), (lambda k, x: lambda t: k[2] + x * breath(t))(k, x), (lambda k, y: lambda t: k[3] + y * breath(t))(k, y))
    return {'duration': D, 'loop': True, 'tracks': dense(D, fns, True)}


def main():
    SPEC['move'] = walk()
    SPEC['down'] = kneel()
    SPEC['downIdle'] = kneel_breath(SPEC['down'])
    cur = json.load(open(OUT, encoding='utf-8'))
    # 걷기용 왼발(사용자 2026-11-16 "이거 발 하나 추가한거는, 걸을 때 왼발로 넣어"): 왼발 뼈에 그림 두 장(foot_b = 서 있을 때, foot_b_walk = 걸을 때)을 달고
    # 동작마다 하나를 숨긴다 — 걷기는 foot_b 를, 나머지 동작은 foot_b_walk 를. (동작 없이 멈춘 화면·편집기 기본 자세에서는 둘 다 보인다 — 자리 잡기용)
    # 칼은 그림 없이 불 덩어리가 칼(사용자 2026-11-16 "도트로 찍은칼은 없애고 … 불만 남기는게 더 이쁜거같음" · "무월 칼은 없애라했는데") — 칼 뼈만 남아 불꽃이 따라간다.
    # (같은 날 앞서 넣은 날 위 칼 sword_up 은 칼 그림이 없어져 뺐다)
    cur['idle']['hide'] = ['foot_b_walk']
    cur['idle'].pop('front', None)
    for k, v in SPEC.items():
        v['hide'] = ['foot_b' if k in ('move', 'down', 'downIdle') else 'foot_b_walk']  # 쓰러짐도 걷기용 왼발(사용자 2026-11-17 "쓰러짐때는, 왼발을 걷기용으로 바꿔야지")
    mo = {'note': '이치고(무월) 동작(GDD 115-A 129·133). 키 = [t, 각도(+=시계), x, y]. 뒷머리·왼 아래팔은 따라가기(sway). 대기 말고는 scripts/rig/tools/mugetsu_motions.py 로 만듦.',
          'idle': cur['idle'], 'move': SPEC['move'], **{k: v for k, v in SPEC.items() if k != 'move'}}
    # 키가 많아(16ms 마다) 뼈 하나의 키를 한 줄에 쓴다
    js = lambda v: json.dumps(v, ensure_ascii=False, separators=(',', ':'))  # noqa: E731
    lines = ['{', ' "note": ' + js(mo['note']) + ',']
    ids = [k for k in mo if k != 'note']
    for i, k in enumerate(ids):
        v = mo[k]
        head = ', '.join(f'{js(a)}: {js(b)}' for a, b in v.items() if a != 'tracks')
        lines.append(f' {js(k)}: {{{head}, "tracks": {{')
        tk = list(v['tracks'])
        lines += [f'  {js(b)}: {js(v["tracks"][b])}' + (',' if j < len(tk) - 1 else '') for j, b in enumerate(tk)]
        lines.append(' }}' + (',' if i < len(ids) - 1 else ''))
    lines.append('}')
    open(OUT, 'w', encoding='utf-8').write('\n'.join(lines) + '\n')
    json.load(open(OUT, encoding='utf-8'))
    print('mugetsu 동작', [k for k in mo if k != 'note'])


if __name__ == '__main__':
    main()
