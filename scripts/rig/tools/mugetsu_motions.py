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


def m(duration, times, root, bones, loop=False, hit=None):
    tr = {'root': [[t, *r] for t, r in zip(times, root)]}
    for b, v in bones.items():
        assert len(v) == len(times), (b, len(v), len(times))
        tr[b] = [[t, a, 0, 0] for t, a in zip(times, v)]
    out = {'duration': duration, 'loop': loop}
    if hit is not None:
        out['hit'] = hit
    out['tracks'] = tr
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
               'arm_back': [0, 8, -20, -30, -28], 'thigh_f': [0, 10, 6, 0, 0], 'shin_f': [0, -14, -8, 0, 0]}),
}


def walk():
    """이동(사용자 2026-11-14 17:46 "무월 걷기 왤케 어색하냐. 좀 더 고쳐봐"): 다리를 흔들기만 하면 발이 원을 그리며 미끄러진다 →
    발목이 갈 자리를 먼저 정하고(디딘 발은 땅에 붙어 뒤로 밀리고, 뗀 발은 살짝 들려 앞으로) 허벅지·정강이 각도를 거꾸로 풀어 맞춘다. 발은 늘 땅과 나란히."""
    import math
    rig = json.load(open(os.path.join(DRAFT_DIR, 'mugetsu.json'), encoding='utf-8'))
    piv = {b['id']: b['pivot'] for b in rig['bones']}
    piv.update((rig.get('bodyJoints') or {}).get('parts', {}).get('pivots', {}))
    N, D, STEP, LIFT = 12, 760, 8.0, 4.0  # 2026-11-14 17:5x "실제 걷는것처럼 교차해서 … 모션도 더 디테일": 보폭·들림 키우고 키 12개
    times = [round(D * i / N) for i in range(N + 1)]
    bob = [1.2 * math.cos(4 * math.pi * i / N) for i in range(N + 1)]  # 두 발이 벌어졌을 때 낮고, 지나갈 때 높음
    tr = {'root': [[t, 0, 0, round(bob[i], 2)] for i, t in enumerate(times)]}
    for leg, ph0 in (('f', 0.0), ('b', 0.5)):
        H, K, A = piv['thigh_' + leg], piv['shin_' + leg], piv['foot_' + leg]
        l1, l2 = math.dist(H, K), math.dist(K, A)
        r1, r2 = math.atan2(K[1] - H[1], K[0] - H[0]), math.atan2(A[1] - K[1], A[0] - K[0])
        th, sh, ft = [], [], []
        for i in range(N + 1):
            ph = (i / N + ph0) % 1
            if ph < 0.5:  # 디딤: 앞(왼쪽, −x) → 뒤
                dx, dy = -STEP + 2 * STEP * (ph / 0.5), 0.0
            else:         # 뗌: 뒤 → 앞, 가운데서 가장 높이
                u = (ph - 0.5) / 0.5
                dx, dy = STEP - 2 * STEP * u, -LIFT * math.sin(math.pi * u)
            tx, ty = A[0] + dx - H[0], A[1] + dy - bob[i] - H[1]
            d = min(math.hypot(tx, ty), l1 + l2 - 0.01)
            base = math.atan2(ty, tx)
            c = max(-1, min(1, (l1 * l1 + d * d - l2 * l2) / (2 * l1 * d)))
            best = None
            for sgn in (1, -1):  # 무릎은 쉬는 자세와 같은 쪽으로(가장 덜 도는 풀이)
                a1 = base + sgn * math.acos(c)
                kx, ky = l1 * math.cos(a1), l1 * math.sin(a1)
                a2 = math.atan2(ty * d / math.hypot(tx, ty) - ky, tx * d / math.hypot(tx, ty) - kx)
                turn = abs((math.degrees(a1 - r1) + 180) % 360 - 180) + abs((math.degrees(a2 - r2) + 180) % 360 - 180)
                if best is None or turn < best[0]:
                    best = (turn, a1, a2)
            w1 = (math.degrees(best[1] - r1) + 180) % 360 - 180
            w2 = (math.degrees(best[2] - r2) + 180) % 360 - 180
            th.append(round(w1, 1)); sh.append(round(w2 - w1, 1)); # 발 굴림: 디딜 때 발끝이 들려 뒤꿈치부터(−), 디딤 끝에 뒤꿈치가 들려 발끝으로 밀고(+), 뗀 동안은 발끝이 처졌다가 앞에서 다시 들림
            if ph < 0.5:
                u = ph / 0.5
                pitch = -10 * max(0, 1 - u / 0.25) + 14 * max(0, (u - 0.7) / 0.3)
            else:
                u = (ph - 0.5) / 0.5
                pitch = 14 * (1 - u) * (1 - u) + 6 * math.sin(math.pi * u) - 10 * u * u
            ft.append(round(-w2 + pitch, 1))
        for bone, v in (('thigh_', th), ('shin_', sh), ('foot_', ft)):
            tr[bone + leg] = [[t, a, 0, 0] for t, a in zip(times, v)]
    sw = lambda amp, off=0.0: [round(amp * math.cos(2 * math.pi * (i / N + off)), 1) for i in range(N + 1)]  # noqa: E731
    # 몸: 앞으로 숙이고 걸음마다 살짝 끄덕, 어깨는 다리와 반대로 틀림. 팔은 다리와 엇갈려(오른 다리가 앞이면 왼팔이 앞) 흔들고 아래팔이 조금 늦게 따라옴
    two = lambda base, amp: [round(base + amp * math.cos(4 * math.pi * i / N), 1) for i in range(N + 1)]  # noqa: E731
    for bone, v in (('upper', [round(a + b, 1) for a, b in zip(two(-4, 1.0), sw(1.5, 0.5))]), ('lower', sw(1.2)), ('head', [round(a + b, 1) for a, b in zip(two(2.5, -0.8), sw(-1.0, 0.5))]),
                    ('arm_sword', sw(6, 0.0)), ('forearm_sword', sw(4, 0.08)), ('sword', sw(3, 0.16)), ('arm_back', sw(11, 0.5)), ('forearm_back', sw(7, 0.58))):
        tr[bone] = [[t, a, 0, 0] for t, a in zip(times, v)]
    return {'duration': D, 'loop': True, 'tracks': tr}


def main():
    SPEC['move'] = walk()
    cur = json.load(open(OUT, encoding='utf-8'))
    mo = {'note': '이치고(무월) 동작(GDD 115-A 129·133). 키 = [t, 각도(+=시계), x, y]. 뒷머리·왼 아래팔은 따라가기(sway). 대기 말고는 scripts/rig/tools/mugetsu_motions.py 로 만듦.',
          'idle': cur['idle'], 'move': SPEC['move'], **{k: v for k, v in SPEC.items() if k != 'move'}}
    open(OUT, 'w', encoding='utf-8').write(json.dumps(mo, ensure_ascii=False, indent=1) + '\n')
    print('mugetsu 동작', [k for k in mo if k != 'note'])


if __name__ == '__main__':
    main()
