// C.508 (점검 1119 게임 버그): ① 진화 [진화]/[미루기]를 묻는 중 표시를 세이브에 (형식 94) — 고르기 전에 껐다 켜도 방에서 다시 묻는다(공짜 미루기 막음)
import { describe, expect, it } from 'vitest';
import { newBuild, gainTrait } from '../src/engine/absorb/build';
import { stepsNeeded } from '../src/engine/evolution';
import { createExpedition, type ExpeditionState } from '../src/engine/expedition';
import { setForm } from '../src/engine/testMode';
import { grantRecoverFood } from '../src/recoverTutorial';
import { BALANCE } from '../src/config/balance';
import { readFileSync } from 'node:fs';
import { getEnemy } from '../src/data/enemies';
import { getForm } from '../src/data/evolution';
import { evoParamsOf } from '../src/engine/evolution';
import { applyInput, createCombat, drainCombatEvents, evoSpecialOffReason, statusMarksOf, ticksOf, type CombatParams, type CombatState } from '../src/engine/combat';
import { evoUniqueLines } from '../src/ui/evolutionPanel';
import { choosePet } from '../src/inventory';
import {
  performRevive,
  deferEvolution, evolveAfterReturn, loadSave, migrateSave, newSaveData, pendingEvolveChoice, recordExpedition,
  SAVE_FORMAT_VERSION, SAVE_MIGRATIONS, MIN_LOADABLE_SAVE_FORMAT, type SaveData,
} from '../src/game';

function grown(nowMs = 1_000): SaveData {
  const s = newSaveData('hollow', nowMs);
  for (const k of Object.keys(s.help.guides)) s.help.guides[k as keyof typeof s.help.guides] = 'done';
  s.build = newBuild();
  for (let i = 0; i < 4; i++) s.build.slots.push(null);
  gainTrait(s.build, 't-water-a');
  const e = s.evolution;
  e.tierIndex = 2;
  e.formHistory = ['t2:base', 't3:water'];
  e.formId = 't3:water';
  e.steps = stepsNeeded(e)!;
  return s;
}

function ended(s: SaveData): ExpeditionState {
  const exp = createExpedition({ factionId: s.factionId, seed: 7, hunger: 33, condition: 71, deck: [], build: s.build, evolution: s.evolution });
  Object.assign(exp, { phase: 'ended', outcome: 'returned', endReason: 'returned', lapsCompleted: 1, runId: 42 });
  return exp;
}

/** 저장 → 다시 읽기 (껐다 켬) */
function reload(s: SaveData): SaveData {
  const m = new Map<string, string>();
  const store = { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k) };
  m.set('k', JSON.stringify(s));
  return loadSave(store as never, 'k')!;
}

