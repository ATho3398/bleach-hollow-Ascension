"""블록 아이콘(48×48, 투명 배경, 정지 그림)을 코드로 그린다 — 사용자 2026-11-19 "기본 블록들부터 만들자".
실행: python3 scripts/block-icons/draw.py <출력 폴더>   (칸마다 3×3 표본을 찍어 과반이면 칠한다. 외곽선 없음, 호로 조 기본 발톱 아이콘과 같은 '뜨거운 색 띠' 느낌)"""
import math, sys
from collections import Counter
from PIL import Image

N = 48
hexc = lambda h: (int(h[1:3], 16), int(h[3:5], 16), int(h[5:7], 16), 255)
HOT = [hexc(h) for h in ["#2a0808", "#5c0f12", "#a51d1d", "#e2401f", "#ff8a2a", "#ffd166", "#fff3c4", "#ffffff"]]  # 발톱 아이콘과 같은 띠
RED = [hexc(h) for h in ["#2a0612", "#5c0a22", "#a3122e", "#e0243c", "#ff5a5a", "#ff9c8a", "#ffe0d4", "#ffffff"]]
BLUE = [hexc(h) for h in ["#0a1030", "#14246a", "#1f48b8", "#2f7cf0", "#58b4ff", "#9fe0ff", "#e4f8ff", "#ffffff"]]
WHITE, WSH = (247, 230, 220, 255), (167, 146, 156, 255)
STEEL, STSH = (179, 178, 178, 255), (128, 128, 130, 255)
SKIN, SKSH, SKLN = (250, 198, 154, 255), (201, 130, 99, 255), (98, 44, 41, 255)
NAVY, NVSH = (79, 88, 112, 255), (31, 37, 59, 255)
GOLD, GDSH = (255, 209, 102, 255), (178, 120, 20, 255)

def render(fn):
    im = Image.new("RGBA", (N, N), (0, 0, 0, 0)); p = im.load()
    for y in range(N):
        for x in range(N):
            hits = [c for c in (fn(x + (i + 0.5) / 3, y + (j + 0.5) / 3) for i in range(3) for j in range(3)) if c]
            if len(hits) >= 5: p[x, y] = Counter(hits).most_common(1)[0][0]
    return im

def ramp(pal, heat):  # heat 0..1 → 어두운 색..흰색
    return pal[max(1, min(len(pal) - 1, int(round(1 + heat * (len(pal) - 2)))))]

def bez(p0, p1, p2, n=160):
    return [((1 - t) ** 2 * p0[0] + 2 * (1 - t) * t * p1[0] + t * t * p2[0], (1 - t) ** 2 * p0[1] + 2 * (1 - t) * t * p1[1] + t * t * p2[1]) for t in (i / n for i in range(n + 1))]

def along(curve, x, y):
    """곡선에서 가장 가까운 점: (t 0..1, 부호 있는 수직 거리 — 진행 방향의 오른쪽이 +)"""
    bi, bd = 0, 1e9
    for i, (cx, cy) in enumerate(curve):
        d = (x - cx) ** 2 + (y - cy) ** 2
        if d < bd: bi, bd = i, d
    a, b = curve[max(0, bi - 1)], curve[min(len(curve) - 1, bi + 1)]
    tx, ty = b[0] - a[0], b[1] - a[1]; l = math.hypot(tx, ty) or 1
    s = ((x - curve[bi][0]) * (-ty) + (y - curve[bi][1]) * tx) / l
    return bi / (len(curve) - 1), s, math.sqrt(bd)

def gash(curve, W, pal, x, y, power=0.9):
    t, s, d = along(curve, x, y)
    if t <= 0 or t >= 1: return None
    hw = W / 2 * math.sin(math.pi * t) ** power
    if hw < 0.35 or abs(s) > hw: return None
    return ramp(pal, 1 - (abs(s) / hw) ** 1.3 * 0.75 - (1 - math.sin(math.pi * t)) * 0.25)

# 1) 일본도: 왼쪽 아래 손잡이 → 오른쪽 위 칼끝, 살짝 휜 날
KAT = bez((4.5, 44.5), (20, 25), (44, 3.5))
def katana(x, y):
    t, s, d = along(KAT, x, y)
    if t <= 0.004 or t >= 1: return None
    if t < 0.035: return (GOLD if s < 0.6 else GDSH) if abs(s) <= 2.4 else None          # 자루 끝
    if t < 0.25:                                                                             # 자루(끈 감은 무늬)
        if abs(s) > 2.3: return None
        k = (t * 160 + abs(s) * 2.2) % 9
        return WSH if k < 2.4 and abs(s) < 1.7 else (NAVY if s < 0.7 else NVSH)
    if t < 0.295: return (GOLD if s < 1.5 else GDSH) if abs(s) <= 5.6 else None           # 코등이
    hw = 2.5 * min(1, ((1 - t) / 0.13) ** 0.8)                                               # 날: 칼끝에서 좁아진다
    if abs(s) > hw: return None
    return WHITE if s > 0.9 else (STSH if s < -1.0 else STEEL)                               # 날 쪽 밝게, 등 쪽 어둡게

