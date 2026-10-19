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
  activeTrackOf, allTracks, checkTrackOpen, feedHogyoku, fusionGate, fusionPreview, liberateHogyoku, loadSave, migrateSave, newSaveData, performFusion, SAVE_FORMAT_VERSION,
  statBonusOf, switchTrack, TRACK_KEYS, trackIsTopRank, writeSave, type SaveData, type TrackKey,
} from '../src/game';
import { fusionBlockText, fusionFinalText, fusionLists } from '../src/ui/hogyokuView';

const HX = BALANCE.provisional.hogyoku;
const other = (fid: string) => FACTIONS.find((f) => f.id !== fid)!.id;

/** 트랙을 5단계로 (진화체·속성 지정 가능) */
function toTier5(t: Pick<SaveData, TrackKey>, formId = 't5:fire:physical'): void {
  const e = t.evolution;
  e.tierIndex = 4;
  e.formHistory = ['t2:base', 't3:base', 't4:fire', formId];
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
  toTier5(s);
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
  s.story = { hollow: { cleared: { 'ch1/ep1': { firstAt: 10, clears: 2 } }, chapters: [] } };
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

/** 두 트랙 모두 5단계·1위, 붕옥 해방·2단계 게이지 가득인 세이브 */
function fusionReady(forms: [string, string] = ['t5:fire:physical', 't5:water:special']): SaveData {
  const s = newSaveData('hollow', 1000);
  toTier5(s, forms[0]);
  checkTrackOpen(s, 2000);
  toTier5(s.otherTracks[0]!, forms[1]);
  checkTrackOpen(s, 3000);
  for (const t of allTracks(s)) makeTop(t);
  s.shared.soulCrystals = HX.liberateCost + HX.fusionCost;
  feedHogyoku(s);
  liberateHogyoku(s, 3500);
  feedHogyoku(s);
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
      const got = (m as unknown as Record<string, unknown>)[k];
      if (typeof v === 'object' && v !== null && !Array.isArray(v)) expect(got, k).toMatchObject(v);
      else expect(got, k).toEqual(v);
    }
    expect(m.meta.startPatch).toBe((before.meta as { startPatch: string }).startPatch);
    expect(m.otherTracks).toEqual([]);
    expect(m.hogyoku).toEqual({ tabOpen: false, tabNotice: false, fed: 0, liberated: false, liberatedAt: null, fusionFed: 0 });
    expect(m.transcendentDex).toEqual([]);
    expect(m.slotLog).toEqual({ fusions: [], trackOpens: [] });
  });

  it('이미 5단계인 옛 세이브는 열 때 다른 종족 트랙이 열리고(종족 데이터에서), 알림이 한 번 걸린다. 원래 트랙은 그대로', () => {
    const st = memStorage();
    st.setItem('k', JSON.stringify(oldFormat22()));
    const s = loadSave(st, 'k')!;
    expect(s.factionId).toBe('hollow');
    expect(s.evolution.tierIndex).toBe(4);
    expect(s.otherTracks.map((t) => t.factionId)).toEqual([other('hollow')]);
    expect(s.otherTracks[0]!.evolution.tierIndex).toBe(0);
    expect(s.trackNotice).toBe(other('hollow'));
    expect(s.slotLog.trackOpens).toHaveLength(1);
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
  it('5단계 전에는 열리지 않고, 닿으면 종족 데이터 순서에서 아직 없는 종족이 열린다 (두 종족 모두)', () => {
    for (const f of FACTIONS) {
      const s = newSaveData(f.id, 1);
      expect(checkTrackOpen(s, 2)).toBeNull();
      s.evolution.tierIndex = 4;
      expect(checkTrackOpen(s, 3)).toBe(other(f.id));
      expect(checkTrackOpen(s, 4)).toBeNull(); // 트랙 칸이 다 찼다
      expect(allTracks(s)).toHaveLength(BALANCE.provisional.twoTrack.maxTracks);
    }
  });

  it('종족 목록은 데이터에서 읽는다: 세 번째 종족이 있어도 하드코딩 없이 그 순서대로', () => {
    const s = newSaveData('shinigami', 1);
    s.evolution.tierIndex = 4;
    expect(checkTrackOpen(s, 2, [{ id: 'shinigami' }, { id: 'quincy' }, { id: 'hollow' }])).toBe('quincy');
  });

  it('전환은 트랙 필드를 맞바꾸고 공유 자원은 그대로, 쉬는 동안 허기가 오른다', () => {
    const s = newSaveData('hollow', 0);
    toTier5(s);
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
    checkTrackOpen(s, 0);
    s.activeExpedition = { version: 6 } as never;
    switchTrack(s, other('hollow'), 1);
    expect(s.activeExpedition).toBeNull();
    expect(s.otherTracks[0]!.activeExpedition).toEqual({ version: 6 });
  });
});

