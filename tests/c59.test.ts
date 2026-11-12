// C.59 (S-15, GDD 22-3): 투트랙·붕옥·합체·초월체 6종 — 세이브 형식 23(트랙 2 + 공유 + 붕옥 + 초월체 도감 + 슬롯 런 로그)
import { describe, expect, it } from 'vitest';
import { BALANCE } from '../src/config/balance';
import { FACTIONS } from '../src/data/factions';
import { FORM_TABLE } from '../src/data/evolution';
import { TRANSCENDENTS, parseTranscendent } from '../src/data/transcendents';
import { TITLES } from '../src/data/titles';
import { applyEvolutionToParams, currentStats } from '../src/engine/evolution';
import { createExpedition, restoreExpedition, serializeExpedition } from '../src/engine/expedition';
import { conditionMet, decideTranscendent, slotStatBonus, type FusionInput } from '../src/engine/transcend';
import { RANK_HOLDERS } from '../src/data/ranks';
import {
  activeTrackOf, allTracks, checkTrackOpen, developHogyoku, fusionGate, fusionPreview, loadSave, migrateSave, newSaveData, performFusion, SAVE_FORMAT_VERSION,
  statBonusOf, switchTrack, TRACK_KEYS, trackIsTopRank, writeSave, type SaveData, type TrackKey,
} from '../src/game';
import { fusionBlockText, fusionFinalText, fusionLists } from '../src/ui/hogyokuView';
import { useLegacyMigrations } from './helpers/legacyGate';
import { clearStory } from './helpers/storyClear';

useLegacyMigrations(); // 옛 형식 마이그레이션 시험 (C.120, GDD 61장)

const HX = BALANCE.provisional.hogyoku;
const other = (fid: string) => FACTIONS.find((f) => f.id !== fid)!.id;

/** 트랙을 5단계로 (진화체·속성 지정 가능) */
/** 마지막 단계(C.220: 4단계 바스트로데/수석 대원)로 */
function toTier5(t: Pick<SaveData, TrackKey>, formId = 't4:fire:physical'): void {
  const e = t.evolution;
  e.tierIndex = 3;
  e.formHistory = ['t2:base', 't3:fire', formId];
  e.formId = formId;
  e.ev = { hp: 20, atk: 20, int: 0, def: 0, spr: 0, spd: 0 };
}

/** 플레이어를 No.1 로 */
function makeTop(t: Pick<SaveData, TrackKey>): void {
  t.rank.ladder = ['player', ...t.rank.ladder.filter((x) => x !== 'player')];
  t.rank.history.everRanked = true;
}

/** 5단계·기록·자원이 쌓인 형식 22 세이브 원문 (옛 구조 그대로) */
function oldFormat22(): Record<string, unknown> {
  const s = newSaveData('hollow', 5000);
  // 형식 22 = 옛 5단계 트리 (형식 57 이 4단계로 옮긴다)
  Object.assign(s.evolution, { tierIndex: 4, formHistory: ['t2:base', 't3:base', 't4:fire', 't5:fire:physical'], formId: 't5:fire:physical', ev: { hp: 20, atk: 20, int: 0, def: 0, spr: 0, spd: 0 } });
  delete (s.evolution as { abilities?: unknown }).abilities;
  s.formDex = [...s.evolution.formHistory];
  s.shared.soulCrystals = 42;
  s.shared.jade = 9;
  s.shared.tradeCoins = 130;
  s.shared.food.snack = 4;
  s.rebirth = { count: 1, carry: { hp: 2, atk: 2, int: 0, def: 0, spr: 0, spd: 0 } };
  s.training.completed = true;
  s.training.tickets = 2;
  s.nest.hunger = 33;
  s.skin = null;
  s.tiles.collection['prey-nest-a'] = 7;
  s.tiles.unlocked = true; // C.394 (GDD 241-0): 타일을 이미 쓰던 슬롯 — 불러올 때 시작 타일을 다시 주지 않는다
  s.shared.pets.gifted = true; // 옛 첫 진화 선물을 이미 받은 슬롯 — 펫 해금 선물을 다시 주지 않는다
  s.story = { hollow: { cleared: { 'ch1/ep1': { firstAt: 10, clears: 2 } }, chapters: [] } };
  delete (s as unknown as Record<string, unknown>).difficulty; // 형식 29(C.75) 필드 — 형식 22 세이브에는 없다
  s.bossDex = { 'sand-maw': { kills: 1, firstAt: 20 } };
  s.runLog.runs.push({ runId: 1 } as never);
  s.runLog.tiers.evolutions.push({ fromTier: 3, toTier: 4, fromFormId: 't4:fire', toFormId: 't5:fire:physical', formId: 't5:fire:physical', snapshot: {} as never, at: 4000 });
  makeTop(s);
  const raw = JSON.parse(JSON.stringify(s)) as Record<string, unknown>;
  for (const k of ['otherTracks', 'trackNotice', 'hogyoku', 'transcendentDex', 'slotLog']) delete raw[k];
  (raw.meta as { format: number }).format = 22;
  return raw;
}

