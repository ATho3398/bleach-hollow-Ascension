// C.461 (GDD 15-6 v6.089): 만해 오라 = 해방이 열린 동안 몸 뒤 pixelfx 시트(속성 색, 몸 키 비례, 발 = 기준점). 해방 중엔 데이터 키 active(C.473 부터 null = 오라 없음)
import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { getEnemy } from '../src/data/enemies';
import { applyInput, canLiberate, createCombat, LIBERATION_GAUGE_MAX, liberationActive, type CombatState } from '../src/engine/combat';
import {
  BANKAI_AURA, bankaiAuraBox, bankaiAuraElement, bankaiAuraPhase, bankaiAuraSheetName, bodyHeightFrac, bodyWidthFrac, FEET_FROM_TOP, framePercent,
} from '../src/ui/bha/bankaiAura';
import type { PixelFxSheet } from '../src/ui/bha/pixelFx';
import { flameOrigin, LIVE_FLAMES, LiveFlameSim } from '../src/ui/bha/liveFlame';
import { RIG_ACTIONS } from '../src/ui/bha/rigAnim';
import { ART_MANIFEST } from '../src/data/art/manifest';

const src = (p: string) => readFileSync(p, 'utf8');
const sheet = (name: string) => JSON.parse(src(`public/fx/${name}.json`)) as PixelFxSheet;
const quiet = (s: CombatState) => {
  s.spawnTimer = 1e9;
  s.enemy.attackTimer = s.player.attackTimer = s.enemy.actionTimer = 1e9;
  s.enemy.hp = s.enemy.maxHp = 1e12;
  return s;
};
/** 전투 화면이 매 갱신마다 하는 판정 그대로: 단계 = (해방 켬, 해방 가능, 해방 중) */
const phaseOf = (s: CombatState) => bankaiAuraPhase(s.params.liberationEnabled, canLiberate(s), liberationActive(s));

describe('켜는 때 (사용자 "해방 열렸을 때 켜는거지")', () => {
  it('게이지가 덜 찼으면 꺼짐 → 가득(해방 가능) = ready → 해방 중 = active → 끝나면 꺼짐', () => {
    const s = quiet(createCombat(1, { enemy: getEnemy('test-a'), params: { liberationEnabled: true } }));
    s.liberation.gauge = LIBERATION_GAUGE_MAX - 1;
    expect(canLiberate(s)).toBe(false);
    expect(phaseOf(s)).toBe('off');
    s.liberation.gauge = LIBERATION_GAUGE_MAX;
    expect(phaseOf(s)).toBe('ready');
    expect(applyInput(s, { type: 'liberate' })).toBe(true);
    expect(phaseOf(s)).toBe('active');
    s.liberation.ticksLeft = 0;
    s.liberation.endless = false;
    expect(liberationActive(s)).toBe(false);
    expect(phaseOf(s)).toBe('off');
  });
  it('해방을 못 쓰는 전투(liberationEnabled false)는 게이지가 차도 꺼짐', () => {
    const s = quiet(createCombat(1, { enemy: getEnemy('test-a'), params: { liberationEnabled: false } }));
    s.liberation.gauge = LIBERATION_GAUGE_MAX;
    expect(phaseOf(s)).toBe('off');
    expect(bankaiAuraPhase(false, true, true)).toBe('off');
  });
});

