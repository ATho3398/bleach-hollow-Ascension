// 이동 방식 = 걷기 하나 (GDD 125장, C.200): 부유·날기 삭제. 진화체 표·종족 설정·그림 manifest 에 이동 방식 값이 없고,
// 화면에는 떠오름(data-loco·떠 있는 높이)·날기 돌진 연출이 없다 — 모든 진화체가 땅에 서서 걷고 발 = 그림자.
import { describe, expect, it } from 'vitest';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { FORM_TABLE } from '../src/data/evolution';
import { FACTIONS } from '../src/data/factions';
import { ART_MANIFEST, charArt } from '../src/data/art/manifest';
import { roomOf } from '../src/engine/faction';
import { lungePlan } from '../src/ui/attackFx';
import { ATTACK_FX } from '../src/ui/attackFxConfig';
import { charTopOffset } from '../src/ui/bha/room';

const read = (p: string) => readFileSync(p, 'utf8');
function srcFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((d) => (d.isDirectory() ? srcFiles(join(dir, d.name)) : /\.(ts|css|json)$/.test(d.name) ? [join(dir, d.name)] : []));
}

describe('모든 진화체 걷기 (GDD 125장)', () => {
  it('진화체 표·종족 설정·그림 manifest 에 이동 방식 값이 없다', () => {
    for (const f of FORM_TABLE) expect('locomotion' in f, f.id).toBe(false);
    expect(read('src/data/evolution/forms.json')).not.toContain('locomotion');
    for (const f of FACTIONS) expect('locomotion' in f, f.id).toBe(false);
    for (const [k, e] of Object.entries(ART_MANIFEST)) expect('locomotion' in e, k).toBe(false);
  });

  it('모든 종족 × 단계 × 진화체의 캐릭터 그림에 이동 방식이 없다 (어느 진화체여도 땅에 서서 걷는다)', () => {
    for (const fac of FACTIONS) {
      const room = roomOf(fac);
      for (let tier = 0; tier < fac.tierNames.length; tier++) {
        const art = charArt(fac.id, tier, room.characterArt, '/');
        expect('locomotion' in art, `${fac.id} ${tier + 1}단계`).toBe(false);
      }
    }
    expect(FORM_TABLE.length).toBeGreaterThan(0);
  });

  it('이동 방식 모듈·부유/날기 연출·?loco= 개발 파라미터가 없다', () => {
    expect(existsSync('src/engine/locomotion.ts')).toBe(false);
    expect(existsSync('src/ui/bha/loco.ts')).toBe(false);
    expect(existsSync('src/ui/bha/loco.css')).toBe(false);
    for (const p of srcFiles('src')) {
      const s = read(p);
      for (const bad of ['data-loco', 'dataset.loco', 'bha-loco-', '--loco-', 'LOCO_LIFT', "get('loco')"]) expect(s.includes(bad), `${p}: ${bad}`).toBe(false);
    }
  });

  it('몸통박치기는 걷기 모양 하나: 세로 이동(떠올랐다 내리꽂기) 없음', () => {
    for (const lv of [ATTACK_FX.basic, ATTACK_FX.chain2]) {
      const t = lungePlan(lv, 1, 100).keyframes.map((k) => String(k.transform));
      expect(t.every((x) => !x.includes('translateY'))).toBe(true);
      expect(t[1]).toContain(`rotate(${(-lv.tiltDeg).toFixed(1)}deg)`);
    }
  });

  it('방 머리 높이(상태 칩·말풍선 자리)는 떠 있는 높이 없이 그림 윗변 그대로', () => {
    // 그림 없음: 몸 상자 윗변 = −(8×2 + 75 + 10)/2 + 8
    expect(charTopOffset({ src: null, frames: null, scale: 1, offsetY: 0 })).toBe(-(16 + 75 + 10) / 2 + 8);
    // 정사각 그림 배율 1: 상자 윗변 + (140 − 130)
    expect(charTopOffset({ src: 'a.png', frames: null, scale: 1, offsetY: 0 })).toBeCloseTo(-(16 + 140 + 10) / 2 + 8 + 10, 5);
  });

  it('전투 내 캐릭터도 발밑 그림자가 보인다 (발 = 그림자 중심, 그림 아래 8%)', () => {
    const css = read('src/ui/bha/battle-scene.css');
    const rule = css.slice(css.indexOf('.bha-hero__shadow {'), css.indexOf('}', css.indexOf('.bha-hero__shadow {')));
    expect(rule).not.toContain('display: none');
    expect(rule).toContain('bottom: 5%; height: 6%'); // 중심 = 5% + 3% = 8%
  });
});

