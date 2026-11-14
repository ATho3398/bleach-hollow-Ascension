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
    # 이동: 하카마 두 다리가 엇갈리고 몸은 살짝 앞으로, 칼 든 팔은 뒤로 끌 듯 조금만
    'move': m(640, [0, 160, 320, 480, 640], [(0, 0, 0), (0, 0, -1), (0, 0, 0), (0, 0, -1), (0, 0, 0)],
              {'upper': [-4, -5, -4, -5, -4], 'head': [2, 3, 2, 3, 2],
               'thigh_f': [14, 2, -12, 2, 14], 'shin_f': [-4, 6, 10, -6, -4], 'foot_f': [-8, -4, 6, 8, -8],
               'thigh_b': [-12, 2, 14, 2, -12], 'shin_b': [10, -6, -4, 6, 10], 'foot_b': [6, 8, -8, -4, 6],
               'arm_sword': [-6, -3, 2, -3, -6], 'forearm_sword': [-4, -2, 0, -2, -4], 'arm_back': [8, 0, -8, 0, 8]}, loop=True),
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
    'down': m(900, [0, 250, 550, 720, 900], [Z, (8, 0, 1), (55, -25, -14), (88, -48, -27), (86, -48, -26)],
              {'upper': [0, -8, 4, 2, 0], 'head': [0, -6, 8, 4, 2], 'arm_sword': [0, 10, -25, -40, -38], 'sword': [0, 0, -10, -20, -18],
               'arm_back': [0, 8, -20, -30, -28], 'thigh_f': [0, 10, 6, 0, 0], 'shin_f': [0, -14, -8, 0, 0]}),
}


def main():
    cur = json.load(open(OUT, encoding='utf-8'))
    mo = {'note': '이치고(무월) 동작(GDD 115-A 129·133). 키 = [t, 각도(+=시계), x, y]. 뒷머리·왼 아래팔은 따라가기(sway). 대기 말고는 scripts/rig/tools/mugetsu_motions.py 로 만듦.',
          'idle': cur['idle'], **SPEC}
    open(OUT, 'w', encoding='utf-8').write(json.dumps(mo, ensure_ascii=False, indent=1) + '\n')
    print('mugetsu 동작', [k for k in mo if k != 'note'])


if __name__ == '__main__':
    main()