function memStorage(): { getItem(k: string): string | null; setItem(k: string, v: string): void } {
  const m = new Map<string, string>();
  return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => void m.set(k, v) };
}

/** 붕옥 개발을 10단계까지 (재료를 넉넉히 채워 한 단계씩) */
function developAll(s: SaveData): void {
  s.shared.soulCrystals += 1000;
  s.shared.hogyokuShards += 1000;
  s.shared.resonanceEssence += 1000;
  while (developHogyoku(s, 3500)) { /* 10단계까지 */ }
  s.shared.soulCrystals = 0;
  s.shared.hogyokuShards = 0;
  s.shared.resonanceEssence = 0;
}

/** 두 트랙 모두 5단계·1위, 두 종족 스토리 클리어(공명)·붕옥 개발 100% 인 세이브 (GDD 244장) */
function fusionReady(forms: [string, string] = ['t4:fire:physical', 't4:water:special']): SaveData {
  const s = newSaveData('hollow', 1000);
  toTier5(s, forms[0]);
  clearStory(s); // 스토리 전부 클리어 → 붕옥 등장 + 두 번째 트랙 (GDD 243장 1)
  checkTrackOpen(s, 2000);
  toTier5(s.otherTracks[0]!, forms[1]);
  for (const t of allTracks(s)) makeTop(t);
  clearStory(s, other('hollow')); // 다른 종족 스토리도 전부 → 공명 (GDD 244장 2)
  checkTrackOpen(s, 3000);
  developAll(s);
  return s;
}

describe('세이브 형식 23 마이그레이션 (트랙 1개짜리, 데이터 손실 0)', () => {
  it('형식 22 세이브의 모든 값이 그대로 남고, 새 필드만 붙는다', () => {
    expect(SAVE_FORMAT_VERSION).toBeGreaterThanOrEqual(23);
    const raw = oldFormat22();
    const before = JSON.parse(JSON.stringify(raw)) as Record<string, unknown>;
    const m = migrateSave(raw)!;
    expect(m.meta.format).toBe(SAVE_FORMAT_VERSION);
    // 옛 값은 하나도 빠지지 않는다 (C.60 형식 24 가 shared·runLog 에 새 키를 붙이는 것만 허용)
    for (const [k, v] of Object.entries(before)) {
      if (k === 'meta') continue;
      if (['evolution', 'formDex', 'runLog'].includes(k)) continue; // C.220 형식 57: 5단계 → 4단계 진화 상태·진화체 id 를 옮긴다 (saveTier4.test.ts)
      const got = (m as unknown as Record<string, unknown>)[k];
      if (k === 'nest') delete (v as Record<string, unknown>).lastMealAt; // C.406: 쇠약 시계는 옮길 때 '지금'으로 다시 센다 (형식 76)
      if (typeof v === 'object' && v !== null && !Array.isArray(v)) expect(got, k).toMatchObject(v);
      else expect(got, k).toEqual(v);
    }
    expect(m.meta.startPatch).toBe((before.meta as { startPatch: string }).startPatch);
    expect(m.otherTracks).toEqual([]);
    expect(m.hogyoku).toEqual({ tabOpen: false, tabNotice: false, appearedAt: null, level: 0, developed: 0, resonance: false, resonatedAt: null });
    expect(m.transcendentDex).toEqual([]);
    expect(m.slotLog).toEqual({ fusions: [], trackOpens: [], identities: [], hogyokuDev: [], hogyokuMaterials: [] }); // C.326 이름·성별 기록 · C.414 붕옥 개발·재료
  });

  it('이미 마지막 단계인 옛 세이브도 스토리를 다 깨지 않았으면 다른 종족 트랙이 열리지 않는다 (GDD 243장 1). 원래 트랙은 그대로', () => {
    const st = memStorage();
    st.setItem('k', JSON.stringify(oldFormat22()));
    const s = loadSave(st, 'k')!;
    expect(s.factionId).toBe('hollow');
    expect(s.evolution.tierIndex).toBe(3); // C.220: 옛 5단계 → 4단계
    expect(s.otherTracks).toEqual([]);
    expect(s.trackNotice).toBeNull();
    expect(s.slotLog.trackOpens).toHaveLength(0);
    expect(s.hogyoku.tabOpen).toBe(false);
  });

  it('저장 → 불러오기 왕복에 쉬는 트랙·붕옥·초월체 도감이 그대로', () => {
    const s = fusionReady();
    performFusion(s, 9000);
    const st = memStorage();
    writeSave(st, s, 'k');
    const back = loadSave(st, 'k')!;
    expect(back.otherTracks).toEqual(s.otherTracks);
    expect(back.hogyoku).toEqual(s.hogyoku);
    expect(back.transcendentDex).toEqual(s.transcendentDex);
    expect(back.slotLog).toEqual(s.slotLog);
  });

  it('깨진 쉬는 트랙·같은 종족 트랙·모르는 초월체는 버린다', () => {
    const s = newSaveData('hollow', 1);
    const raw = JSON.parse(JSON.stringify(s)) as SaveData;
    raw.otherTracks = [{ factionId: 'hollow' } as never, { factionId: 'nope' } as never, { junk: 1 } as never];
    raw.transcendentDex = [{ id: 'aizen', at: 1, fusionIndex: 1 }, { id: 'aizen', at: 2, fusionIndex: 2 }, { id: 'zzz', at: 1, fusionIndex: 1 }];
    const m = migrateSave(raw)!;
    expect(m.otherTracks).toEqual([]);
    expect(m.transcendentDex.map((x) => x.id)).toEqual(['aizen']);
  });
});

