#!/usr/bin/env python3
"""제자리 동작에서 두 발바닥 고정 (GDD 115-A 77, 사용자 2026-11-09 "어떤 움직임이든, 가만히 서있는건 발바닥이 위아래로 움직이면 안되지; 땅을 딛고 있는건데").
동작의 모든 키 시각마다, 다리마다 '바닥에 닿는 끝'의 높이가 쉬는 자세(사람형) 또는 바닥 줄(사용자 도트 몸)과 같아지게 다리 각을 풀고(1뼈 수치 풀이),
발 그림이 있으면 발은 바닥과 나란히(쉬는 각 그대로). 몸 높이(root)·몸통·팔·머리 등 다른 뼈는 그대로 — 위아래 흔들림은 상체만.
 사람형(다리 한 조각): 허벅지(leg_*) 각을 풀어 발목(foot_* 관절)을 쉬는 높이에.
 역관절(dg, 발 따로): 정강이(shin_*) 각을 풀어 발바닥(발 그림 가장 낮은 칸)을 바닥 줄에.
 덩치(hb, 종아리에 발): 종아리(shin_*) 각을 풀어 종아리 가장 낮은 칸을 바닥 줄에.
사용: python3 scripts/rig/tools/plant.py            — 사람형 알몸·여성 알몸 묶음의 제자리 동작을 고치고 같은 성별 몸 전부에 복사(body_sync)
     (사용자 도트 몸은 creature_motions.py 가 동작을 만들 때 이 풀이를 같이 씀)
"""
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import creature_motions as cm  # noqa: E402  (creature_motions 가 직접 실행되면 그 모듈을 cm 으로 바꿔 끼움)

# 제자리 동작(발을 내딛거나 뛰는 동작 — 걷기·주먹·발차기·오른손 치기·어퍼컷·스트레이트·박치기·필살기·쓰러짐·온천 — 은 뺌)
STANDING = ['idle', 'homeIdle', 'dying', 'skill', 'skill2', 'release1', 'hit', 'attack', 'attack2']
LEGS = [('leg_L', 'shin_L', 'foot_L'), ('leg_R', 'shin_R', 'foot_R')]


def end_y(tracks, t, leg, mode):
    """다리 끝 높이: ankle = 발 관절, sole = 발 그림 가장 낮은 칸, calf = 종아리 그림 가장 낮은 칸"""
    th, sh, ft = leg
    M = cm.mats(tracks, t)
    if mode == 'ankle':
        px, py = cm.B[ft]['pivot']
        m = M[ft]
        return m[1] * px + m[3] * py + m[5]
    s = ft if mode == 'sole' else sh
    m, P = M[s], cm.PTS[s]
    return float((m[1] * P[:, 0] + m[3] * P[:, 1] + m[5]).max())


def solve(tracks, t, leg, bone, mode, target, flat_foot, prefer=None):
    """bone 의 t 순간 각을 바꿔 다리 끝 높이 = target. 고친 각(없으면 None). 답이 둘이면 prefer(앞 순간 답)에 가까운 쪽 — 무릎이 앞뒤로 뒤집히지 않게"""
    keys = tracks.setdefault(bone, [[0, 0, 0, 0]])
    a0, x0, y0 = cm.samp(keys, t)

    def at(a):
        tr = dict(tracks)
        tr[bone] = [[t, a, x0, y0]]
        if flat_foot:
            tr[leg[2]] = [[t, foot_flat(tr, t, leg), 0, 0]]
        return end_y(tr, t, leg, mode) - target

    best = None
    prev = None
    for d in [i * 0.5 for i in range(-120, 121)]:
        v = at(a0 + d)
        if prev is not None and (prev[1] <= 0 <= v or v <= 0 <= prev[1]):
            lo, hi = (prev[0], a0 + d)
            for _ in range(30):
                mid = (lo + hi) / 2
                if (at(lo) <= 0) == (at(mid) <= 0):
                    lo = mid
                else:
                    hi = mid
            r = (lo + hi) / 2
            ref = a0 if prefer is None else prefer
            if best is None or abs(r - ref) < abs(best - ref):
                best = r
        prev = (a0 + d, v)
    return best


def chain_rot(tracks, t, bone):
    """뼈의 누적 동작 각(부모 쪽 동작 각 합 — 쉬는 각 제외)"""
    s = 0.0
    while bone:
        if bone in tracks:
            s += cm.samp(tracks[bone], t)[0]
        bone = cm.B[bone]['parent']
    return s


