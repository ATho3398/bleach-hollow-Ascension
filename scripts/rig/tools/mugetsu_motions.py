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
               {'upper': [-13, -16, -13], 'head': [-9, -12, -9], 'arm_sword': [-8, -6, -8], 'forearm_sword': [-6, -4, -6],
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

    def leg(name, ph0):
        H, K, A = piv['thigh_' + name], piv['shin_' + name], piv['foot_' + name]
        l1, l2 = math.dist(H, K), math.dist(K, A)
        r1, r2 = math.atan2(K[1] - H[1], K[0] - H[0]), math.atan2(A[1] - K[1], A[0] - K[0])

        def solve(t):
            ph = (t / D + ph0) % 1
            if ph < 0.5:  # 디딤: 앞(왼쪽, −x) → 뒤, 땅에 붙어 같은 빠르기로
                u = ph / 0.5
                fx, fy = mid - STRIDE + 2 * STRIDE * u, 0.0
                pitch = -9 * max(0, 1 - u / 0.2) ** 2 + 13 * max(0, (u - 0.72) / 0.28) ** 2
            else:         # 뗌: 뒤 → 앞(처음·끝은 느리게), 가운데서 가장 높이
                u = (ph - 0.5) / 0.5
                e = (1 - math.cos(math.pi * u)) / 2
                fx, fy = mid + STRIDE - 2 * STRIDE * e, -LIFT * math.sin(math.pi * u)
                pitch = 13 * (1 - e) - 9 * e + 5 * math.sin(math.pi * u)
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
            return w1, w2 - w1, -w2 + pitch
        fns['thigh_' + name] = (lambda t: solve(t)[0], zero, zero)
        fns['shin_' + name] = (lambda t: solve(t)[1], zero, zero)
        fns['foot_' + name] = (lambda t: solve(t)[2], zero, zero)
    leg('f', 0.0)
    leg('b', 0.5)
    sw = lambda amp, off=0.0: (lambda t: amp * math.cos(2 * math.pi * (t / D + off)))  # noqa: E731
    two = lambda base, amp: (lambda t: base + amp * math.cos(4 * math.pi * t / D))  # noqa: E731
    add = lambda f, g: (lambda t: f(t) + g(t))  # noqa: E731
    # 몸: 앞으로 숙이고 걸음마다 살짝 끄덕, 어깨는 다리와 반대로 틀림. 팔은 다리와 엇갈려 흔들고 아래팔·칼이 늦게 따라옴(LATE)
    for bone, f in (('upper', add(two(-4, 0.8), sw(1.2, 0.5))), ('lower', sw(1.0)), ('head', add(two(2.5, -0.6), sw(-0.8, 0.5))),
                    ('arm_sword', sw(5, 0.0)), ('forearm_sword', sw(3, 0.0)), ('sword', sw(2, 0.0)), ('arm_back', sw(10, 0.5)), ('forearm_back', sw(6, 0.5))):
        fns[bone] = (f, zero, zero)
    LATE.pop('shin_f', None); LATE.pop('shin_b', None)  # 다리는 계산한 그대로(늦추면 발이 땅에서 뜬다)
    tr = dense(D, fns, True)
    LATE.update({'shin_f': 20, 'shin_b': 20})
    return {'duration': D, 'loop': True, 'tracks': tr}


def main():
    SPEC['move'] = walk()
    cur = json.load(open(OUT, encoding='utf-8'))
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
