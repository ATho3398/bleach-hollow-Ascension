// C.443 (GDD v6.052 12-4): 아이젠 붕옥 감응도(최소 20·전투 시작 20) · 붕옥 블록(허 공식 × 0.5 · +10 · 100이면 안 나옴) ·
// 붕옥 융합(30 이상 언제든 · 30 밑이면 풀림 · 귀도·프라고르만 · 회피 0 · 되살아나기 없음 · 영창 스택 없음 · 프라고르 1블록마다 −5).
import { describe, expect, it } from 'vitest';
import { BALANCE } from '../src/config/balance';
import { getEnemy } from '../src/data/enemies';
import {
  applyInput, buildBattleRecord, canLiberate, createCombat, drainCombatEvents, kitBlockOf, kitRiskOf, KIT_TRAIT_PREFIX, liberationActive, spawnTableOf, step, voidChanceOf,
  type CombatParams, type CombatState,
} from '../src/engine/combat';
import { buildCombatParams } from '../src/engine/absorb/build';
import { applyEvolutionToParams } from '../src/engine/evolution';
import { kitRiskGaugeNameOf } from '../src/engine/transcendKit';
import { testGrantTranscendent } from '../src/engine/testMode';
import { advance, createExpedition, finishBattle, startBattle } from '../src/engine/expedition/expedition';
import { newSaveData, type SaveData } from '../src/game';
import { useImmediateHits } from './helpers/hitDelay';

useImmediateHits();

const K = BALANCE.provisional.transcendentKits.aizen!;
const RR = K.riskRelease!;
const normal = getEnemy('test-a');
const DECK = ['prey-nest-a', 'prey-nest-a', 'elite-den-a', 'env-fog', 'rest-a', 'prey-nest-b', 'env-ruin', 'elite-den-b'];
const id = (b: string) => KIT_TRAIT_PREFIX + b;

function aizenSave(): SaveData {
  const s = newSaveData('hollow', 1000);
  expect(testGrantTranscendent(s, 'aizen', 2000)).toBe('added');
  return s;
}
function aizenParams(): Partial<CombatParams> {
  const s = aizenSave();
  const p: Partial<CombatParams> = { ...buildCombatParams(s.build, s.factionId) };
  applyEvolutionToParams(p, s.evolution, s.factionId, 0, false);
  return p;
}
/** 조용한 전투 (생성·공격 멈춤). risk 를 주면 게이지를 그 값으로 */
const mk = (risk?: number): CombatState => {
  const s = createCombat(1, { enemy: normal, params: aizenParams() });
  s.spawnTimer = 1e9;
  s.enemy.attackTimer = 1e9;
  s.enemy.actionTimer = 1e9;
  s.player.attackTimer = 1e9;
  s.params.timeLimitSeconds = 1e9;
  if (risk !== undefined) s.kit!.risk = risk;
  return s;
};
const blk = (s: CombatState, b: string) => ({ uid: s.nextUid++, kind: 'skill' as const, traitId: id(b), family: null, element: null, ...(kitBlockOf(s.params, id(b))?.solo ? { solo: true } : {}) });
const ids = (s: CombatState) => s.tray.map((b) => b.traitId);

describe('수치·데이터 (provisional)', () => {
  it('감응도 시작 20·최소 20·융합 30 · 붕옥 블록 허 ×0.5·+10 · 프라고르 −3/블록(C.445) · 이름', () => {
    expect(RR).toEqual({ floor: 20, minRisk: 30 }); // C.444: 전투 전용 start 삭제
    expect(K.blocks.hogyoku).toMatchObject({ voidSlot: { voidScale: 0.5, riskGain: 10 } });
    expect(K.blocks.fragor).toMatchObject({ riskCost: 3, weight: 0.35, tiers: [2.4, 3.6, 5.0] });
    const p = aizenParams();
    expect(p.kit?.liberationName).toBe('붕옥 융합');
    expect(p.kit?.riskRelease).toEqual({ floor: 20, minRisk: 30, limit: BALANCE.provisional.risk.limit });
    expect(p.kit?.releaseBare).toBe(true);
    expect(kitRiskGaugeNameOf('aizen')).toBe('붕옥 감응도');
  });
  it('전투 시작 감응도 = 20', () => {
    expect(kitRiskOf(mk())).toBe(20);
  });
});