describe('붕옥 (탭·해방·보너스)', () => {
  it('두 트랙 모두 5단계에 한 번 닿아야 탭이 열린다 (영구)', () => {
    const s = newSaveData('hollow', 0);
    toTier5(s);
    checkTrackOpen(s, 0);
    expect(s.hogyoku.tabOpen).toBe(false);
    s.otherTracks[0]!.rebirth.count = 1; // 환생은 5단계에서만 = 닿은 적 있음
    checkTrackOpen(s, 1);
    expect(s.hogyoku.tabOpen).toBe(true);
    expect(s.hogyoku.tabNotice).toBe(true);
  });

  it('영혼 결정 100 → 해방 → 두 캐릭터 전 능력치 +5%, 해방 뒤 먹이면 2단계 게이지(최대 300)', () => {
    const s = fusionReady();
    expect(s.hogyoku.liberated).toBe(true);
    expect(s.hogyoku.fed).toBe(HX.liberateCost);
    expect(s.hogyoku.fusionFed).toBe(HX.fusionCost);
    expect(s.shared.soulCrystals).toBe(0);
    expect(statBonusOf(s).total).toBeCloseTo(0.05);
    const t = newSaveData('hollow', 0);
    t.evolution.tierIndex = 4;
    checkTrackOpen(t, 0);
    t.shared.soulCrystals = 60;
    expect(liberateHogyoku(t)).toBe(false); // 탭이 닫혀 있다
    expect(feedHogyoku(t)).toBe(0);
  });

  it('게이지가 덜 차면 해방하지 못하고, 가진 만큼만 먹인다', () => {
    const s = newSaveData('hollow', 0);
    s.hogyoku.tabOpen = true;
    s.shared.soulCrystals = 60;
    expect(feedHogyoku(s)).toBe(60);
    expect(liberateHogyoku(s)).toBe(false);
    s.shared.soulCrystals = 70;
    expect(feedHogyoku(s)).toBe(40);
    expect(s.shared.soulCrystals).toBe(30);
    expect(liberateHogyoku(s)).toBe(true);
  });

  it('보너스는 능력치·전투 파라미터·원정에 곱해지고(999 상한), 초월체 1종 +2% 최대 12%', () => {
    expect(slotStatBonus(false, 0).total).toBe(0);
    expect(slotStatBonus(true, 3).total).toBeCloseTo(0.11);
    expect(slotStatBonus(false, 9).transcendents).toBeCloseTo(0.12);
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
    s.hogyoku.fusionFed = 10;
    s.activeExpedition = {} as never;
    expect(fusionGate(s).missing).toEqual(['gauge', 'expedition']);
    expect(performFusion(s).ok).toBe(false);
    for (const b of ['tab', 'liberation', 'tracks', 'gauge', 'rank', 'expedition', 'complete'] as const) expect(fusionBlockText(b)).toMatch(/\./);
  });

  it('두 캐릭터는 사라지고 같은 종족의 새 두 트랙이 1단계 완전 초기, 슬롯 자원·도감·칭호·해방은 남는다', () => {
    const s = fusionReady();
    s.shared.soulCrystals = 25;
    s.shared.tradeCoins = 77;
    s.formDex = ['t5:fire:physical'];
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
    expect(s.formDex).toEqual(['t5:fire:physical']);
    expect(s.titles.some((t) => t.titleId === 'rank-1')).toBe(true);
    expect(s.hogyoku.liberated).toBe(true);
    expect(s.hogyoku.tabOpen).toBe(true);
    expect(s.hogyoku.fusionFed).toBe(0);
    expect(s.transcendentDex).toEqual([{ id: r.def.id, at: 9000, fusionIndex: 1 }]);
    expect(statBonusOf(s).total).toBeCloseTo(0.07);
    // 런 로그: 합체 기록 (두 캐릭터 요약·결과)
    const rec = s.slotLog.fusions[0]!;
    expect(rec).toMatchObject({ index: 1, transcendentId: r.def.id, soulSpent: HX.fusionCost, jade: HX.firstTranscendentJade });
    expect(rec.characters.map((c) => c.factionId)).toEqual(['hollow', other('hollow')]);
    expect(rec.characters[0]).toMatchObject({ tierIndex: 4, formId: 't5:fire:physical', rank: 1, rebirths: 2 });
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
        toTier5(t, j === 0 ? 't5:fire:physical' : 't5:water:special');
        makeTop(t);
      }
      keep.shared.soulCrystals = HX.fusionCost;
      feedHogyoku(keep);
      s = keep;
    }
    expect(new Set(got).size).toBe(TRANSCENDENTS.length);
    expect(s.shared.jade).toBe(HX.firstTranscendentJade);
    expect(s.titles.some((t) => t.titleId === 'hogyoku-complete')).toBe(true);
    expect(fusionGate(s).missing).toContain('complete');
    expect(performFusion(s).ok).toBe(false);
    expect(statBonusOf(s).total).toBeCloseTo(0.05 + 0.12);
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
    const hidden5 = FORM_TABLE.filter((f) => f.tier === 5 && f.hidden && f.label.kind !== 'reborn').map((f) => f.id);
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
