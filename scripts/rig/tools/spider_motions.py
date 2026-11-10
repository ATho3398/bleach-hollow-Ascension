#!/usr/bin/env python3
"""거미형(뼈대 spider) 동작 만들기 (GDD 115-A 106, 사용자 2026-11-11 "거미처럼 다리 4개가 각자 움직이게").

다리 넷은 각도를 손으로 적지 않고 '발끝 자리'로 설계한다: 동작마다 시각 t 에서 몸(root) 옮김·기울기와 다리마다 발끝이 쉬는 자리에서
얼마나 움직였는지(dx, dy — 왼쪽·위가 음수)를 정하면, 엉덩이(윗마디 관절)에서 발끝까지를 두 마디 풀이로 풀어 윗마디·아랫마디 각을 낸다.
→ 몸이 오르내리거나 덮쳐도 디딘 발끝은 바닥에 그대로 있고, 걷기는 다리마다 박자가 달라 따로 움직인다.
편집기에서 고정한 뼈 트랙(apply_editor.py 가 'edited' 로 표시)은 다시 만들어도 그대로 둔다.
사용: python3 scripts/rig/tools/spider_motions.py   → docs/design/rig-draft/spider-motions.json
"""
import json
import math
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from paths import DRAFT_DIR  # noqa: E402

RIG = json.load(open(os.path.join(DRAFT_DIR, 'spider.json'), encoding='utf-8'))
OUT = os.path.join(DRAFT_DIR, 'spider-motions.json')
B = {b['id']: b for b in RIG['bones']}
TIPS = RIG['tips']['ref']
LEGS = ['leg1', 'leg2', 'leg3', 'leg4']
STEP = 50  # 다리 풀이 키 간격(ms)


def rot(p, c, deg):
    r = math.radians(deg)
    x, y = p[0] - c[0], p[1] - c[1]
    return [c[0] + x * math.cos(r) - y * math.sin(r), c[1] + x * math.sin(r) + y * math.cos(r)]


def ang(a, b):
    return math.degrees(math.atan2(b[1] - a[1], b[0] - a[0]))


def norm(d):
    return (d + 180) % 360 - 180


def solve_leg(leg, root, tip_d):
    """root = (기울기°, x, y), tip_d = 발끝 옮김 → (윗마디 각, 아랫마디 각) — 뼈 자기 각도(부모 기준)"""
    H, K, T = B[leg]['pivot'], B[leg + 'b']['pivot'], TIPS[leg + 'b']
    rr, rx, ry = root
    h = rot(H, B['root']['pivot'], rr)
    h = [h[0] + rx, h[1] + ry]
    t = [T[0] + tip_d[0], T[1] + tip_d[1]]
    l1, l2 = math.dist(H, K), math.dist(K, T)
    d = max(abs(l1 - l2) + 0.01, min(l1 + l2 - 0.01, math.dist(h, t)))
    # 무릎이 꺾이는 쪽은 쉬는 자세와 같게
    side = 1 if (K[0] - H[0]) * (T[1] - H[1]) - (K[1] - H[1]) * (T[0] - H[0]) > 0 else -1
    a = math.degrees(math.acos((l1 * l1 + d * d - l2 * l2) / (2 * l1 * d)))
    base = ang(h, t)
    k_dir = base - side * a
    k = [h[0] + l1 * math.cos(math.radians(k_dir)), h[1] + l1 * math.sin(math.radians(k_dir))]
    # 닿지 않는 거리면 발끝 쪽으로 곧게
    t2 = t if math.dist(h, t) == d else [h[0] + (t[0] - h[0]) * d / math.dist(h, t), h[1] + (t[1] - h[1]) * d / math.dist(h, t)]
    up = norm(k_dir - ang(H, K) - rr)
    lo = norm(ang(k, t2) - ang(K, T) - rr - up)
    return round(up, 2), round(lo, 2)


def lerp_keys(keys, t):
    """[(t, v…)] 를 곧게 이어 t 순간 값"""
    if t <= keys[0][0]:
        return list(keys[0][1:])
    for a, b in zip(keys, keys[1:]):
        if t <= b[0]:
            u = (t - a[0]) / max(1, b[0] - a[0])
            u = u * u * (3 - 2 * u)
            return [x + (y - x) * u for x, y in zip(a[1:], b[1:])]
    return list(keys[-1][1:])


def build(spec):
    """spec: duration, loop, hit?, root(t) → (기울기, x, y), tips {다리: f(t) → (dx, dy)}, bones {뼈: [(t, 각)…]}"""
    dur = spec['duration']
    ts = list(range(0, dur, STEP)) + [dur]
    tr = {'root': [[t, *[round(v, 2) for v in spec['root'](t)]] for t in ts]}
    for leg in LEGS:
        f = spec.get('tips', {}).get(leg, lambda t: (0, 0))
        sol = [solve_leg(leg, spec['root'](t), f(t)) for t in ts]
        tr[leg] = [[t, s[0], 0, 0] for t, s in zip(ts, sol)]
        tr[leg + 'b'] = [[t, s[1], 0, 0] for t, s in zip(ts, sol)]
    for b, keys in spec.get('bones', {}).items():
        tr[b] = [[t, round(a, 2), 0, 0] for t, a in keys]
    m = {'duration': dur, 'loop': spec.get('loop', False)}
    if 'hit' in spec:
        m['hit'] = spec['hit']
    if spec.get('front'):
        m['front'] = spec['front']
    m['tracks'] = tr
    return m