# 2) 칼로 벤 상처: 왼쪽 위 → 오른쪽 아래 긴 한 줄 + 핏방울
CUT = bez((3, 6), (27, 19), (45, 43))
DROPS = [(15, 27, 1.7), (22, 36, 2.2), (31, 42, 1.4), (9, 19, 1.2)]
def cut(x, y):
    c = gash(CUT, 9.5, HOT, x, y, 0.75)
    if c: return c
    for dx, dy, r in DROPS:
        if (x - dx) ** 2 + ((y - dy) * 0.8) ** 2 <= r * r: return HOT[3] if (x - dx) + (y - dy) < 0.3 else HOT[2]
    return None

# 3) 이빨 위아래: 윗니 4개(바깥이 송곳니) + 아랫니 3개가 엇갈린다. 잇몸 없음
UP = [(7.5, 21, 5.2), (19, 14, 4.2), (29, 14, 4.2), (40.5, 21, 5.2)]     # (가운데 x, 길이, 뿌리 반폭)
LO = [(13.3, 15, 4.6), (24, 18, 4.8), (34.7, 15, 4.6)]
def fangs(x, y):
    for cx, L, hw0 in UP:
        v = (y - 3) / L
        if 0 <= v < 1:
            hw = hw0 * (1 - v) ** 0.85; s = x - cx
            if abs(s) <= hw: return WSH if (s > hw * 0.3 or v < 0.09) else WHITE
    for cx, L, hw0 in LO:
        v = (45 - y) / L
        if 0 <= v < 1:
            hw = hw0 * (1 - v) ** 0.85; s = x - cx
            if abs(s) <= hw: return WSH if (s > hw * 0.3 or v < 0.09) else WHITE
    return None

# 4) 마법 에너지볼(사선): 오른쪽 위의 구슬 + 왼쪽 아래로 끌리는 꼬리
def orb(pal):
    cx, cy, r, TL = 31.5, 16.5, 11.5, 34.0
    def f(x, y):
        dx, dy = x - cx, y - cy; d = math.hypot(dx, dy)
        if d <= r:
            hl = math.hypot(dx - 2.5, dy + 2.5)                       # 밝은 속은 오른쪽 위로 치우친다
            return ramp(pal, 1 - (hl / (r + 2.5)) ** 1.6)
        u = (-dx + dy) / math.sqrt(2); s = (dx + dy) / math.sqrt(2)   # 꼬리 축 = 왼쪽 아래
        if 0 < u < TL:
            k = u / TL; hw = r * 0.92 * (1 - k) ** 1.25
            if abs(s) <= hw:
                heat = (1 - abs(s) / hw) * (1 - k) * 0.85
                if math.sin(s * 1.9 + 0.8) > 0.55 and k > 0.25: return None   # 꼬리 결(가는 틈)
                return ramp(pal, heat * 0.8)
        return None
    return f

# 5) 주먹(정면, 살짝 기울임): 손가락 네 마디 + 손바닥 + 가로지른 엄지
def rrect(x, y, x0, y0, x1, y1, r):
    cx, cy = min(max(x, x0 + r), x1 - r), min(max(y, y0 + r), y1 - r)
    return x0 <= x <= x1 and y0 <= y <= y1 and (x - cx) ** 2 + (y - cy) ** 2 <= r * r
def capsule(x, y, a, b, r):
    vx, vy = b[0] - a[0], b[1] - a[1]; t = max(0, min(1, ((x - a[0]) * vx + (y - a[1]) * vy) / (vx * vx + vy * vy)))
    return math.hypot(x - a[0] - t * vx, y - a[1] - t * vy) <= r
FING = [(6.5, 10.5), (15.3, 8.5), (24.1, 9), (32.9, 11)]   # (왼쪽 x, 위 y), 폭 8.6
def fist(x, y):
    a = math.radians(-10); c, s_ = math.cos(a), math.sin(a); X, Y = x - 24, y - 24
    x, y = 24 + X * c - Y * s_, 24 + X * s_ + Y * c
    if capsule(x, y, (13, 33.5), (29.5, 30.5), 5.2):                                   # 엄지(맨 위)
        if not capsule(x, y, (13, 33.5), (29.5, 30.5), 4.2): return SKLN
        return SKSH if capsule(x, y, (13, 35.3), (29.5, 32.3), 3.2) and not capsule(x, y, (13, 33), (29.5, 30), 3.4) else SKIN
    for fx, fy in FING:
        if rrect(x, y, fx, fy, fx + 8.6, 29, 3.6):
            if not rrect(x, y, fx + 0.9, fy + 0.9, fx + 7.7, 30, 2.9): return SKLN       # 마디 사이 선
            if abs(y - (fy + 9.5)) < 0.55: return SKSH                                     # 마디 주름
            return SKSH if x > fx + 6.2 else SKIN
    if rrect(x, y, 7.5, 24, 41, 42.5, 6.5):
        if not rrect(x, y, 8.5, 24, 40, 41.5, 5.8): return SKLN
        return SKSH if (x > 34.5 or y > 37.5) else SKIN
    return None

ICONS = {"katana": katana, "cut": cut, "fangs": fangs, "orb-red": orb(RED), "orb-blue": orb(BLUE), "fist": fist}
if __name__ == "__main__":
    out = sys.argv[1]
    for name, fn in ICONS.items(): render(fn).save(f"{out}/{name}.png")