describe('투트랙 개방·전환 (GDD 22-3)', () => {
  it('스토리를 전부 깨기 전에는(마지막 단계여도) 열리지 않고, 깨면 종족 데이터 순서에서 아직 없는 종족이 열린다 (두 종족 모두, GDD 243장 1)', () => {
    for (const f of FACTIONS) {
      const s = newSaveData(f.id, 1);
      s.evolution.tierIndex = 3;
      expect(checkTrackOpen(s, 2)).toBeNull();
      clearStory(s);
      expect(checkTrackOpen(s, 3)).toBe(other(f.id));
      expect(checkTrackOpen(s, 4)).toBeNull(); // 트랙 칸이 다 찼다
      expect(allTracks(s)).toHaveLength(BALANCE.provisional.twoTrack.maxTracks);
    }
  });

  it('종족 목록은 데이터에서 읽는다: 세 번째 종족이 있어도 하드코딩 없이 그 순서대로', () => {
    const s = newSaveData('shinigami', 1);
    clearStory(s);
    expect(checkTrackOpen(s, 2, [{ id: 'shinigami' }, { id: 'quincy' }, { id: 'hollow' }])).toBe('quincy');
  });

  it('전환은 트랙 필드를 맞바꾸고 공유 자원은 그대로, 쉬는 동안 허기가 오른다', () => {
    const s = newSaveData('hollow', 0);
    toTier5(s);
    clearStory(s);
    checkTrackOpen(s, 0);
    s.shared.soulCrystals = 11;
    const hollowEvo = JSON.stringify(s.evolution);
    const sh0 = s.otherTracks[0]!.nest.hunger;
    expect(switchTrack(s, 'hollow', 10)).toBe(false); // 지금 트랙
    expect(switchTrack(s, other('hollow'), 2 * 3_600_000)).toBe(true);
    expect(s.factionId).toBe(other('hollow'));
    expect(s.evolution.tierIndex).toBe(0);
    expect(s.nest.hunger).toBeGreaterThan(sh0);
    expect(s.shared.soulCrystals).toBe(11);
    expect(s.otherTracks.map((t) => t.factionId)).toEqual(['hollow']);
    expect(JSON.stringify(s.otherTracks[0]!.evolution)).toBe(hollowEvo);
    expect(switchTrack(s, 'hollow', 2 * 3_600_000)).toBe(true);
    expect(JSON.stringify(s.evolution)).toBe(hollowEvo);
    for (const k of TRACK_KEYS) expect(activeTrackOf(s)[k]).toBe(s[k]);
  });

  it('원정 중간 저장은 트랙마다 따로 남는다', () => {
    const s = newSaveData('hollow', 0);
    toTier5(s);
    clearStory(s);
    checkTrackOpen(s, 0);
    s.activeExpedition = { version: 6 } as never;
    switchTrack(s, other('hollow'), 1);
    expect(s.activeExpedition).toBeNull();
    expect(s.otherTracks[0]!.activeExpedition).toEqual({ version: 6 });
  });
});

