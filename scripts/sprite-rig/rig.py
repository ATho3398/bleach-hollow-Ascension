#!/usr/bin/env python3
"""도트 그림 한 장을 부위(머리·몸통·팔·다리)로 나눠 걷기·공격 프레임을 뽑는 도구.

종이인형(컷아웃) 방식: 리그 파일(rig.json)에 부위 다각형·관절점·앞뒤 순서를 적고,
동작 틀(motions.py)의 각도·이동값대로 부위를 돌리고 옮겨 프레임을 그린다.
회전은 Scale2x 두 번 확대 후 최근접 샘플링(RotSprite 근사)이라 도트 외곽이 덜 깨진다.

사용:
  python3 scripts/sprite-rig/rig.py scripts/sprite-rig/rigs/skin-brute.json
  python3 scripts/sprite-rig/rig.py <rig.json> --motion move,attack --out <폴더> --debug

출력(기획서 26-2 규칙): <out>/<그림 키>/<동작>-<번호>.png, anim.json,
  확인용 <동작>-sheet.png(가로 시트), <동작>-preview.gif, (--debug) rig-debug.png
"""
from __future__ import annotations

import argparse
import json
import math
import os
import sys

import numpy as np
from PIL import Image, ImageDraw

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from motions import MOTIONS  # noqa: E402

ROOT = 'root'
DEBUG_COLORS = [(230, 60, 60), (60, 170, 230), (80, 200, 90), (240, 180, 40),
                (190, 90, 220), (40, 210, 200), (240, 120, 180), (150, 150, 150)]


# ---------- 행렬 ----------
def mat_rot_about(deg: float, px: float, py: float) -> np.ndarray:
    # 화면 좌표(y 아래)에서 양수 각도 = 화면상 반시계
    r = math.radians(-deg)
    c, s = math.cos(r), math.sin(r)
    return np.array([[c, -s, px - c * px + s * py],
                     [s, c, py - s * px - c * py],
                     [0, 0, 1]], dtype=float)


def mat_move(dx: float, dy: float) -> np.ndarray:
    return np.array([[1, 0, dx], [0, 1, dy], [0, 0, 1]], dtype=float)


# ---------- Scale2x (RotSprite 근사용) ----------
def scale2x(a: np.ndarray) -> np.ndarray:
    v = a.view(np.uint32)[..., 0] if a.dtype == np.uint8 else a
    p = np.pad(v, 1, mode='edge')
    E = p[1:-1, 1:-1]
    B, H = p[:-2, 1:-1], p[2:, 1:-1]
    D, F = p[1:-1, :-2], p[1:-1, 2:]
    cond = (B != H) & (D != F)
    e0 = np.where(cond & (D == B), D, E)
    e1 = np.where(cond & (B == F), F, E)
    e2 = np.where(cond & (D == H), D, E)
    e3 = np.where(cond & (H == F), F, E)
    h, w = E.shape
    out = np.empty((h * 2, w * 2), dtype=np.uint32)
    out[0::2, 0::2], out[0::2, 1::2] = e0, e1
    out[1::2, 0::2], out[1::2, 1::2] = e2, e3
    return out


def upscale4(rgba: np.ndarray) -> np.ndarray:
    v = np.ascontiguousarray(rgba).view(np.uint32)[..., 0]
    v = scale2x(scale2x(v))
    return v.view(np.uint8).reshape(v.shape[0], v.shape[1], 4)


def _components(mask: np.ndarray) -> list[list[tuple[int, int]]]:
    """4방향 연결 덩어리 목록."""
    seen = np.zeros_like(mask)
    h, w = mask.shape
    comps = []
    for sy, sx in zip(*np.nonzero(mask)):
        if seen[sy, sx]:
            continue
        stack, comp = [(sy, sx)], []
        seen[sy, sx] = True
        while stack:
            y, x = stack.pop()
            comp.append((y, x))
            for yy, xx in ((y + 1, x), (y - 1, x), (y, x + 1), (y, x - 1)):
                if 0 <= yy < h and 0 <= xx < w and mask[yy, xx] and not seen[yy, xx]:
                    seen[yy, xx] = True
                    stack.append((yy, xx))
        comps.append(comp)
    return comps