describe('시트·색', () => {
  it('속성 8색 시트가 다 있고 같은 규격(16프레임 83ms 반복, 152×210, 기준점 76·197)', () => {
    expect(BANKAI_AURA.elements).toHaveLength(8);
    for (const e of BANKAI_AURA.elements) {
      const name = bankaiAuraSheetName('ready', e)!;
      expect(existsSync(`public/fx/${name}.png`)).toBe(true);
      const sh = sheet(name);
      expect(sh.frame).toEqual([152, 210]);
      expect(sh.pivot).toEqual([76, 197]);
      expect(sh.frames).toBe(16);
      expect(sh.loop).toBe(true);
      expect(sh.durations.every((d) => d === 83)).toBe(true);
    }
  });
  it('색 = 내 속성, 속성이 없거나 시트가 없는 속성이면 normal', () => {
    expect(bankaiAuraSheetName('ready', 'fire')).toBe('custom-bankai-aura-fire');
    expect(bankaiAuraSheetName('ready', null)).toBe('custom-bankai-aura-normal');
    expect(bankaiAuraElement('없는속성')).toBe('normal');
    expect(bankaiAuraSheetName('off', 'fire')).toBeNull();
  });
  it('해방 중엔 만해 오라 없음 (C.473, GDD 15-6 v6.102 — 사용자 "해방한 다음엔 해방오라 쓰지 말라니까"): active = null, 사용자가 이펙트를 주면 그 키만 바꿔 끼운다', () => {
    expect(BANKAI_AURA.active).toBeNull();
    for (const el of [...BANKAI_AURA.elements, null]) expect(bankaiAuraSheetName('active', el)).toBeNull();
    const swapped = { ...BANKAI_AURA, active: 'custom/other-aura' };
    expect(bankaiAuraSheetName('active', 'water', swapped)).toBe('custom-other-aura-water');
    expect(bankaiAuraSheetName('ready', 'water', swapped)).toBe('custom-bankai-aura-water');
  });
});

describe('크기·자리 (몸 키 비례, 발 = 기준점)', () => {
  const sh = sheet('custom-bankai-aura-normal');
  it('몸 키 = (발 − 머리 윗변) × 배율, 못 읽으면 대체값', () => {
    expect(bodyHeightFrac(0.52, 2)).toBeCloseTo((FEET_FROM_TOP - 0.52) * 2);
    expect(bodyHeightFrac(null, 2)).toBe(BANKAI_AURA.fallbackBodyFrac);
    expect(bodyHeightFrac(0.95, 2)).toBe(BANKAI_AURA.fallbackBodyFrac);
  });
  it('시트 1픽셀 = 몸 키 / bodyUnits — 몸이 두 배면 오라도 두 배, 기준점이 발 자리(칸 아래 8%)', () => {
    const a = bankaiAuraBox(sh, 0.8);
    const b = bankaiAuraBox(sh, 1.6);
    expect(b.height / a.height).toBeCloseTo(2);
    expect(a.height).toBeCloseTo((210 / BANKAI_AURA.bodyUnits) * 0.8);
    for (const x of [a, b]) {
      const pivotFromBottom = x.bottom + (13 / 210) * x.height; // 시트 아래 끝 → 기준점 y 197
      expect(pivotFromBottom).toBeCloseTo(1 - FEET_FROM_TOP);
      expect(x.left + x.width / 2).toBeCloseTo(0.5); // 기준점 x 76 = 가운데
    }
    const dy = bankaiAuraBox(sh, 0.8, 4); // 그림 세로 보정 4% 아래 → 발도 4% 아래
    expect(dy.bottom).toBeCloseTo(a.bottom - 0.04);
  });
  it('넓은 몸(덩치·짐승형)은 너비에 맞춰 키운다 — 너비가 bodyWidthUnits 비율 아래인 몸(사람형)은 키만', () => {
    const tall = bankaiAuraBox(sh, 0.7, 0, BANKAI_AURA, 0.5); // 사람형: 너비 0.5 < 키 0.7 × 100/110
    expect(tall.height).toBeCloseTo(bankaiAuraBox(sh, 0.7).height);
    const wide = bankaiAuraBox(sh, 0.5, 0, BANKAI_AURA, 0.8); // 덩치: 너비가 키보다 크다
    expect(wide.height).toBeCloseTo((210 / BANKAI_AURA.bodyWidthUnits) * 0.8);
    expect(wide.height).toBeGreaterThan(bankaiAuraBox(sh, 0.5).height);
    expect(bodyWidthFrac(0.4, 2)).toBeCloseTo(0.8);
    expect(bodyWidthFrac(null, 2)).toBe(0);
  });
  it('프레임 배경 위치(%) — 5칸 × 4줄 시트', () => {
    expect(framePercent(0, 5, 4)).toEqual([0, 0]);
    expect(framePercent(4, 5, 4)).toEqual([100, 0]);
    expect(framePercent(15, 5, 4)).toEqual([0, 100]);
    expect(framePercent(7, 5, 4)[1]).toBeCloseTo(100 / 3);
  });
});

