"""동작 틀. 프레임마다 부위별 {rot: 각도(양수=화면 반시계), dx, dy: 픽셀}.

그림은 왼쪽을 본다(기획서 17-6). 아래로 늘어진 팔·다리를 반시계로 돌리면 뒤(오른쪽)로,
시계(음수)로 돌리면 앞(왼쪽)으로 간다. root 는 몸통(나머지 전부)이고 다른 부위는 부모를 따라 움직인다.
부위 이름: root, head, armF(앞팔), armB(뒷팔), legF(앞다리), legB(뒷다리), tail.
"""
import math


def _walk(n=5, leg=16, arm=14, lean=2, head=2):
    frames = []
    for i in range(n):
        s = math.sin(2 * math.pi * i / n)
        c = math.cos(2 * math.pi * i / n)
        frames.append({
            'root': {'rot': lean, 'dy': -round(abs(c) * 2)},
            'head': {'rot': -head * c},
            'legF': {'rot': -leg * s},
            'legB': {'rot': leg * s},
            'armF': {'rot': arm * s},
            'armB': {'rot': -arm * s},
            'tail': {'rot': 6 * c},
        })
    return frames


def _float(n=5, bob=6, sway=6):
    # 다리 없는 부유형: 몸 전체 위아래 + 옷자락(legF/legB 자리)·팔 흔들기
    frames = []
    for i in range(n):
        s = math.sin(2 * math.pi * i / n)
        c = math.cos(2 * math.pi * i / n)
        frames.append({
            'root': {'rot': 3 + s * 2, 'dy': -round(bob * (1 + c) / 2)},
            'head': {'rot': -2 * s},
            'armF': {'rot': sway * s},
            'armB': {'rot': -sway * s},
            'legF': {'rot': 8 * s},
            'legB': {'rot': 8 * s},
            'tail': {'rot': 10 * s},
        })
    return frames


# 공격: 예비(뒤로 젖힘) 2장 → 타격 → 따라가기 → 복귀. hit = 3번째 장
_BIPED_ATTACK = [
    {'root': {'rot': -4, 'dx': 4}, 'head': {'rot': -3}, 'armF': {'rot': 40}, 'armB': {'rot': -10}, 'legF': {'rot': -4}},
    {'root': {'rot': -7, 'dx': 8}, 'head': {'rot': -5}, 'armF': {'rot': 80}, 'armB': {'rot': -15}, 'legF': {'rot': -8}},
    {'root': {'rot': 6, 'dx': -6}, 'head': {'rot': 4}, 'armF': {'rot': -55}, 'armB': {'rot': 20}, 'legF': {'rot': -12}, 'legB': {'rot': 10}},
    {'root': {'rot': 4, 'dx': -4}, 'head': {'rot': 2}, 'armF': {'rot': -35}, 'armB': {'rot': 12}, 'legF': {'rot': -8}, 'legB': {'rot': 6}},
    {'root': {'rot': 1, 'dx': -1}, 'armF': {'rot': -8}, 'armB': {'rot': 3}, 'legF': {'rot': -3}},
]

MOTIONS = {
    'biped': {
        'move': {'frames': _walk(), 'ms': 120, 'ground': True},
        'attack': {'frames': _BIPED_ATTACK, 'ms': [140, 160, 110, 140, 160], 'hit': 3, 'ground': True},
    },
    'float': {
        'move': {'frames': _float(), 'ms': 140, 'ground': False},
        'attack': {'frames': _BIPED_ATTACK, 'ms': [140, 160, 110, 140, 160], 'hit': 3, 'ground': False},
    },
}


# 반복 동작은 장수를 바꿔 다시 만들 수 있다(--frames). 한 바퀴 시간은 그대로 두고 장당 ms 를 나눈다
LOOP_MAKERS = {
    'biped': {'move': (_walk, 600)},
    'float': {'move': (_float, 700)},
}


def make_loop(template: str, motion: str, n: int) -> dict | None:
    maker = LOOP_MAKERS.get(template, {}).get(motion)
    if not maker:
        return None
    fn, cycle_ms = maker
    spec = dict(MOTIONS[template][motion])
    spec['frames'] = fn(n)
    spec['ms'] = round(cycle_ms / n)
    return spec