# ---------- 리그 ----------
class Rig:
    def __init__(self, path: str):
        with open(path, encoding='utf-8') as f:
            self.cfg = json.load(f)
        base = os.path.dirname(os.path.abspath(path))
        img_path = self.cfg['image']
        if not os.path.isabs(img_path) and not os.path.exists(img_path):
            img_path = os.path.join(base, img_path)
        self.key = self.cfg.get('key') or os.path.splitext(os.path.basename(img_path))[0]
        self.img = np.array(Image.open(img_path).convert('RGBA'))
        self.h, self.w = self.img.shape[:2]
        self.root_pivot = tuple(self.cfg['rootPivot'])
        self.parts = {p['name']: p for p in self.cfg['parts']}
        self.order = [ROOT] + [p['name'] for p in self.cfg['parts']]
        self.z = {ROOT: self.cfg.get('rootZ', 0)}
        for p in self.cfg['parts']:
            self.z[p['name']] = p.get('z', 1)
        self._split()

    def parent(self, name: str) -> str | None:
        if name == ROOT:
            return None
        return self.parts[name].get('parent', ROOT)

    def _split(self):
        opaque = self.img[..., 3] > 0
        taken = np.zeros_like(opaque)
        self.masks: dict[str, np.ndarray] = {}
        # 목록 순서가 우선순위: 먼저 적힌 부위가 겹치는 칸을 가져간다
        for p in self.cfg['parts']:
            m = Image.new('L', (self.w, self.h), 0)
            ImageDraw.Draw(m).polygon([tuple(pt) for pt in p['poly']], fill=255)
            mask = (np.array(m) > 0) & opaque & ~taken
            self.masks[p['name']] = mask
            taken |= mask
        self.masks[ROOT] = opaque & ~taken
        self._clean_islands()
        self.layers = {}
        for n, mask in self.masks.items():
            layer = self.img.copy()
            layer[~mask] = 0
            self.layers[n] = layer
        self._backfill()
        self.big = {n: upscale4(l) for n, l in self.layers.items()}

    def _clean_islands(self):
        """다각형 경계에 걸려 떨어져 나온 작은 조각(외곽선 끄트머리 등)을 가장 많이 맞닿은 부위로 옮긴다.
        그대로 두면 부위가 움직일 때 제자리에 선 조각이 남는다."""
        label = np.full((self.h, self.w), -1, dtype=int)
        names = list(self.masks)
        for i, n in enumerate(names):
            label[self.masks[n]] = i
        for _ in range(3):
            moved = False
            for i, n in enumerate(names):
                comps = _components(label == i)
                if len(comps) <= 1:
                    continue
                comps.sort(key=len, reverse=True)
                for comp in comps[1:]:
                    if len(comp) > len(comps[0]) * 0.25:
                        continue  # 큰 덩어리는 일부러 나눈 것일 수 있다
                    touch = np.zeros(len(names), dtype=int)
                    for y, x in comp:
                        for dy, dx in ((0, 1), (0, -1), (1, 0), (-1, 0)):
                            yy, xx = y + dy, x + dx
                            if 0 <= yy < self.h and 0 <= xx < self.w and label[yy, xx] not in (-1, i):
                                touch[label[yy, xx]] += 1
                    if touch.any():
                        ys, xs = zip(*comp)
                        label[list(ys), list(xs)] = int(touch.argmax())
                        moved = True
            if not moved:
                break
        for i, n in enumerate(names):
            self.masks[n] = label == i

    def _backfill(self):
        """관절 틈 메우기. 부위가 돌면 부모와 사이에 틈이 보이므로, 둘 중 뒤에 있는 쪽 그림을
        앞에 있는 쪽 영역 안으로 backfill 칸만큼 늘려 둔다(평소엔 앞 부위에 가려 안 보인다)."""
        for name, p in self.parts.items():
            r = p.get('backfill', 0)
            par = self.parent(name)
            if not r:
                continue
            lower, upper = (par, name) if self.z[name] > self.z[par] else (name, par)
            layer = self.layers[lower]
            allowed = self.masks[upper]
            filled = layer[..., 3] > 0
            for _ in range(r):
                grow = np.zeros_like(filled)
                src = np.zeros_like(layer)
                for dy, dx in ((0, 1), (0, -1), (1, 0), (-1, 0)):
                    sh = np.roll(np.roll(filled, dy, 0), dx, 1)
                    shc = np.roll(np.roll(layer, dy, 0), dx, 1)
                    new = sh & ~filled & ~grow & allowed
                    src[new] = shc[new]
                    grow |= new
                if not grow.any():
                    break
                layer[grow] = src[grow]
                filled |= grow

    # ---------- 그리기 ----------
    def world(self, name: str, pose: dict, cache: dict) -> np.ndarray:
        if name in cache:
            return cache[name]
        t = pose.get(name, {})
        if name == ROOT:
            px, py = self.root_pivot
            par = np.eye(3)
        else:
            px, py = self.parts[name]['pivot']
            par = self.world(self.parent(name), pose, cache)
        local = mat_move(t.get('dx', 0), t.get('dy', 0)) @ mat_rot_about(t.get('rot', 0), px, py)
        cache[name] = par @ local
        return cache[name]

    def render(self, pose: dict, ground: bool) -> Image.Image:
        cache: dict = {}
        out = Image.new('RGBA', (self.w, self.h), (0, 0, 0, 0))
        for name in sorted(self.order, key=lambda n: self.z[n]):
            if not self.masks[name].any():
                continue
            m = self.world(name, pose, cache)
            inv = np.linalg.inv(m)
            k = np.diag([4.0, 4.0, 1.0]) @ inv  # 4배 확대본에서 샘플
            # PIL 은 출력 칸 중심이 아니라 모서리를 넘기므로 반 칸 보정
            off = k @ np.array([0.5, 0.5, 1.0])
            data = (k[0, 0], k[0, 1], off[0] - 2, k[1, 0], k[1, 1], off[1] - 2)
            big = Image.fromarray(self.big[name], 'RGBA')
            layer = big.transform((self.w, self.h), Image.AFFINE, data, resample=Image.NEAREST)
            out.alpha_composite(layer)
        if ground:
            out = self._lock_ground(out)
        a = np.array(out)[..., 3] > 0
        self.clipped = bool(a[:, 0].any() or a[:, -1].any() or a[0].any())
        return out

    def _bottom(self, a: np.ndarray) -> int:
        rows = np.where((a[..., 3] > 0).any(1))[0]
        return int(rows.max()) if len(rows) else 0

    def _lock_ground(self, im: Image.Image) -> Image.Image:
        # 발바닥 기준선(가장 아래 불투명 줄)을 원본과 같게 맞춘다
        shift = self._bottom(self.img) - self._bottom(np.array(im))
        if shift == 0:
            return im
        out = Image.new('RGBA', im.size, (0, 0, 0, 0))
        out.alpha_composite(im, (0, shift))
        return out

    def debug_image(self) -> Image.Image:
        bg = Image.new('RGBA', (self.w, self.h), (220, 220, 220, 255))
        bg.alpha_composite(Image.fromarray(self.img, 'RGBA'))
        over = np.zeros_like(self.img)
        for i, n in enumerate(self.order):
            c = DEBUG_COLORS[i % len(DEBUG_COLORS)]
            over[self.masks[n]] = (*c, 140)
        bg.alpha_composite(Image.fromarray(over, 'RGBA'))
        bg = bg.resize((self.w * 3, self.h * 3), Image.NEAREST)
        d = ImageDraw.Draw(bg)
        pts = [(ROOT, self.root_pivot)] + [(n, p['pivot']) for n, p in self.parts.items()]
        for i, (n, (x, y)) in enumerate(pts):
            c = DEBUG_COLORS[self.order.index(n) % len(DEBUG_COLORS)]
            d.ellipse([x * 3 - 6, y * 3 - 6, x * 3 + 6, y * 3 + 6], fill=(0, 0, 0), outline=(255, 255, 255))
            d.text((x * 3 + 8, y * 3 - 6), n, fill=(0, 0, 0))
            d.rectangle([4, 4 + i * 14, 14, 14 + i * 14], fill=c)
            d.text((18, 4 + i * 14), n, fill=(0, 0, 0))
        return bg