describe('전투 화면 연결 (종족·몸 분기 없음)', () => {
  const view = src('src/ui/battleView.ts');
  const mod = src('src/ui/bha/bankaiAura.ts');
  it('매 갱신마다 (해방 켬, 해방 가능, 해방 중) 으로 단계를 넣는다 — 몸 상자 맨 앞(몸 뒤), 색 = 내 첫 속성', () => {
    expect(view).toMatch(/bankaiAura\?\.set\(bankaiAuraPhase\(libOn, ready, libActive\)\)/);
    expect(view).toMatch(/mountBankaiAura\(hero\.body\.parentElement, heroArt, auraEl/);
    expect(mod).toMatch(/lift\.prepend\(el\)/);
  });
  it('코드에 종족·초월자 id 분기가 없다', () => {
    expect(mod).not.toMatch(/hollow|shinigami|ichigo|aizen|faction/);
  });
  it('옛 CSS 발밑 기운(.bha-libaura)은 삭제 — 시트를 받기 전에 먼저 보이던 임시 그래픽 (C.473). 시트는 전투 시작 때 미리 받는다', () => {
    expect(src('src/ui/bha/battle-scene.css')).not.toMatch(/\.bha-libaura/);
    expect(view).not.toMatch(/libAuraEl/);
    expect(mod).toMatch(/void loadPixelFx\(readyName\)/);
  });
});

describe('무월 실시간 불꽃 (도트 세션 live.py → canvas)', () => {
  const d = LIVE_FLAMES.mugetsu!;
  it('데이터 = 작업본 emitters.json 37곳 그대로, 무월 그림 layers.live 로 연결', () => {
    const work = JSON.parse(src('docs/art-samples/mugetsu-flame/emitters.json')) as { x: number; y: number }[];
    expect(d.emitters).toHaveLength(work.length);
    expect(d.emitters.map((e) => [e.x, e.y])).toEqual(work.map((e) => [e.x, e.y]));
    expect(ART_MANIFEST['char.transcendent-ichigo-mugetsu']?.rig).toBe('ichigo-mugetsu'); // C.465: 무월 = 종이인형 + 인형 불꽃 층(rigEffects). 이 계산은 그림 목록 layers.live 가 있는 그림만
    expect(d.armBehind).toBe(true); // 불꽃 팔 = 작업본에 잡아 둔 자리·순서 그대로(몸 뒤, 사용자 2026-11-16)
  });
  it('제자리에서 불이 나고, 밑단(몸 그림 101줄) 아래 다리 칸엔 불이 없다 — 자르지 않고 자리·모양으로 (칼끝은 105줄까지 내려감)', () => {
    const sim = new LiveFlameSim(d);
    const W = 200, H = 140, ox = 80, oy = 20;
    for (let f = 1; f <= 60; f++) sim.emit(f, ox, oy);
    const g = sim.render(60, ox, oy, W, H);
    expect(g.some((v) => v === 2)).toBe(true);
    expect(g.some((v) => v === 1)).toBe(true);
    for (let f = 61; f <= 120; f++) {
      sim.emit(f, ox, oy);
      const gf = sim.render(f, ox, oy, W, H);
      for (let y = oy + 102; y < H; y++) for (let x = ox; x < ox + 56; x++) expect(gf[y * W + x]).toBe(0);
    }
    expect(src('src/ui/bha/liveFlame.ts')).not.toMatch(/hemRow/); // 밑단 자르기 삭제 (작업본 bd6869a)
  });
  it('돌진하면 지나온 자리에 불이 남는다(끌림), 칼날 불은 지금 칼 자리에 붙는다', () => {
    const still = new LiveFlameSim(d);
    const moved = new LiveFlameSim(d);
    const W = 300, H = 140, oy = 20;
    for (let f = 1; f <= 40; f++) { still.emit(f, 200, oy); moved.emit(f, f <= 30 ? 200 : 200 - (f - 30) * 9, oy); }
    const a = still.render(40, 200, oy, W, H);
    const b = moved.render(40, 110, oy, W, H);
    const inkX = (g: Uint8Array) => { let m = 0; for (let i = 0; i < g.length; i++) if (g[i]) m = Math.max(m, i % W); return m; };
    expect(inkX(b)).toBeGreaterThan(110 + 56 + 10); // 몸이 떠난 오른쪽(옛 자리)에 불이 남음
    // 칼날 불(팔 끝 쪽)은 몸을 따라온다: 지금 몸 기준 팔 자리에 잉크
    const [ax, ay] = d.arm[1]!; // 팔 가운데 마디 (굵기 2칸 안팎)
    const near = (g: Uint8Array, cx: number, cy: number) => { for (let y = cy - 3; y <= cy + 3; y++) for (let x = cx - 3; x <= cx + 3; x++) if (g[y * W + x]) return true; return false; };
    expect(near(a, 200 + ax, oy + ay)).toBe(true);
    expect(near(b, 110 + ax, oy + ay)).toBe(true);
  });
  it('칼 잔상: 제자리엔 없고, 프레임당 0.8칸보다 빨리 움직이면 지나온 자리에 짧게 남는다', () => {
    const W = 300, H = 140, oy = 20;
    const still = new LiveFlameSim(d);
    const dash = new LiveFlameSim(d);
    for (let f = 1; f <= 40; f++) { still.emit(f, 150, oy); dash.emit(f, f <= 36 ? 150 : 150 - (f - 36) * 6, oy); }
    expect(dash.count).toBeGreaterThan(still.count);
    const g = dash.render(40, 126, oy, W, H);
    const [ax, ay] = d.arm[1]!;
    let trail = false;
    for (let x = 126 + ax + 6; x <= 150 + ax; x++) if (g[(oy + ay) * W + x]) trail = true; // 옛 칼 자리 쪽
    expect(trail).toBe(true);
  });
  it('몸 그림 자리(격자) = 그림 칸 반전 + 배율 + 돌진', () => {
    const base = { W: 144, H: 144, unit: 1, gridRight: 144, gridTop: 0, dashX: 0, dashY: 0 };
    // 배율 1·돌진 0: 반전 격자에서 몸 그림 x 0 = 칸 x 44 → 격자 오른쪽 끝(144)에서 144−(72+28)=44, y = 25
    expect(flameOrigin(d, base)[0]).toBeCloseTo(d.body[0]);
    expect(flameOrigin(d, base)[1]).toBeCloseTo(d.body[1]);
    const [x0] = flameOrigin(d, base);
    const [x1] = flameOrigin(d, { ...base, dashX: -20 }); // 왼쪽으로 20px 돌진 → 반전 격자에선 +20
    expect(x1 - x0).toBeCloseTo(20);
    const [, y2] = flameOrigin(d, { ...base, unit: 2, W: 144, H: 144 });
    expect(y2).toBeCloseTo((0.92 * 144 + (d.body[1] - 0.92 * d.cell) * 2) / 2);
  });
  it('전투: 무월 중에만 켜고 몸 뒤 PNG 를 숨긴다, 동작 줄이기면 PNG 그대로', () => {
    const view = src('src/ui/battleView.ts');
    expect(view).toMatch(/liveFlame\.set\(secondShown\)/); // C.473: 전투가 끝나면 그 몸 그대로
    expect(view).toMatch(/!prefersReducedMotion\(\)\s*\n?\s*\? mountLiveFlame/);
    expect(src('src/ui/bha/battle-scene.css')).toMatch(/has-liveflame \.bha-hero__altback \{ visibility: hidden; \}/);
  });
  it('몸 뒤 PNG 16장 = 작업본 최신(발 불 없음·칼날 불 붙음) 을 칸 (0,15) 에 놓은 것', () => {
    for (let i = 1; i <= 16; i++) expect(existsSync(`public/art/char-transcendent-ichigo-mugetsu/back-${i}.png`)).toBe(true);
  });
});

describe('해방 순간 해방1 동작 (종이인형 미연결 → 연결)', () => {
  it('RIG_ACTIONS.release = 해방1, 컷인(해방 이름)은 종이인형 몸에서도 그대로', () => {
    expect(RIG_ACTIONS.release).toEqual(['release1']);
    expect(src('src/ui/battleView.ts')).toMatch(/play\('release', \{ onEnd: \(\) => heroAnim\.stop\(\) \}\) \|\| heroArt\.rig\) replayOnce\(libCut/);
  });
});