describe('붕옥 블록', () => {
  it('출현표: 융합 전 = 경화수월·귀도·붕옥(허 블록 대신, 확률 = 허 공식 × 0.5), 허 블록 없음', () => {
    const s = mk();
    const t = spawnTableOf(s.params, false, 20);
    expect(t.entries.some((e) => e.kind === 'void')).toBe(false);
    expect(t.entries.map((e) => e.source?.id)).toEqual([id('kyoka'), id('kido'), id('hogyoku')]);
    const hg = t.entries.find((e) => e.source?.id === id('hogyoku'))!;
    expect(voidChanceOf(s.params)).toBeGreaterThan(0);
    expect(hg.chance).toBeCloseTo(voidChanceOf(s.params) * 0.5, 9);
    expect(t.entries.reduce((a, e) => a + e.chance, 0)).toBeCloseTo(1, 9);
    // 허 공식 가산(컨디션·환경 등)도 그대로 받는다
    expect(spawnTableOf({ ...s.params, voidChanceBonus: 0.2 }, false, 20).entries.find((e) => e.source?.id === id('hogyoku'))!.chance).toBeCloseTo(voidChanceOf({ ...s.params, voidChanceBonus: 0.2 }) * 0.5, 9);
  });
  it('감응도 100이면 붕옥 블록이 안 나온다', () => {
    const s = mk();
    const t = spawnTableOf(s.params, false, 100);
    expect(t.entries.map((e) => e.source?.id)).toEqual([id('kyoka'), id('kido')]);
    expect(t.entries.reduce((a, e) => a + e.chance, 0)).toBeCloseTo(1, 9);
    // 실제 생성도: 100 에서 오래 돌려도 붕옥 0개
    const r = mk(100);
    r.params.voidChanceBonus = 0.48; // 허 공식 상한 근처 (붕옥 몫 ≈ 25%)
    r.spawnTimer = 1;
    let seen = 0;
    for (let i = 0; i < 3000; i++) {
      step(r);
      seen += r.tray.filter((b) => b.traitId === id('hogyoku')).length;
      r.tray = [];
    }
    expect(seen).toBe(0);
  });
  it('쓰면 패널티 없이 감응도 +10 (경직·원정 리스크 없음), 최대 100', () => {
    const s = mk();
    s.tray = [blk(s, 'hogyoku')];
    expect(applyInput(s, { type: 'use', cell: 0 })).toBe(true);
    expect(kitRiskOf(s)).toBe(30);
    expect(s.stunTicks ?? 0).toBe(0);
    expect(s.riskGained).toBe(0);
    expect(drainCombatEvents(s).find((e) => e.kind === 'kit-risk')).toMatchObject({ spent: -10, risk: 30 });
    s.kit!.risk = 95;
    s.tray = [blk(s, 'hogyoku')];
    applyInput(s, { type: 'use', cell: 0 });
    expect(kitRiskOf(s)).toBe(100);
  });
});