describe('빈사(누운 모습)는 바닥 위에 눕고 발밑 체력 막대와 안 겹친다 (C.200, 마스터 추가)', () => {
  it('lieBox: 몸 가운데 = 그림자, 몸 아래 끝 = 발 높이 위', async () => {
    const { lieBox } = await import('../src/ui/bha/room');
    // 정사각 256 그림, 몸이 가운데 세로로 선 모양(x 108~148, y 40~236), 배율 1
    const r = lieBox({ left: 108, top: 40, right: 148, bottom: 236 }, 256, 256, { scale: 1, offsetY: 0 });
    // 눕히면 오른쪽 끝(148 → 상자 x 75.2)이 축(65) 아래 약 10px → 그만큼(+2) 올린다
    expect(r.up).toBe(12);
    // 머리(위)가 오른쪽으로 가므로 몸 가운데를 그림자 위로 = 왼쪽으로 민다
    expect(r.dx).toBeLessThan(0);
    // 배율이 크면 두께·길이도 그만큼
    const big = lieBox({ left: 108, top: 40, right: 148, bottom: 236 }, 256, 256, { scale: 2, offsetY: 0 });
    expect(big.up).toBeGreaterThan(r.up);
    expect(big.dx).toBeLessThan(r.dx);
  });
  it('room.css: 누운 그림은 발을 축으로 돌고 --lie-dx·--lie-up 만큼 옮긴다', () => {
    const css = read('src/ui/bha/room.css');
    expect(css).toContain('.bha-char.is-collapsed .bha-char__body.has-art { transform-origin: 50% 92.6%; translate: var(--lie-dx, 0px) calc(var(--lie-up, 0px) * -1); }');
  });
});

describe('체력 막대 = 길고 두껍게, 숫자는 막대 안 (GDD 127장 1, C.200)', () => {
  it('meter inside 옵션: 값이 막대(track) 안에 들어가고 막대가 두꺼워진다', () => {
    const dom = read('src/ui/bha/dom.ts');
    expect(dom).toContain("if (o.inside) track.append(valueEl);");
    expect(dom).toContain('if (!o.inside) head.append(valueEl);');
    const css = read('src/ui/bha/components/components.css');
    expect(css).toContain('.bha-meter--inside .bha-meter__track > .bha-meter__value {');
    expect(css).toMatch(/\.bha-meter--inside \.bha-meter__track, \.bha-meter--inside\.bha-meter--thin \.bha-meter__track \{ height: calc\(var\(--bha-bar-h-lg\) \+ var\(--bha-sp-2\)\); \}/);
  });
  it('방 발밑·걷기·온천 체력 막대가 inside, 방 막대는 140px', () => {
    expect(read('src/ui/roomView.ts')).toMatch(/kind: 'player', label: '체력'[^\n]*inside: true/);
    expect(read('src/ui/expeditionView.ts')).toMatch(/kind: 'player', label: '체력'[^\n]*inside: true/);
    expect(read('src/ui/spaView.ts')).toMatch(/kind: 'player', label: '체력'[^\n]*inside: true/);
    expect(read('src/ui/bha/room.css')).toContain('width: 140px;');
  });
  it('전투 체력 막대도 숫자를 막대 안에', () => {
    const css = read('src/ui/bha/v2/bha.css');
    expect(css).toContain('.bha-root .bha-v2hp>.bha-num{position:absolute;inset:0;');
    expect(read('src/ui/battleView.ts')).toContain("v2Gauge(kind, 100, { width: '184px', label });");
  });
});