def foot_flat(tracks, t, leg):
    """발을 바닥과 나란히: 발 동작 각 = −(부모 쪽 동작 각 합)"""
    return -chain_rot(tracks, t, cm.B[leg[2]]['parent'])


def reach(tracks, t, leg, bone, mode, flat_foot):
    """다리 끝이 내려갈 수 있는 가장 낮은 높이(각을 ±60° 안에서 바꿔서)"""
    keys = tracks.get(bone, [[0, 0, 0, 0]])
    a0, x0, y0 = cm.samp(keys, t)
    best = -1e9
    for d in [i * 2.0 for i in range(-30, 31)]:
        tr = dict(tracks)
        tr[bone] = [[t, a0 + d, x0, y0]]
        if flat_foot:
            tr[leg[2]] = [[t, foot_flat(tr, t, leg), 0, 0]]
        best = max(best, end_y(tr, t, leg, mode))
    return best


def plant(motion, mode, target=None, flat_foot=True, step=None):
    """motion(tracks) 의 모든 키 시각(step 이 있으면 그 간격마다도)에서 두 발 끝을 고정. mode: ankle(사람형)·sole(역관절)·calf(덩치).
    target None = 쉬는 자세 높이. 한 발이 다리를 다 펴도 못 닿으면 그만큼 몸(root)을 낮추고 다시 풂 — 그때는 root 키도 돌려줌"""
    tr = {b: [list(k) for k in v] for b, v in motion['tracks'].items()}
    times = sorted({k[0] for v in tr.values() for k in v} | {0, motion['duration']} | (set(range(0, motion['duration'], step)) if step else set()))
    legs = [leg for leg in LEGS if mode != 'calf' or leg[1] in cm.PTS]
    rest = {leg: (end_y({}, 0, leg, mode) if target is None else target) for leg in legs}
    bone_of = {'ankle': 0, 'sole': 1, 'calf': 1}[mode]
    root0 = tr.get('root') or [[0, 0, 0, 0]]
    root_keys, out_keys, foot_keys = [], {leg: [] for leg in legs}, {leg: [] for leg in legs}
    lowered = False
    prev = {}
    for t in times:
        rot, rx, ry = cm.samp(root0, t)
        cur = dict(tr)
        cur['root'] = [[t, rot, rx, ry]]
        # 못 닿는 발이 있으면 몸을 낮춤(가장 모자란 만큼)
        need = 0.0
        for leg in legs:
            gap = rest[leg] - reach(cur, t, leg, leg[bone_of], mode, flat_foot)
            need = max(need, gap)
        if need > 0.01:
            ry += need + 0.01
            lowered = True
            cur['root'] = [[t, rot, rx, ry]]
        root_keys.append([t, round(rot, 2), round(rx, 2), round(ry, 2)])
        for leg in legs:
            b = leg[bone_of]
            a = solve(cur, t, leg, b, mode, rest[leg], flat_foot, prefer=prev.get(leg))
            a0, ax, ay = cm.samp(tr.get(b, [[0, 0, 0, 0]]), t)
            a = a0 if a is None else a
            prev[leg] = a
            out_keys[leg].append([t, round(a, 2), ax, ay])
            cur[b] = [[t, a, ax, ay]]
            if flat_foot and leg[2] in cm.B:
                foot_keys[leg].append([t, round(foot_flat(cur, t, leg), 2), 0, 0])
    out = {}
    for leg in legs:
        out[leg[bone_of]] = out_keys[leg]
        if flat_foot and leg[2] in cm.B:
            out[leg[2]] = foot_keys[leg]
    if lowered:
        out['root'] = root_keys
    return out


def main():
    from body_sync import write_motions, sync
    P = cm.R + 'motions.json'
    mo = json.load(open(P, encoding='utf-8'))
    done = {}
    for body in ('bare', 'female'):
        cm.setup(body)
        sn = cm.rig['bodyMotions'][body]
        for mid in STANDING:
            base = mo.get(mid) or {}
            ov = mo['sets'][sn].get(mid) or {}
            if not base and not ov:
                continue
            m = {**base, **{k: v for k, v in ov.items() if k != 'tracks'}, 'tracks': {**base.get('tracks', {}), **ov.get('tracks', {})}}
            new = plant(m, 'ankle')
            ent = mo['sets'][sn].setdefault(mid, {'tracks': {}})
            ent.setdefault('tracks', {}).update(new)
            done.setdefault(body, set()).update((mid, b) for b in new)
        write_motions(mo)
    for body, items in done.items():
        print(body, '제자리 동작 발 고정:', sorted({m for m, _ in items}))
        print(' → 같은 성별 몸:', sync(body, motions=items))


if __name__ == '__main__':
    main()