describe('붕옥 융합', () => {
  it('감응도 30 이상이면 언제든(29면 불가), 붕옥 블록 하나로 20 → 30 이 되면 가능', () => {
    expect(canLiberate(mk(29))).toBe(false);
    expect(canLiberate(mk(30))).toBe(true);
    const s = mk();
    expect(canLiberate(s)).toBe(false);
    s.tray = [blk(s, 'hogyoku')];
    applyInput(s, { type: 'use', cell: 0 });
    expect(canLiberate(s)).toBe(true);
  });
  it('융합: 지속 시간 없음 · 붕옥 → 프라고르 · 경화수월 → 귀도 · 출현표 = 귀도·프라고르만(몫 0.9 : 0.35)', () => {
    const s = mk(30);
    s.tray = [blk(s, 'kyoka'), blk(s, 'hogyoku'), blk(s, 'kido')];
    const atk0 = s.player.stats.atk;
    expect(applyInput(s, { type: 'liberate' })).toBe(true);
    expect(ids(s).slice(0, 3)).toEqual([id('kido'), id('fragor'), id('kido')]);
    expect(ids(s).slice(3).every((x) => x === id('kido') || x === id('fragor'))).toBe(true); // 융합 순간 지급 블록도 귀도·프라고르만
    expect(s.player.stats.atk).toBeCloseTo(atk0 * s.params.liberationStatMultiplier, 6);
    const t = spawnTableOf(s.params, true, 30);
    expect(t.entries.map((e) => e.source?.id)).toEqual([id('kido'), id('fragor')]);
    expect(t.entries[1]!.chance).toBeCloseTo(0.35 / 1.25, 9);
    for (let i = 0; i < 600; i++) step(s);
    expect(liberationActive(s)).toBe(true);
    expect(kitRiskOf(s)).toBe(30);
  });
  it('융합 중 실제 생성 = 귀도·프라고르만', () => {
    const s = mk(100);
    applyInput(s, { type: 'liberate' });
    s.params.voidChanceBonus = 0.48;
    s.spawnTimer = 1;
    const seen = new Set<string>();
    for (let i = 0; i < 2000; i++) {
      step(s);
      for (const b of s.tray) seen.add(b.traitId ?? b.kind);
      s.tray = [];
    }
    expect([...seen].sort()).toEqual([id('fragor'), id('kido')].sort());
  });
  it('프라고르 1블록마다 −3 (3체인 = −9, C.445), 귀도는 안 깎임', () => {
    const s = mk(100);
    applyInput(s, { type: 'liberate' });
    s.tray = [blk(s, 'kido'), blk(s, 'kido'), blk(s, 'kido')];
    applyInput(s, { type: 'use', cell: 0 });
    expect(kitRiskOf(s)).toBe(100);
    s.tray = [blk(s, 'fragor')];
    drainCombatEvents(s);
    applyInput(s, { type: 'use', cell: 0 });
    expect(kitRiskOf(s)).toBe(97);
    expect(drainCombatEvents(s).find((e) => e.kind === 'kit-risk')).toMatchObject({ spent: 3, risk: 97 });
    s.tray = [blk(s, 'fragor'), blk(s, 'fragor'), blk(s, 'fragor')];
    drainCombatEvents(s);
    applyInput(s, { type: 'use', cell: 0 });
    const ev = drainCombatEvents(s).find((e) => e.kind === 'block');
    expect(ev && ev.kind === 'block' && ev.kitName).toBe('울트라 프라고르');
    expect(kitRiskOf(s)).toBe(88);
    expect(s.kit!.riskSpent).toBe(12);
  });
  it('30 밑으로 떨어지면 풀림 (프라고르 → 붕옥, 귀도는 그대로) · 최소 20 밑으로 안 감 · 런 로그', () => {
    const s = mk(32);
    applyInput(s, { type: 'liberate' });
    s.kit!.risk = 22; // 융합 뒤 22 로 (C.445: −3 이라 32 에서 3체인 −9 = 23 → 하한 확인용)
    s.tray = [blk(s, 'fragor'), blk(s, 'fragor'), blk(s, 'fragor'), blk(s, 'kido'), blk(s, 'fragor')];
    drainCombatEvents(s);
    applyInput(s, { type: 'use', cell: 0 }); // 3체인 −9 → 13 이 아니라 최소 20 (C.445: 32 → 22 시작)
    expect(kitRiskOf(s)).toBe(20);
    expect(liberationActive(s)).toBe(false);
    expect(drainCombatEvents(s).find((e) => e.kind === 'liberation-end')).toMatchObject({ endless: true, risk: 0 });
    expect(ids(s)).toEqual([id('kido'), id('hogyoku')]);
    expect(s.kit!.modeExits).toBe(1);
    expect(s.kit!.riskSpent).toBe(2);
    expect(canLiberate(s)).toBe(false);
    s.status = 'won';
    const rec = buildBattleRecord(s, { factionId: 'hollow', runId: 1, lap: 1, tierIndex: 0 });
    expect(rec.kit).toMatchObject({ id: 'aizen', modeEnters: 1, modeExits: 1, riskSpent: 2 });
  });
  it('30 에서 프라고르 한 번 = 27 → 풀림', () => {
    const s = mk(30);
    applyInput(s, { type: 'liberate' });
    s.tray = [blk(s, 'fragor')];
    applyInput(s, { type: 'use', cell: 0 });
    expect(kitRiskOf(s)).toBe(27);
    expect(liberationActive(s)).toBe(false);
  });
  it('융합 중 회피 0 (융합 전엔 회피)', () => {
    const s = mk(30);
    s.params.evadeChance = 1;
    s.enemy.attackTimer = 1;
    const hp0 = s.player.hp;
    step(s);
    expect(s.player.hp).toBe(hp0); // 피함
    applyInput(s, { type: 'liberate' });
    const hp1 = s.player.hp;
    s.enemy.attackTimer = 1;
    step(s);
    expect(s.player.hp).toBeLessThan(hp1);
  });
  it('융합 중 되살아나기 없음', () => {
    const s = mk(30);
    applyInput(s, { type: 'liberate' });
    s.params.evadeChance = 0;
    s.player.hp = 1;
    s.enemy.attackTimer = 1;
    step(s);
    expect(s.status).toBe('lost');
    expect(s.kit!.revives).toBe(0);
  });
  it('영창 스택: 융합하면 0 · 융합 중 귀도 3체인은 쌓이지 않고 흑관 없음(오룡전멸까지)', () => {
    const s = mk(100);
    s.kit!.stack = 4;
    applyInput(s, { type: 'liberate' });
    expect(s.kit!.stack).toBe(0);
    s.tray = [blk(s, 'kido'), blk(s, 'kido'), blk(s, 'kido')];
    drainCombatEvents(s);
    applyInput(s, { type: 'use', cell: 0 });
    expect(s.kit!.stack).toBe(0);
    s.kit!.stack = 5; // 가득이어도
    s.tray = [blk(s, 'kido'), blk(s, 'kido'), blk(s, 'kido')];
    drainCombatEvents(s);
    applyInput(s, { type: 'use', cell: 0 });
    const ev = drainCombatEvents(s).find((e) => e.kind === 'block');
    expect(ev && ev.kind === 'block' && ev.kitName).toBe('오룡전멸');
    expect(s.kit!.finishers).toBe(0);
  });
});