describe('붕옥 (탭·해방·보너스)', () => {
  it('스토리를 전부 깨면 붕옥 등장(탭·등장 컷)과 두 번째 트랙이 같은 순간 한 번 (GDD 243장 1, 영구)', () => {
    const s = newSaveData('hollow', 0);
    toTier5(s);
    checkTrackOpen(s, 0);
    expect(s.hogyoku.tabOpen).toBe(false);
    expect(s.otherTracks).toHaveLength(0);
    clearStory(s);
    checkTrackOpen(s, 1);
    expect(s.hogyoku.tabOpen).toBe(true);
    expect(s.hogyoku.tabNotice).toBe(true);
    expect(s.hogyoku.appearedAt).toBe(1);
    expect(s.help.guides['hogyoku-appear']).toBe('pending');
    expect(s.otherTracks).toHaveLength(1);
    checkTrackOpen(s, 2); // 두 번째: 아무것도 바뀌지 않는다
    expect(s.hogyoku.appearedAt).toBe(1);
    expect(s.otherTracks).toHaveLength(1);
  });

  it('붕옥 개발 10단계 + 공명 → 두 캐릭터 전 능력치 +10%, 개발 기록은 런 로그에 (GDD 244장 4·6)', () => {
    const s = fusionReady();
    expect(s.hogyoku.level).toBe(HX.maxLevel);
    expect(s.hogyoku.developed).toBe(HX.maxLevel);
    expect(s.hogyoku.resonance).toBe(true);
    expect(statBonusOf(s).total).toBeCloseTo(0.1);
    expect(s.slotLog.hogyokuDev.map((r) => r.level)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    const t = newSaveData('hollow', 0);
    t.shared.soulCrystals = 999;
    expect(developHogyoku(t)).toBeNull(); // 붕옥이 아직 없다
  });

  it('보너스는 능력치·전투 파라미터·원정에 곱해지고(999 상한), 초월체 1종 +2% 최대 12%', () => {
    expect(slotStatBonus(0, 0).total).toBe(0);
    expect(slotStatBonus(5, 3).total).toBeCloseTo(0.11);
    expect(slotStatBonus(0, 9).transcendents).toBeCloseTo(0.12);
    const s = newSaveData('hollow', 0);
    toTier5(s);
    const base = currentStats(s.evolution, 'hollow');
    const up = currentStats(s.evolution, 'hollow', 0.17);
    expect(up.atk).toBe(Math.min(999, Math.round(base.atk * 1.17)));
    const p: Record<string, unknown> = {};
    applyEvolutionToParams(p, s.evolution, 'hollow', 0.05);
    expect((p.playerStats as { atk: number }).atk).toBe(Math.round(base.atk * 1.05));
    const exp = createExpedition({ factionId: 'hollow', seed: 1, hunger: 0, condition: 100, deck: [], evolution: s.evolution, statBonus: 0.05 });
    expect(exp.statBonus).toBe(0.05);
    const snap = serializeExpedition(exp, 1)!;
    expect(restoreExpedition(JSON.parse(JSON.stringify(snap))).ok).toBe(true);
    delete (snap.exp as { statBonus?: number }).statBonus; // 옛 원정 중간 저장
    expect(restoreExpedition(snap).ok).toBe(true);
  });
});

describe('합체 (GDD 22-3)', () => {
  it('막힌 이유: 1위가 아니면·게이지가 덜 차면·원정 중이면 못 한다', () => {
    const s = fusionReady();
    expect(fusionGate(s).ok).toBe(true);
    s.otherTracks[0]!.rank.ladder = [...RANK_HOLDERS.map((h) => h.id), 'player'];
    expect(trackIsTopRank(s.otherTracks[0]!)).toBe(false);
    expect(fusionGate(s).missing).toEqual(['rank']);
    makeTop(s.otherTracks[0]!);
    s.hogyoku.level = 9;
    s.activeExpedition = {} as never;
    expect(fusionGate(s).missing).toEqual(['develop', 'expedition']);
    expect(performFusion(s).ok).toBe(false);
    for (const b of ['tab', 'resonance', 'tracks', 'develop', 'rank', 'expedition', 'complete'] as const) expect(fusionBlockText(b)).toMatch(/\./);
  });

  it('두 캐릭터는 사라지고 같은 종족의 새 두 트랙이 1단계 완전 초기, 슬롯 자원·도감·칭호·해방은 남는다', () => {
    const s = fusionReady();
    s.shared.soulCrystals = 25;
    s.shared.tradeCoins = 77;
    s.formDex = ['t4:fire:physical'];
    s.rebirth.count = 2;
    s.titles.push({ titleId: 'rank-1', at: 1, trigger: 'rank', snapshot: {} as never, seen: true });
    const pv = fusionPreview(s);
    const r = performFusion(s, 9000);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.def.id).toBe(pv.def!.id);
    expect(s.factionId).toBe('hollow');
    expect(s.otherTracks.map((t) => t.factionId)).toEqual([other('hollow')]);
    for (const t of allTracks(s)) {
      expect(t.evolution.tierIndex).toBe(0);
      expect(t.evolution.ev).toEqual({ hp: 0, atk: 0, int: 0, def: 0, spr: 0, spd: 0 });
      expect(t.build.owned).toEqual([]);
      expect(t.rank.history.everRanked).toBe(false);
      expect(t.training.completed).toBe(false);
      expect(t.rebirth).toEqual({ count: 0, carry: { hp: 0, atk: 0, int: 0, def: 0, spr: 0, spd: 0 } });
      expect(t.runLog.runs).toEqual([]);
    }
    expect(s.evolution.stageSeed).not.toBe(s.otherTracks[0]!.evolution.stageSeed);
    expect(s.shared.soulCrystals).toBe(25);
    expect(s.shared.tradeCoins).toBe(77);
    expect(s.formDex).toEqual(['t4:fire:physical']);
    expect(s.titles.some((t) => t.titleId === 'rank-1')).toBe(true);
    expect(s.hogyoku.level).toBe(HX.halfLevel); // 6~10단계 진행만 0 (GDD 244장 5)
    expect(s.hogyoku.developed).toBe(HX.maxLevel); // 오른 능력치는 그대로
    expect(s.hogyoku.resonance).toBe(true);
    expect(s.hogyoku.tabOpen).toBe(true);
    expect(s.transcendentDex).toEqual([{ id: r.def.id, at: 9000, fusionIndex: 1 }]);
    expect(statBonusOf(s).total).toBeCloseTo(0.12);
    // 런 로그: 합체 기록 (두 캐릭터 요약·결과)
    const rec = s.slotLog.fusions[0]!;
    expect(rec).toMatchObject({ index: 1, transcendentId: r.def.id, soulSpent: HX.develop.soul.slice(HX.halfLevel).reduce((a, b) => a + b, 0), jade: HX.firstTranscendentJade });
    expect(rec.characters.map((c) => c.factionId)).toEqual(['hollow', other('hollow')]);
    expect(rec.characters[0]).toMatchObject({ tierIndex: 3, formId: 't4:fire:physical', rank: 1, rebirths: 2 });
    expect(s.shared.jade).toBe(HX.firstTranscendentJade);
  });

  it('첫 초월체만 영옥 10, 같은 초월체는 다시 나오지 않고 6번이면 6종 → 칭호 붕옥 완성, 이후 합체 막힘 (같은 상태로 반복해도)', () => {
    let s = fusionReady();
    const got: string[] = [];
    for (let i = 0; i < TRANSCENDENTS.length; i++) {
      const r = performFusion(s, 10_000 + i);
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      got.push(r.def.id);
      expect(r.jade).toBe(i === 0 ? HX.firstTranscendentJade : 0);
      expect(r.completed).toBe(i === TRANSCENDENTS.length - 1);
      // 다음 합체 준비 (같은 진화체·같은 상태)
      const keep = s;
      for (const [j, t] of allTracks(keep).entries()) {
        toTier5(t, j === 0 ? 't4:fire:physical' : 't4:water:special');
        makeTop(t);
      }
      developAll(keep);
      s = keep;
    }
    expect(new Set(got).size).toBe(TRANSCENDENTS.length);
    expect(s.shared.jade).toBe(HX.firstTranscendentJade);
    expect(s.titles.some((t) => t.titleId === 'hogyoku-complete')).toBe(true);
    expect(fusionGate(s).missing).toContain('complete');
    expect(performFusion(s).ok).toBe(false);
    expect(statBonusOf(s).total).toBeCloseTo(0.05 + 0.05 * 7 + 0.12); // 개발 10 + 합체마다 5단계씩 다시 (6번) = 40단계 + 초월체 6종
  });
});