describe('C1 진화 묻는 중 표시 (GDD 8-5)', () => {
  it('귀환 정산이 묻는 중 표시를 남기고, 껐다 켜도 남아 있다 (그 원정 몸 상태·runId)', () => {
    const s = grown();
    expect(recordExpedition(s, ended(s), 2_000, { holdEvolution: true })).toBeNull();
    expect(s.evolution.choice).toEqual({ hunger: 33, condition: 71, runId: 42 });
    const r = reload(s);
    expect(pendingEvolveChoice(r)).toEqual({ hunger: 33, condition: 71, runId: 42 });
    expect(r.evolution.deferrals).toBe(0);
  });
  it('[미루기] = 표시 지움 · 미루기 1회(그 원정 runId) → 다시 켜도 묻지 않는다', () => {
    const s = reload((() => { const x = grown(); recordExpedition(x, ended(x), 2_000, { holdEvolution: true }); return x; })());
    const rec = deferEvolution(s, 3_000, pendingEvolveChoice(s)!.runId);
    expect(rec?.runId).toBe(42);
    expect(s.evolution.deferrals).toBe(1);
    expect(pendingEvolveChoice(reload(s))).toBeNull();
  });
  it('[진화] = 표시 지움 · 진화', () => {
    const s = reload((() => { const x = grown(); recordExpedition(x, ended(x), 2_000, { holdEvolution: true }); return x; })());
    const r = evolveAfterReturn(s, pendingEvolveChoice(s)!);
    expect(r.ok).toBe(true);
    expect(s.evolution.tierIndex).toBe(3);
    expect(s.evolution.choice).toBeUndefined();
    expect(pendingEvolveChoice(reload(s))).toBeNull();
  });
  it('튜토리얼(창 없이 바로 진화)·바로 진화(holdEvolution 없음)는 표시를 남기지 않는다', () => {
    const s = grown();
    recordExpedition(s, ended(s), 2_000);
    expect(s.evolution.choice).toBeUndefined();
  });
  it('진화 기준에서 벗어난 옛 표시·이상한 값은 지운다', () => {
    const s = grown();
    s.evolution.choice = { hunger: 1, condition: 2, runId: 3 };
    s.evolution.steps = 0;
    expect(pendingEvolveChoice(s)).toBeNull();
    expect(s.evolution.choice).toBeUndefined();
    const t = grown();
    (t.evolution as unknown as Record<string, unknown>).choice = { hunger: 'x' };
    expect(reload(t).evolution.choice).toBeUndefined();
  });
  it('형식 94 · 93 → 94 변환(묻는 중 아님) · 문턱 87 그대로', () => {
    expect(SAVE_FORMAT_VERSION).toBe(96);
    expect(typeof SAVE_MIGRATIONS[93]).toBe('function');
    expect(MIN_LOADABLE_SAVE_FORMAT).toBe(87);
    const s = grown();
    s.meta.format = 93;
    const m = migrateSave(JSON.parse(JSON.stringify(s)))!;
    expect(m.meta.format).toBe(96);
    expect(m.evolution.choice).toBeUndefined();
    expect(m.evolution.tierIndex).toBe(2);
  });
  it('화면: 방에 들어올 때 묻다 만 창을 다시 띄운다 (app.ts toRoom → resumeEvolveChoice)', async () => {
    const src = (await import('node:fs')).readFileSync('src/ui/app.ts', 'utf8');
    expect(src).toMatch(/const toRoom = \(\) => \{\s*resumeEvolveChoice\(\);/);
  });
});

describe('C3 테스트 [진화체 → 이 몸으로] = 4단계 한 줄 특성 따라감 (GDD 8-7 1차)', () => {
  it('공화(사신 h4:void) → evo:obliteration · 나다(호로 h4:void) 도 · 다른 진화체로 바꾸면 이전 특성은 빠지고 새 것', () => {
    const s = newSaveData('shinigami', 1);
    expect(setForm(s, 'h4:void', 1)).toBe(true);
    expect(s.evolution.abilities?.owned).toHaveProperty('evo:obliteration');
    expect(s.evolution.abilities?.equipped).toContain('evo:obliteration');
    expect(setForm(s, 't4:normal:physical', 1)).toBe(true); // 백련 = 공속 +10%
    expect(Object.keys(s.evolution.abilities!.owned).filter((k) => k.startsWith('evo:'))).toEqual(['evo:aspd10']);
    expect(setForm(s, null, 1)).toBe(true);
    expect(Object.keys(s.evolution.abilities!.owned).some((k) => k.startsWith('evo:'))).toBe(false);
    const h = newSaveData('hollow', 1);
    setForm(h, 'h4:void', 1);
    expect(h.evolution.abilities?.owned).toHaveProperty('evo:obliteration');
  });
  it('evo: 가 아닌 특성(따로 고른 것)은 그대로', () => {
    const s = newSaveData('shinigami', 1);
    s.evolution.abilities!.owned['el:water'] = 1;
    setForm(s, 'h4:void', 1);
    expect(s.evolution.abilities!.owned['el:water']).toBe(1);
  });
});

describe('B2 진화체가 바뀌어 펫 칸이 줄면 2번째 펫은 보유 목록으로', () => {
  const hunter = (): SaveData => {
    const s = newSaveData('shinigami', 1);
    s.evolution.formId = 'h4:hunter';
    s.evolution.tierIndex = 3;
    s.shared.unlocks.pet = 0;
    s.shared.pets.owned = { 'pet-gold': { laps: 0, gotAt: 1 }, 'pet-belly': { laps: 0, gotAt: 1 } } as SaveData['shared']['pets']['owned'];
    choosePet(s, 'pet-gold', 1);
    choosePet(s, 'pet-belly', 1);
    expect(s.shared.pets.active2).toBe('pet-belly');
    return s;
  };
  it('부활(퇴화) → active2 비움 + 런 로그 leave', () => {
    const s = hunter();
    s.nest.dead = true;
    expect(performRevive(s, 5).ok).toBe(true);
    expect(s.shared.pets.active2).toBeNull();
    expect(s.shared.pets.owned['pet-belly']).toBeTruthy();
    expect(s.runLog.pets.at(-1)).toMatchObject({ kind: 'leave', petId: 'pet-belly', at: 5 });
  });
  it('테스트 모델 바꾸기(setForm) → active2 비움', () => {
    const s = hunter();
    setForm(s, 't4:fire:physical', 7);
    expect(s.shared.pets.active2).toBeNull();
    expect(s.runLog.pets.at(-1)).toMatchObject({ kind: 'leave', petId: 'pet-belly', at: 7 });
  });
});

describe('C5 첫 끼니는 한 번만 · C6 먹이 줄 종류 기억', () => {
  const TF = BALANCE.provisional.tutorialRecover.food as keyof SaveData['shared']['food'];
  it('먹이 카드가 다시 떠도(껐다 켬) 첫 끼니는 1개 — 먹인 뒤 0', () => {
    const s = newSaveData('hollow', 1);
    s.shared.food[TF] = 0;
    grantRecoverFood(s);
    expect(s.shared.food[TF]).toBe(1);
    const r = reload(s);
    grantRecoverFood(r); // 카드 다시 뜸
    expect(r.shared.food[TF]).toBe(1);
    r.shared.food[TF] -= 1; // 먹임
    expect(r.shared.food[TF]).toBe(0);
  });
  it('먹이 줄: 첫 끼니 종류 강제는 안내(회복 안내 먹이) 동안만 — 방은 회복 안내가 남았을 때만 켠다', () => {
    const dock = readFileSync('src/ui/bha/dock.ts', 'utf8');
    expect(dock).toContain('o.guideFoodActive?.() && o.foodCount(guideFood) > 0');
    const room = readFileSync('src/ui/roomView.ts', 'utf8');
    expect(room).toContain("guideFoodActive: () => guidePending(save.help, 'recover')");
  });
});

const STILL: Partial<CombatParams> = { critChance: 0, blockCritChance: 0, enemyCritChance: 0, enemyDamageVariance: 0, voidChance: 0, enemyPassive: true, enemyImmortal: true };
const fight = (formId: string, extra: Partial<CombatParams> = {}, enemy = 'test-a'): CombatState =>
  createCombat(7, { enemy: getEnemy(enemy), params: { ...STILL, evo: evoParamsOf(getForm(formId), 'shinigami')!, ...extra } });

describe('B4 해방 지속 예외의 전투 기록 = 실제 초', () => {
  it('주홍장 만해: liberate 사건 seconds = 실제 지속(ticksLeft) — 기본 해방 초가 아니다', () => {
    const s = fight('t4:blood:physical', { playerElements: ['blood'], liberationUnique: true, enemyPassive: false });
    drainCombatEvents(s);
    s.liberation.gauge = 100;
    expect(applyInput(s, { type: 'liberate' })).toBeTruthy();
    const ev = drainCombatEvents(s).find((e) => e.kind === 'liberate') as { seconds: number } | undefined;
    expect(ev).toBeDefined();
    expect(ticksOf(s.params, ev!.seconds)).toBe(s.liberation.ticksLeft);
    expect(ev!.seconds).not.toBe(s.params.liberationSeconds);
  });
});

describe('C7 진화체 스택 네모 설명 = 이름·단위·효과', () => {
  it('봉수대 봉화: "봉화 3/5개 — 일반 공격 피해 +18%" 처럼 (칸 숫자는 그대로)', () => {
    const s = fight('t4:fire:physical', { playerElements: ['fire'] });
    s.evo!.stacks.beacon = { n: 3 } as never;
    const m = statusMarksOf(s, 'shinigami').find((x) => x.key === 'evo-s-beacon')!;
    expect(m.value).toBe('3');
    expect(m.title).toMatch(/^봉화 3\/\d+개/);
    const p = statusMarksOf(s, 'shinigami').find((x) => x.key === 'evo-passive');
    if (p) expect(p.title).toMatch(/%/);
  });
});

describe('C8 공화 공허 블록: 글자 = 데이터(공) · 꺼진 이유 안내', () => {
  it('블록 처형선 0 → line0, 안내 문구(데이터 offNote)가 상태 화면 특수 블록 줄에도', () => {
    const s = fight('h4:void');
    const b = s.tray.find((x) => x.traitId?.startsWith('evo:'));
    expect(b).toBeDefined();
    expect(evoSpecialOffReason(s, b)).toBe('line0');
    const lines = evoUniqueLines('h4:void', 'shinigami', '만해');
    // 옛 기대값 '공허 2개부터 켜진다' → 사용자 11-21 "용어는 허무로 가자" (C.517): 공화 스택 표시 이름 '허무'
    expect(lines.find((l) => l.label === '특수 블록')!.text).toMatch(/허무 2개부터 켜진다/);
    expect(lines.find((l) => l.label === '특수 블록')!.text).not.toMatch(/\{/);
  });
  it('허무 2개(블록 처형선 > 0) + 적 체력 선 위 → above, 강적 → elite', () => {
    const s = fight('h4:void');
    s.evo!.stacks.hollow = { n: 2 } as never;
    const b = s.tray.find((x) => x.traitId?.startsWith('evo:'));
    expect(evoSpecialOffReason(s, b)).toBe('above');
    const e = fight('h4:void', {}, 'test-elite');
    e.evo!.stacks.hollow = { n: 2 } as never;
    expect(evoSpecialOffReason(e, e.tray.find((x) => x.traitId?.startsWith('evo:')))).toBe('elite');
  });
  it('화면: 꺼진 특수 블록은 글자를 \'봉\'으로 바꾸지 않는다(봉인만) · 데이터 글자 = 허(허무 블록, C.516)', () => {
    const v = readFileSync('src/ui/battleView.ts', 'utf8');
    expect(v).toContain('setV2Locked(node, locked, !sealedNow)');
    const j = readFileSync('src/data/evolution/uniques.json', 'utf8');
    // GDD 8-8 v6.154 (사용자 2026-11-21 "용어는 허무로 가자"): 공화 특수 블록 = '허무 블록'·글자 '허' — 옛 기대 = '공허 블록'·'공'
    // C.522 GDD v6.168 (사용자 2026-11-23 "아직도 허무=폭주로 돼있는거 같은거 싹 다 수정"): 공화 특수 블록 = '낙화 블록'·글자 '낙' — 옛 기대 = '허무 블록'·'허'
    expect(j).toMatch(/"name": \{ "\*": "낙화 블록" \}, "short": "낙"/);
  });
});

describe('C9 그림 없는 초월자 빈 자리 · C10 첫 포식 카드 자리 · 진화 창 바탕', () => {
  it('방 상태창 자리: 빈 자리(점선 칸) 윗변을 머리 윗변으로 친다', () => {
    const v = readFileSync('src/ui/roomView.ts', 'utf8');
    expect(v).toContain("const emptyBox = char.querySelector<HTMLElement>('.bha-char__body.is-empty');");
    expect(v).toMatch(/if \(emptyBox\) \{[\s\S]*?drawnTop = er\.top;/);
  });
  it('첫 포식 6/6 카드: 갈래 버튼·설명 칸·적 카드는 절대 가리지 않는다(keepClear → 보호 영역)', async () => {
    const { GUIDES } = await import('../src/data/help');
    const sc = GUIDES['first-absorb'].find((x) => x.id === 'practice')!;
    expect(sc.keepClear).toEqual(['@.bha-absorb__actions', '@.bha-absorb__desc', '@.bha-foecard']);
    expect(readFileSync('src/ui/tutorialOverlay.ts', 'utf8')).toContain('...(SCENES[state.index]?.keepClear ?? [])');
  });
  it('진화 [진화]/[미루기] 창 바탕은 떠오르는 동안에도 불투명(토큰 bg-1, 투명도 연출 없음)', () => {
    const css = readFileSync('src/ui/bha/room.css', 'utf8');
    expect(css).toContain('.bha-evolve-choice .bha-modal { background: var(--bha-bg-1); animation-name: bha-rise-solid; }');
    expect(css).toMatch(/@keyframes bha-rise-solid \{ from \{ transform: [^}]*\} \}/);
    expect(css.match(/@keyframes bha-rise-solid[^\n]*/)![0]).not.toContain('opacity');
  });
});