def save_preview(frames: list[Image.Image], ms: list[int], path: str):
    pv = []
    for f in frames:
        bg = Image.new('RGBA', f.size, (200, 200, 200, 255))
        bg.alpha_composite(f)
        pv.append(bg.convert('P', palette=Image.ADAPTIVE).resize((f.width * 2, f.height * 2), Image.NEAREST))
    pv[0].save(path, save_all=True, append_images=pv[1:], duration=ms, loop=0)


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('rig')
    ap.add_argument('--motion', help='쉼표로 구분 (기본: 리그 파일의 motions, 없으면 move,attack)')
    ap.add_argument('--out', default='scripts/sprite-rig/out')
    ap.add_argument('--debug', action='store_true', help='부위 나눔·관절 확인 그림도 저장')
    args = ap.parse_args()

    rig = Rig(args.rig)
    template = rig.cfg.get('template', 'biped')
    motions = args.motion.split(',') if args.motion else rig.cfg.get('motions', ['move', 'attack'])
    out_dir = os.path.join(args.out, rig.key)
    os.makedirs(out_dir, exist_ok=True)

    if args.debug:
        rig.debug_image().save(os.path.join(out_dir, 'rig-debug.png'))

    anim = {}
    for mname in motions:
        spec = MOTIONS[template][mname]
        # 리그 파일에서 각도 배율을 조절할 수 있다 (큰 몸은 작게, 가는 팔은 크게)
        amp = rig.cfg.get('amp', {}).get(mname, 1.0)
        frames = []
        for pose in spec['frames']:
            scaled = {n: {k: v * amp for k, v in t.items()} for n, t in pose.items()}
            frames.append(rig.render(scaled, spec.get('ground', True)))
            if rig.clipped:
                print(f'  주의: {mname}-{len(frames)} 이 캔버스 가장자리에 닿음(잘렸을 수 있음) — amp 를 줄이거나 그림을 안쪽으로')
        for i, f in enumerate(frames, 1):
            f.save(os.path.join(out_dir, f'{mname}-{i}.png'))
        sheet = Image.new('RGBA', (rig.w * len(frames), rig.h), (0, 0, 0, 0))
        for i, f in enumerate(frames):
            sheet.alpha_composite(f, (i * rig.w, 0))
        sheet.save(os.path.join(out_dir, f'{mname}-sheet.png'))
        ms = spec['ms'] if isinstance(spec['ms'], list) else [spec['ms']] * len(frames)
        save_preview(frames, ms, os.path.join(out_dir, f'{mname}-preview.gif'))
        entry = {'ms': spec['ms']}
        if 'hit' in spec:
            entry['hit'] = spec['hit']
        anim[mname] = entry
        print(f'{rig.key} {mname}: {len(frames)}프레임 → {out_dir}')

    with open(os.path.join(out_dir, 'anim.json'), 'w', encoding='utf-8') as f:
        json.dump(anim, f, ensure_ascii=False, indent=1)


if __name__ == '__main__':
    main()