describe('초월체 6종 결정 규칙', () => {
  const ch = (o: Partial<FusionInput> = {}): FusionInput => ({ rebirths: 0, hidden: false, elements: ['fire'], category: 'mixed', ...o });

  it('데이터: 6종·종족 무관·원작 이름은 유하바하·아이젠·이치고, 오리지널 3종, 전부 provisional', () => {
    expect(TRANSCENDENTS.map((t) => t.name)).toEqual(['유하바하', '아이젠', '이치고', '철혈 패왕', '영식 현자', '균열 방랑자']);
    expect(TRANSCENDENTS.filter((t) => t.original).length).toBe(3);
    expect(TRANSCENDENTS.every((t) => t.provisional === true)).toBe(true);
    expect(() => parseTranscendent({ id: 'x', order: 1, name: 'x', concept: '', condition: { type: 'rebirthSum', min: 0 }, provisional: true })).toThrow();
  });

  it('위에서부터: 환생 합 3 → 유하바하, 모두 히든 → 아이젠, 속성 겹침 → 이치고, 모두 물리 → 철혈 패왕, 모두 특수 → 영식 현자, 그 밖 → 균열 방랑자', () => {
    const d = (a: FusionInput, b: FusionInput) => decideTranscendent([a, b], [])!.id;
    expect(d(ch({ rebirths: 2, hidden: true }), ch({ rebirths: 1, hidden: true }))).toBe('yhwach');
    expect(d(ch({ hidden: true }), ch({ hidden: true }))).toBe('aizen');
    expect(d(ch({ elements: ['fire', 'water'] }), ch({ elements: ['water'] }))).toBe('ichigo');
    expect(d(ch({ category: 'physical' }), ch({ elements: ['earth'], category: 'physical' }))).toBe('iron-tyrant');
    expect(d(ch({ category: 'special' }), ch({ elements: ['earth'], category: 'special' }))).toBe('zero-sage');
    expect(d(ch({ category: 'physical' }), ch({ elements: ['earth'], category: 'special' }))).toBe('rift-wanderer');
  });

  it('가진 것은 건너뛰고, 조건 맞는 미보유가 없으면 미보유 중 표 아래쪽부터. 다 가지면 null', () => {
    const both = [ch({ category: 'physical' }), ch({ elements: ['earth'], category: 'physical' })];
    expect(decideTranscendent(both, ['iron-tyrant'])!.id).toBe('rift-wanderer');
    expect(decideTranscendent(both, ['iron-tyrant', 'rift-wanderer'])!.id).toBe('zero-sage');
    expect(decideTranscendent(both, TRANSCENDENTS.map((t) => t.id))).toBeNull();
    expect(conditionMet({ type: 'otherwise' }, both)).toBe(false);
  });

  it('실제 진화체로: 히든 둘이면 아이젠 미리보기, 조건이 맞았다고 표시', () => {
    const hidden5 = FORM_TABLE.filter((f) => f.tier === 4 && f.hidden && ['frenzy', 'restraint', 'hunter'].includes(f.label.kind)).map((f) => f.id);
    expect(hidden5.length).toBeGreaterThan(0);
    const s = fusionReady([hidden5[0]!, hidden5[0]!]);
    const pv = fusionPreview(s);
    expect(pv.def!.id).toBe('aizen');
    expect(pv.matched).toBe(true);
    expect(fusionFinalText(pv.def!).body).toContain('아이젠');
    expect(fusionLists().keeps.join(' ')).toContain('초월체 도감');
  });

  it('칭호 붕옥 완성 데이터가 있다 (조건 = 초월체 6종, provisional)', () => {
    const t = TITLES.find((x) => x.id === 'hogyoku-complete')!;
    expect(t.condition).toEqual({ type: 'transcendentsCollected', min: 6 });
    expect(t.provisional).toBe(true);
  });
});
