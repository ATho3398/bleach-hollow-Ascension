"""블록 사각형(62×62, 반지름 20, 테 3줄)과 체인 판을 속성 색별로 그린다 — 사용자 2026-11-19 "속성에 맞는 색깔별 블록도 만들어봐" · "체인 색 = 그 블록의 속성 색".
실행: python3 scripts/block-icons/frames.py <출력 폴더>   (블록 안 아이콘은 여기서 그리지 않는다 — 아이콘은 pixelfx, scripts/pixelfx/custom/custom/icon-*.js)
색 = 지금 게임의 속성 색(src/ui/bha/v2 의 --bha-attr-*). 허는 임시(봉인 보라). 테 = 속성 색 두 줄 + 어두운 한 줄, 안 = 속성 색을 어둡게 섞은 색, 체인 판 = 속성 색."""
import sys
from PIL import Image
N, R, GAP, M, CR = 62, 20, 4, 3, 9
ELEMENTS = {"normal": "#b3a793", "water": "#62adc0", "fire": "#dc8a5c", "earth": "#b48d62", "thunder": "#d9c063", "blood": "#d4747f", "poison": "#9db45e", "kyo": "#a371f7"}
DARK = (20, 16, 18)
rgb = lambda h: (int(h[1:3], 16), int(h[3:5], 16), int(h[5:7], 16))
mix = lambda a, b, k: tuple(round(a[i] * (1 - k) + b[i] * k) for i in range(3)) + (255,)
def rr(x, y, x0, y0, n, r):
    x -= x0; y -= y0
    if not (0 <= x < n and 0 <= y < n): return False
    cx = min(max(x + 0.5, r), n - r); cy = min(max(y + 0.5, r), n - r)
    return (x + 0.5 - cx) ** 2 + (y + 0.5 - cy) ** 2 <= r * r
def frame(base, shade, fill):
    im = Image.new("RGBA", (N, N), (0, 0, 0, 0)); p = im.load()
    for y in range(N):
        for x in range(N):
            if not rr(x, y, 0, 0, N, R): continue
            l = 3
            for i in (1, 2, 3):
                if not rr(x, y, i, i, N - 2 * i, R - i): l = i - 1; break
            p[x, y] = fill if l == 3 else (base, base, shade)[l]
    return im
def plate(n, base, shade):
    w, h = n * N + (n - 1) * GAP + 2 * M, N + 2 * M
    U = [[any(rr(x, y, i * (N + GAP), 0, N + 2 * M, R + M) for i in range(n)) for x in range(w)] for y in range(h)]
    disc = [(dx, dy) for dx in range(-CR, CR + 1) for dy in range(-CR, CR + 1) if dx * dx + dy * dy <= CR * CR + 1]
    g = lambda A, x, y: A[y][x] if 0 <= y < len(A) and 0 <= x < len(A[0]) else False
    Dl = [[any(g(U, x + dx, y + dy) for dx, dy in disc) for x in range(-CR, w + CR)] for y in range(-CR, h + CR)]
    C = [[all(g(Dl, x + CR + dx, y + CR + dy) for dx, dy in disc) for x in range(w)] for y in range(h)]
    im = Image.new("RGBA", (w, h), (0, 0, 0, 0)); p = im.load()
    for y in range(h):
        for x in range(w):
            if C[y][x]: p[x, y] = shade if any(not g(C, x + dx, y + dy) for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1))) else base
    return im
if __name__ == "__main__":
    out = sys.argv[1]
    for name, h in ELEMENTS.items():
        c = rgb(h); base, shade, fill = c + (255,), mix(c, DARK, 0.42), mix(c, DARK, 0.8)
        frame(base, shade, fill).save(f"{out}/frame-{name}.png")
        plate(2, base, shade).save(f"{out}/chain2-{name}.png"); plate(3, base, shade).save(f"{out}/chain3-{name}.png")