def wave(t, dur, amp, phase=0.0):
    return amp * math.sin(2 * math.pi * (t / dur + phase))


def keyed(keys):
    return lambda t: tuple(lerp_keys(keys, t))


SPEC = {}

# 대기: 몸이 1칸 오르내리고(숨쉬기) 몸통·머리·팔이 살짝 흔들림. 발끝 넷은 제자리
SPEC['idle'] = dict(duration=1800, loop=True,
                    root=lambda t: (0, 0, 0.5 - 0.5 * math.cos(2 * math.pi * t / 1800) * 1 + 0.5 * 0),
                    bones={'torso': [(0, 0), (900, -1.5), (1800, 0)], 'head': [(0, 0), (900, 2), (1800, 0)],
                           'arm_R': [(0, -1.5), (900, 2), (1800, -1.5)], 'hand_R': [(0, -1), (900, 2), (1800, -1)],
                           'arm_L': [(0, -1), (900, 2.5), (1800, -1)]})


def step(phase, stride=4.0, lift=5.0, swing=0.24):
    """걷기 한 다리의 발끝: 딛고 있는 동안 뒤(+x)로 밀리고, 뗀 동안 들어 올려 앞(−x)으로"""
    def f(t, dur=800):
        p = (t / dur + phase) % 1.0
        if p < 1 - swing:  # 디딤
            u = p / (1 - swing)
            return (-stride + 2 * stride * u, 0)
        u = (p - (1 - swing)) / swing
        return (stride - 2 * stride * u, -lift * math.sin(math.pi * u))
    return f


# 이동: 다리 넷이 박자를 달리해 차례로(1 → 3 → 2 → 4) 딛는다. 몸은 걸음마다 살짝 흔들리고 앞으로 조금 숙임
SPEC['move'] = dict(duration=800, loop=True,
                    root=lambda t: (-2 + wave(t, 400, 0.8), wave(t, 800, 0.6), 1 + wave(t, 400, 0.7, 0.25)),
                    tips={'leg1': step(0.0), 'leg3': step(0.25), 'leg2': step(0.5), 'leg4': step(0.75)},
                    bones={'torso': [(0, -3), (200, -4.5), (400, -3), (600, -4.5), (800, -3)], 'head': [(0, 3), (200, 4), (400, 3), (600, 4), (800, 3)],
                           'arm_R': [(0, 6), (400, -6), (800, 6)], 'hand_R': [(0, 4), (400, -4), (800, 4)], 'arm_L': [(0, -6), (400, 6), (800, -6)]})

# 공격1: 가까운 팔 발톱으로 할퀴기 — 몸을 뒤로 뺐다가 앞으로 덮침(발끝은 제자리)
SPEC['attack'] = dict(duration=600, hit=300, front=['arm_L'],
                      root=keyed([(0, 0, 0, 0), (180, 4, 3, -1), (300, -6, -6, 2), (420, -4, -4, 1.5), (600, 0, 0, 0)]),
                      bones={'torso': [(0, 0), (180, 8), (300, -10), (420, -7), (600, 0)], 'head': [(0, 0), (180, -4), (300, 8), (420, 5), (600, 0)],
                             'arm_L': [(0, 0), (180, -55), (300, 50), (420, 38), (600, 0)],
                             'arm_R': [(0, 0), (180, -10), (300, 12), (420, 8), (600, 0)], 'hand_R': [(0, 0), (180, -8), (300, 10), (600, 0)]})

# 공격2: 앞다리 둘(다리 1·2)을 치켜들었다가 앞으로 내리찍기 — 몸은 일으켰다가 숙임, 뒷다리 둘은 디딘 채
SPEC['attack2'] = dict(duration=700, hit=350, front=['leg2', 'leg2b'],
                       root=keyed([(0, 0, 0, 0), (220, 9, 3, -3), (350, -7, -4, 2), (480, -5, -3, 1.5), (700, 0, 0, 0)]),
                       tips={'leg1': keyed([(0, 0, 0), (220, -2, -20), (350, -9, 0), (480, -8, 0), (600, -3, -4), (700, 0, 0)]),
                             'leg2': keyed([(0, 0, 0), (220, -4, -26), (350, -11, 0), (480, -10, 0), (600, -4, -5), (700, 0, 0)])},
                       bones={'torso': [(0, 0), (220, 6), (350, -8), (480, -6), (700, 0)], 'head': [(0, 0), (220, -5), (350, 7), (700, 0)],
                              'arm_L': [(0, 0), (220, -25), (350, 15), (700, 0)], 'arm_R': [(0, 0), (220, -20), (350, 12), (700, 0)],
                              'hand_R': [(0, 0), (220, -10), (350, 8), (700, 0)]})

