#!/usr/bin/env python3
"""짐승형·뱀형에 빈사(dying)·쓰러짐(down), 짐승형에 공격3(attack3)을 넣는다 (GDD 115-A 120, 사용자 2026-11-12 03:5x
"호로에 빈사랑 쓰러짐 없는 애들 다 추가해서" · "짐승형은 공격 3으로 몸 크게 들어서 내려찍는모션 추가").
짐승·뱀 동작 파일은 손으로 쓴 키라(만드는 도구 없음) 이 도구는 아래 동작만 덮어쓴다 — 편집기에서 고정한 트랙(edited)은 그대로 둔다.
키 = [t, 각도(+ = 시계), x, y]. 사용: python3 scripts/rig/tools/faint_motions.py
"""
import json
import math
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from paths import DRAFT_DIR  # noqa: E402


def m(duration, times, root, bones, loop=False, hit=None, note=None):
    tr = {'root': [[t, *[round(v, 2) for v in r]] for t, r in zip(times, root)]}
    for b, v in bones.items():
        assert len(v) == len(times), (b, len(v), len(times))
        tr[b] = [[t, a, 0, 0] for t, a in zip(times, v)]
    out = {'duration': duration, 'loop': loop}
    if hit is not None:
        out['hit'] = hit
    if note:
        out['note'] = note
    out['tracks'] = tr
    return out


def rear(deg, dx=0.0, dy=0.0, pivot=(25, 9), heel=(49, 31)):
    """짐승이 뒷발 뒤꿈치(heel)를 디딘 채 몸 전체를 deg 만큼 세울 때의 전체(root) 키 — 전체 뼈는 pivot 둘레로 돌므로 뒤꿈치가 제자리에 남게 옮겨 준다"""
    vx, vy = heel[0] - pivot[0], heel[1] - pivot[1]
    c, s = math.cos(math.radians(deg)), math.sin(math.radians(deg))
    return (deg, vx - (vx * c - vy * s) + dx, vy - (vx * s + vy * c) + dy)


# ── 짐승: 발 붙이기 (뼈 변환 = 엔진 pose.ts local 과 같음: T(x,y)·T(pivot)·R·T(−pivot), 쉬는 자세의 모든 뼈 = 제자리) ──
RIG = json.load(open(os.path.join(DRAFT_DIR, 'beast.json'), encoding='utf-8'))
BONE = {b['id']: b for b in RIG['bones']}
LEGS = {'fleg_R': 'fleg_R2', 'fleg_L': 'fleg_L2', 'hleg_R': 'hleg_R2', 'hleg_L': 'hleg_L2'}
STEP = 50


def mul(m, n):
    return [m[0] * n[0] + m[2] * n[1], m[1] * n[0] + m[3] * n[1], m[0] * n[2] + m[2] * n[3], m[1] * n[2] + m[3] * n[3],
            m[0] * n[4] + m[2] * n[5] + m[4], m[1] * n[4] + m[3] * n[5] + m[5]]


def app(m, p):
    return (m[0] * p[0] + m[2] * p[1] + m[4], m[1] * p[0] + m[3] * p[1] + m[5])


def local(bid, k):
    r = math.radians(k[0])
    c, s = math.cos(r), math.sin(r)
    px, py = BONE[bid]['pivot']
    return [c, s, -s, c, px - c * px + s * py + k[1], py - s * px - c * py + k[2]]


def world(pose, bid):
    b = BONE[bid]
    me = local(bid, pose.get(bid, (0, 0, 0)))
    return mul(world(pose, b['parent']), me) if b.get('parent') else me


def smooth(keys, t):
    if t <= keys[0][0]:
        return list(keys[0][1:])
    for a, b in zip(keys, keys[1:]):
        if t <= b[0]:
            u = (t - a[0]) / max(1, b[0] - a[0])
            u = u * u * (3 - 2 * u)
            return [x + (y - x) * u for x, y in zip(a[1:], b[1:])]
    return list(keys[-1][1:])


_ART = {}


def art_pts(slot):
    """그 부위 그림의 불투명 칸(캔버스 좌표)"""
    if slot not in _ART:
        from PIL import Image
        part = RIG['bodies']['ref'][slot]
        im = Image.open(os.path.join(DRAFT_DIR, 'beast', part['art'] + '.png')).convert('RGBA')
        _ART[slot] = [(part['at'][0] + x + 0.5, part['at'][1] + y + 0.5) for y in range(im.height) for x in range(im.width) if im.getpixel((x, y))[3] > 127]
    return _ART[slot]