// '원정: 감응도는 전투마다 따로'(전투 시작 20·원정 리스크와 따로)는 C.444(GDD v6.054)에서 뒤집혔다 → tests/c444.test.ts

// ── 할 일 B: 초월자 인간형 스킨 (GDD 12-4 v6.052 '초월자 인간형 스킨') ──
import { charArt } from '../src/data/art/manifest';
import { transcendentSkinLookId, transcendentSkinOfLook, validModelLook } from '../src/data/skins';
import { characterSkinEntries, modelLookOptions } from '../src/data/skins/lookOptions';
import { TRANSCENDENTS } from '../src/data/transcendents';
import { artSkinOf, equipSkin, loadSave, writeSave } from '../src/game';

describe('초월자 인간형 스킨 — 태초 현현 · Unknown 디버깅', () => {
  const HYEON = transcendentSkinLookId('zero-sage', 'manifest');
  const DEBUG = transcendentSkinLookId('rift-wanderer', 'debug');
  const look = (skin: string | null) => charArt('hollow', 2, 'char.hollow', '/', undefined, undefined, skin, undefined, 'male');
  it('데이터: 태초 = 현현, Unknown;03398 = 디버깅 (그림 키 + 자리 표시 키), 나머지 초월자는 없음', () => {
    expect(TRANSCENDENTS.filter((t) => t.humanSkins).map((t) => [t.id, t.humanSkins!.map((x) => x.name)])).toEqual([['zero-sage', ['현현']], ['rift-wanderer', ['디버깅']]]);
    expect(transcendentSkinOfLook(HYEON)?.skin).toMatchObject({ art: 'char.transcendent-zero-sage-human', placeholder: 'char.shinigami' });
    expect(transcendentSkinOfLook(DEBUG)?.skin).toMatchObject({ art: 'char.transcendent-rift-wanderer-human', placeholder: 'char.hollow.5' });
    expect(validModelLook('hollow', HYEON)).toBe(true);
    expect(validModelLook('shinigami', DEBUG)).toBe(true);
    expect(validModelLook('hollow', 'trskin:zero-sage:nope')).toBe(false);
  });
  it('그림 대기: 자리 표시 = 기존 인간형 종이인형(사신 기본형·아란칼 기본형), 기본 모델(구슬·조각)은 그대로', () => {
    expect(look(HYEON).src).toMatch(/shinigami-base/);
    expect(look(HYEON).rig?.look).toBe('shinigami-base');
    expect(look(DEBUG).rig?.look).toBe('arrancar-base');
    expect(look('transcendent:zero-sage').src).toMatch(/char-transcendent-zero-sage/);
    expect(look('transcendent:rift-wanderer').src).toMatch(/#mosaic=rift-wanderer/);
    const opts = modelLookOptions('hollow', { test: true, owned: [], dex: [] });
    expect(opts.filter((o) => o.id.startsWith('trskin:')).map((o) => [o.label, o.waiting])).toEqual([['현현', true], ['디버깅', true]]);
  });
  it('가방 > 스킨 > 진화체 > 초월자: 그 초월자를 얻으면 열림 (테스트 모드 = 전부)', () => {
    const none = characterSkinEntries('hollow', { test: false, owned: [], dex: [] });
    expect(none.some((e) => e.key.startsWith('trskin:'))).toBe(false);
    const got = characterSkinEntries('hollow', { test: false, owned: [], dex: ['zero-sage'] }).filter((e) => e.sub === 'transcendent');
    expect(got.map((e) => [e.name, e.cls, e.waiting])).toEqual([['태초', 'form', undefined], ['현현', 'form', true]]);
    const all = characterSkinEntries('shinigami', { test: true, owned: [], dex: [] }).filter((e) => e.sub === 'transcendent').map((e) => e.name);
    expect(all).toEqual(['아이젠', '태초', '현현', 'Unknown;03398', '디버깅']); // C.450
  });
  it('입기: 얻은 초월자만(테스트 모드는 전부), 초월자 트랙에서도 스킨 그림 · 저장·읽기 유지', () => {
    const s = newSaveData('hollow', 1000);
    expect(equipSkin(s, HYEON)).toBe(false);
    expect(equipSkin(s, HYEON, { test: true })).toBe(true);
    s.skin = null;
    expect(testGrantTranscendent(s, 'rift-wanderer', 2000)).toBe('added');
    expect(artSkinOf(s)).toBe('mosaic:rift-wanderer');
    expect(equipSkin(s, DEBUG)).toBe(true);
    expect(artSkinOf(s)).toBe(DEBUG);
    const m = new Map<string, string>();
    const st = { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) };
    writeSave(st, s);
    expect(loadSave(st)!.skin).toBe(DEBUG);
  });
});