# 특수1: 몸을 낮췄다가 번쩍 일으켜 두 팔을 벌리고 머리를 내밀어 내뿜기
SPEC['skill'] = dict(duration=1250, hit=750,
                     root=keyed([(0, 0, 0, 0), (250, -3, 0, 3), (550, 6, 2, -4), (750, -4, -2, -2), (1000, -3, -1, -1), (1250, 0, 0, 0)]),
                     bones={'torso': [(0, 0), (250, -6), (550, 10), (750, -8), (1000, -6), (1250, 0)],
                            'head': [(0, 0), (250, 6), (550, -12), (750, 14), (1000, 10), (1250, 0)],
                            'arm_L': [(0, 0), (250, 10), (550, -60), (750, -45), (1000, -30), (1250, 0)],
                            'arm_R': [(0, 0), (250, 10), (550, 45), (750, 55), (1000, 35), (1250, 0)],
                            'hand_R': [(0, 0), (550, 20), (750, 25), (1250, 0)]})

# 맞음: 뒤로 밀리며 몸이 젖혀짐(발끝 제자리)
SPEC['hit'] = dict(duration=360,
                   root=keyed([(0, 0, 0, 0), (80, 6, 4, -1), (200, 3, 2, 0), (360, 0, 0, 0)]),
                   bones={'torso': [(0, 0), (80, 9), (200, 4), (360, 0)], 'head': [(0, 0), (80, -10), (200, -4), (360, 0)],
                          'arm_L': [(0, 0), (80, -18), (360, 0)], 'arm_R': [(0, 0), (80, -14), (360, 0)]})

# 해방1(포효): 웅크렸다가 다리를 벌려 몸을 높이 들고 두 팔을 펼쳐 포효 — 바깥 다리 발끝을 바깥으로 벌림
SPEC['release1'] = dict(duration=1700, hit=900,
                        root=keyed([(0, 0, 0, 0), (400, -2, 0, 4), (650, 2, 0, -5), (900, 5, 1, -7), (1300, 4, 1, -6), (1700, 0, 0, 0)]),
                        tips={'leg1': keyed([(0, 0, 0), (400, 0, 0), (520, -2, -5), (650, -4, 0), (1300, -4, 0), (1500, -2, -4), (1700, 0, 0)]),
                              'leg4': keyed([(0, 0, 0), (400, 0, 0), (520, 2, -5), (650, 4, 0), (1300, 4, 0), (1500, 2, -4), (1700, 0, 0)])},
                        bones={'torso': [(0, 0), (400, -8), (650, 4), (900, 9), (1300, 8), (1700, 0)],
                               'head': [(0, 0), (400, 8), (650, -8), (900, -16), (1000, -13), (1100, -16), (1300, -14), (1700, 0)],
                               'arm_L': [(0, 0), (400, 14), (650, -40), (900, -70), (1300, -65), (1700, 0)],
                               'arm_R': [(0, 0), (400, 10), (650, 35), (900, 60), (1300, 55), (1700, 0)],
                               'hand_R': [(0, 0), (650, 15), (900, 30), (1300, 28), (1700, 0)]})

NOTE = ('거미형(다리 넷) 동작 (GDD 115-A 106). 키 = [t, 각도(+=시계), x, y]. 앞 = 왼쪽. 다리(legN·legNb) 트랙은 scripts/rig/tools/spider_motions.py 가 '
        '발끝 자리에서 거꾸로 풀어 50ms 마다 낸 값 — 디딘 발끝은 몸이 움직여도 제자리, 걷기는 다리마다 박자가 다르다(1 → 3 → 2 → 4). '
        '다리 각을 손으로 고치면(편집기 고정) 그 트랙은 edited 로 남아 다시 만들어도 유지')


def main():
    prev = json.load(open(OUT, encoding='utf-8')) if os.path.exists(OUT) else {}
    out = {'note': NOTE}
    for mid, spec in SPEC.items():
        m = build(spec)
        ed = (prev.get(mid) or {}).get('edited') or []
        if ed:
            m['tracks'].update({b: prev[mid]['tracks'][b] for b in ed if b in prev[mid].get('tracks', {})})
            m['edited'] = list(ed)
        out[mid] = m
    for k, v in prev.items():  # 이 도구가 만들지 않는 동작·묶음은 그대로
        out.setdefault(k, v)
    s = json.dumps(out, ensure_ascii=False, indent=1)
    s = re.sub(r'\[\s+(-?[\d.]+),\s+(-?[\d.]+),\s+(-?[\d.]+),\s+(-?[\d.]+)\s+\]', r'[\1, \2, \3, \4]', s)
    open(OUT, 'w', encoding='utf-8').write(s + '\n')
    print('spider-motions.json:', ', '.join(SPEC))


if __name__ == '__main__':
    main()