def planted(mo, feet, ground=False):
    """mo(성긴 키)를 50ms 마다 다시 찍으며 발을 붙인다. feet = {윗다리: f(t) → None(자유 — 키 그대로) 또는 (dx, dy)(쉬는 자리에서 이만큼 옮겨 디딤)}.
    디딘 다리: 윗다리는 엉덩이에서 '디딘 발목 자리'를 겨누고, 아랫마디(발)는 쉬는 자세 그대로(회전·자리) 바닥에 남는다.
    ground=True 면 순간마다 가장 낮은 그림 칸이 바닥 줄에 닿게 전체(root) 높이를 맞춘다(쓰러짐 — 몸이 바닥 아래로 꺼지지 않게)"""
    dur = mo['duration']
    ts = list(range(0, dur, STEP)) + [dur]
    src = mo['tracks']
    out = {b: [] for b in src}
    for up, lo in LEGS.items():
        out.setdefault(up, [])
        out.setdefault(lo, [])
    for t in ts:
        pose = {b: smooth(k, t) for b, k in src.items()}
        for up, lo in LEGS.items():
            pose.setdefault(up, [0, 0, 0])
            pose.setdefault(lo, [0, 0, 0])
        for up, lo in LEGS.items():
            d = feet.get(up, lambda _t: None)(t)
            if d is None:
                continue
            wp = world(pose, BONE[up]['parent'])
            hip = app(wp, BONE[up]['pivot'])
            pu, pl = BONE[up]['pivot'], BONE[lo]['pivot']
            tgt = (pl[0] + d[0], pl[1] + d[1])
            prot = math.degrees(math.atan2(wp[1], wp[0]))
            rot = math.degrees(math.atan2(tgt[1] - hip[1], tgt[0] - hip[0]) - math.atan2(pl[1] - pu[1], pl[0] - pu[0])) - prot
            rot = (rot + 180) % 360 - 180
            pose[up] = [rot, 0, 0]
            wu = mul(wp, local(up, pose[up]))
            urot = math.degrees(math.atan2(wu[1], wu[0]))
            # 발: 세계 변환 = T(d) 가 되게 — 회전은 윗다리 회전을 되돌리고, 관절(pivot)이 tgt 에 오게 옮김
            pose[lo] = [-urot, 0, 0]
            at = app(mul(wu, local(lo, pose[lo])), pl)
            det = wu[0] * wu[3] - wu[1] * wu[2]
            ex, ey = tgt[0] - at[0], tgt[1] - at[1]
            pose[lo] = [-urot, (wu[3] * ex - wu[2] * ey) / det, (-wu[1] * ex + wu[0] * ey) / det]
        if ground:
            low = max(app(world(pose, s['bone']), p)[1] for s in RIG['slots'] if s['id'] in RIG['bodies']['ref'] for p in art_pts(s['id']))
            pose['root'][2] += RIG['ground'] - low
        for b in out:
            out[b].append([t, *[round(v, 2) for v in pose[b]]])
    mo = dict(mo)
    mo['tracks'] = out
    return mo


def at(*spans):
    """(t0, t1, dx, dy) 구간에서만 디딤 — 그 밖은 자유"""
    def f(t):
        for t0, t1, dx, dy in spans:
            if t0 <= t <= t1:
                return (dx, dy)
        return None
    return f


BEAST = {
    # 공격3: 낮게 웅크렸다가 뒷발로 서서 몸을 크게 치켜들고(42°) 앞발 둘을 모아 들었다가 온몸으로 내리찍음 — 찍은 뒤 한 번 더 눌렀다가 돌아옴
    'attack3': m(1300, [0, 350, 650, 800, 900, 1000, 1120, 1300],
                 [rear(0), rear(-2, 1, 2.5), rear(34, 0, -1), rear(36, 0, -1), rear(0, -5, 2.5), rear(0, -4, 1.5), rear(0, -4, 2), rear(0)],
                 {'body': [0, -2, 8, 9, -3, -2, -2, 0], 'belly': [0, 2, -6, -7, 3, 2, 2, 0], 'head': [0, -5, 16, 18, -14, -8, -10, 0],
                  'fleg_R': [0, 0, 42, 46, 0, 0, 0, 0], 'fleg_R2': [0, 0, -40, -44, 0, 0, 0, 0],
                  'fleg_L': [0, 0, 34, 38, 0, 0, 0, 0], 'fleg_L2': [0, 0, -34, -38, 0, 0, 0, 0],
                  'tail': [0, 8, -20, -24, 18, 8, 10, 0], 'tail2': [0, 10, -24, -28, 24, 10, 12, 0]},
                 hit=900, note='공격3(GDD 115-A 120): 뒷발로 서서 몸을 크게 들었다가 앞발로 내리찍기. 뒷발은 내내 디딘 채(다리 트랙은 도구가 50ms 마다 푼 값), 앞발은 들 때만 자유'),
    # 빈사: 다리를 굽혀 낮게 주저앉고 머리·꼬리를 떨군 채 느리게 헐떡임
    'dying': m(2400, [0, 1200, 2400], [(0, 0, 3), (0, 0, 4), (0, 0, 3)],
               {'body': [-3, -4, -3], 'belly': [2, 3, 2], 'head': [-12, -15, -12], 'tail': [16, 20, 16], 'tail2': [22, 28, 22]},
               loop=True, note='빈사(GDD 115-A 120): 낮게 주저앉아 헐떡임 — 발 넷은 디딘 채(다리 트랙은 도구가 푼 값)'),
    # 쓰러짐(끝 자세 유지): 휘청 → 앞다리가 먼저 풀려 앞으로 꺾이고 → 뒷다리도 풀려 배를 깔고 엎어짐(다리는 앞뒤로 뻗고 머리·꼬리는 바닥에)
    'down': m(1000, [0, 200, 450, 700, 850, 1000], [(0, 0, 0), (3, 2, -1), (-8, -1, 3), (-2, -2, 9), (-2, -2, 8), (-2, -2, 9)],
              {'body': [0, 3, -8, -4, -3, -4], 'belly': [0, -2, 6, 4, 3, 4], 'head': [0, 10, -14, -24, -18, -26],
               'fleg_R': [0, -6, 40, 68, 64, 68], 'fleg_R2': [0, 0, -30, 14, 12, 14], 'fleg_L': [0, -5, 34, 62, 58, 62], 'fleg_L2': [0, 0, -26, 12, 10, 12],
               'hleg_R': [0, 6, -10, -62, -58, -62], 'hleg_R2': [0, -4, 14, -16, -14, -16], 'hleg_L': [0, 5, -8, -56, -52, -56], 'hleg_L2': [0, -3, 12, -14, -12, -14],
               'tail': [0, -8, 10, 30, 26, 32], 'tail2': [0, -10, 14, 36, 30, 38]}, note='쓰러짐(GDD 115-A 120): 앞다리부터 풀려 배를 깔고 엎어짐 — 끝 자세 유지'),
}

SERPENT = {
    # 빈사: 선 몸이 앞으로 축 처져 느리게 헐떡임(마디마다 조금씩 숙임), 꼬리 끝도 처짐
    'dying': m(2400, [0, 1200, 2400], [(0, 0, 0), (0, 0, 0), (0, 0, 0)],
               {'body1': [-5, -6, -5], 'body2': [-7, -9, -7], 'neck1': [-8, -11, -8], 'neck2': [-6, -8, -6], 'head': [-10, -14, -10],
                'arm': [10, 14, 10], 'tail1': [6, 8, 6], 'tail2': [14, 18, 14]}, loop=True, note='빈사(GDD 115-A 120): 앞으로 축 처져 헐떡임'),
    # 쓰러짐(끝 자세 유지): 뒤로 한 번 휘청했다가 힘이 빠져 선 몸이 마디마디 앞으로 꺾이며 바닥에 길게 눕는다
    'down': m(1000, [0, 200, 480, 720, 860, 1000], [(0, 0, 0), (0, 1, 0), (0, -1, 0), (0, -2, 0), (0, -2, 0), (0, -2, 0)],
              {'body1': [0, 6, -12, -22, -20, -22], 'body2': [0, 8, -16, -26, -23, -26], 'neck1': [0, 8, -14, -22, -18, -22], 'neck2': [0, 6, -8, -14, -10, -14],
               'head': [0, 10, -10, -4, 2, -4], 'arm': [0, -14, 20, 40, 36, 40], 'tail1': [0, -6, 6, 10, 8, 10], 'tail2': [0, -10, 12, 26, 22, 26]},
              note='쓰러짐(GDD 115-A 120): 마디마디 앞으로 꺾이며 바닥에 눕는다 — 끝 자세 유지'),
}


def write(name, spec):
    path = os.path.join(DRAFT_DIR, name)
    cur = json.load(open(path, encoding='utf-8'))
    for mid, mo in spec.items():
        mo = json.loads(json.dumps(mo))
        ed = (cur.get(mid) or {}).get('edited') or []
        if ed:
            mo['tracks'].update({b: cur[mid]['tracks'][b] for b in ed if b in cur[mid].get('tracks', {})})
            mo['edited'] = list(ed)
        cur[mid] = mo
    s = json.dumps(cur, ensure_ascii=False, indent=1)
    s = re.sub(r'\[\s+(-?[\d.]+),\s+(-?[\d.]+),\s+(-?[\d.]+),\s+(-?[\d.]+)\s+\]', r'[\1, \2, \3, \4]', s)
    open(path, 'w', encoding='utf-8').write(s + '\n')
    print(name, ', '.join(spec))


HOLD = at((0, 99999, 0, 0))
BEAST['attack3'] = planted(BEAST['attack3'], {'hleg_R': HOLD, 'hleg_L': HOLD, 'fleg_R': at((0, 400, 0, 0), (900, 1150, -5, 0)), 'fleg_L': at((0, 400, 0, 0), (900, 1150, -5, 0))})
BEAST['dying'] = planted(BEAST['dying'], {k: HOLD for k in LEGS})
BEAST['down'] = planted(BEAST['down'], {}, ground=True)

if __name__ == '__main__':
    write('beast-motions.json', BEAST)
    write('serpent-motions.json', SERPENT)
