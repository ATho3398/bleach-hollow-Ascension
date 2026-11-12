// C.429 (GDD v6.028 12-4): 초월자 = 완전한 3번째 캐릭터 — 합체하면 초월자 트랙이 생기고 두 캐릭터가 키운 것을 이어받는다.
// 진화·퇴화 없음, 시간 감소 없음, 등급전·스토리·환생 없음, ★ 전부 열림, 능력치 상한 = 마지막 단계 상한. 차이는 트랙 종류 설정(src/data/trackKinds)에서만 읽는다.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { BALANCE } from '../src/config/balance';
import { FACTIONS } from '../src/data/factions';
import { TRACK_KINDS, getTrackKind, parseTrackKind } from '../src/data/trackKinds';
import { TRANSCENDENTS } from '../src/data/transcendents';
import { addEv, canEvolve, evCaps, MAX_TIER_INDEX, stepsNeeded } from '../src/engine/evolution';
import { enhanceLevel } from '../src/engine/absorb/build';
import { MAX_DIFFICULTY } from '../src/engine/difficulty';
import { HOGYOKU_TRACK_IDS } from '../src/engine/transcend';
import {
  absenceOf, allTracks, characterTracks, checkTrackOpen, developHogyoku, fusionGate, loadSave, migrateSave, newSaveData, performFusion, performRevive, SAVE_FORMAT_VERSION,
  switchTrack, tickCare, tickIdle, trackIdOf, trackRulesOf, writeSave, type SaveData, type TrackKey,
} from '../src/game';
import { clearStory } from './helpers/storyClear';

const other = (fid: string) => FACTIONS.find((f) => f.id !== fid)!.id;
const read = (p: string) => readFileSync(p, 'utf8');

function toFinal(t: Pick<SaveData, TrackKey>, formId: string, ev: SaveData['evolution']['ev']): void {
  const e = t.evolution;
  e.tierIndex = 3;
  e.formHistory = ['t2:base', 't3:fire', formId];
  e.formId = formId;
  e.ev = { ...ev };
}
function makeTop(t: Pick<SaveData, TrackKey>): void {
  t.rank.ladder = ['player', ...t.rank.ladder.filter((x) => x !== 'player')];
  t.rank.history.everRanked = true;
}
function developAll(s: SaveData): void {
  s.shared.soulCrystals += 5000;
  s.shared.hogyokuShards += 5000;
  s.shared.resonanceEssence += 5000;
  for (const t of HOGYOKU_TRACK_IDS) while (developHogyoku(s, t, 3500)) { /* 50강까지 */ }
}
function memStorage(): { getItem(k: string): string | null; setItem(k: string, v: string): void } {
  const m = new Map<string, string>();
  return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => void m.set(k, v) };
}

/** 두 캐릭터 모두 4단계·1위, 공명·개발 100% — 능력치·블록·특성·속성 강화가 서로 다른 세이브 */
function fusionReady(): SaveData {
  const s = newSaveData('hollow', 1000);
  toFinal(s, 't4:fire:physical', { hp: 40, atk: 10, int: 0, def: 5, spr: 0, spd: 0 });
  s.build.owned = ['t-fire-a', 't-water-b'];
  s.build.slots = ['t-fire-a', null, null];
  s.build.enhance = { fire: 30, water: 2 };
  s.evolution.abilities!.owned = { 'el:fire': 1 };
  s.rebirth.count = 1;
  s.tower.best = 4;
  s.nest.bond = 20;
  clearStory(s);
  checkTrackOpen(s, 2000);
  const o = s.otherTracks[0]!;
  toFinal(o, 't4:water:special', { hp: 5, atk: 30, int: 12, def: 0, spr: 0, spd: 8 });
  o.build.owned = ['t-water-a', 't-water-b'];
  o.build.slots = ['t-water-a', 't-water-b', null];
  o.build.enhance = { fire: 10, water: 50 };
  o.evolution.abilities!.owned = { 'el:water': 2, 'el:fire': 3 };
  o.rebirth.count = 2;
  o.tower.best = 7;
  o.nest.bond = 35;
  for (const t of allTracks(s)) makeTop(t);
  clearStory(s, other('hollow'));
  checkTrackOpen(s, 3000);
  developAll(s);
  return s;
}

describe('트랙 종류 설정 (src/data/trackKinds)', () => {
  it('캐릭터·초월자 두 종류, 초월자 = 진화·퇴화·시간 감소·돌봄 요청·등급전·스토리·환생·합체 없음, ★ 전부', () => {
    expect(TRACK_KINDS.map((k) => k.id).sort()).toEqual(['character', 'transcendent']);
    expect(getTrackKind('transcendent')).toMatchObject({ evolution: false, devolution: false, timeDecay: false, careRequests: false, rank: false, story: false, rebirth: false, fusion: false, allDifficulties: true, provisional: true });
    expect(getTrackKind('character')).toMatchObject({ evolution: true, devolution: true, timeDecay: true, careRequests: true, rank: true, story: true, rebirth: true, fusion: true, allDifficulties: false });
    for (const d of TRANSCENDENTS) expect(TRACK_KINDS.some((k) => k.id === d.trackKind)).toBe(true);
    expect(() => parseTrackKind({ id: 'x', label: 'x' })).toThrow(/evolution/);
  });
  it('엔진에 초월자 id·트랙 종류 id 분기 없음 (플래그만 읽는다)', () => {
    for (const p of ['src/game.ts', 'src/engine/nest.ts', 'src/engine/evolution/evolution.ts', 'src/ui/app.ts', 'src/ui/roomView.ts']) {
      const src = read(p);
      expect(src).not.toMatch(/=== ?'transcendent'|transcendentId === '|'yhwach'|'aizen'/);
    }
  });
});

describe('합체 → 초월자 트랙 (GDD 12-4 v6.028)', () => {
  it('초월자 트랙이 생기고 지금 트랙이 된다 · 두 캐릭터는 1단계로 쉬는 트랙', () => {
    const s = fusionReady();
    const r = performFusion(s, 9000);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(s.transcendentId).toBe(r.def.id);
    expect(trackIdOf(s)).toBe(`tr:${r.def.id}`);
    expect(s.trackNotice).toBe(`tr:${r.def.id}`);
    expect(allTracks(s)).toHaveLength(3);
    expect(characterTracks(s).map((t) => [t.factionId, t.evolution.tierIndex])).toEqual([['hollow', 0], [other('hollow'), 0]]);
    expect(s.slotLog.fusions[0]!.baseFactionId).toBe('hollow');
  });

  it('이어받기: 능력치마다 높은 쪽 · 블록 합침(바탕 장착 + 빈 칸 채움) · 속성 강화 높은 쪽 · 진화 특성 합침 · 환생 수·탑·교감 높은 쪽', () => {
    const s = fusionReady();
    performFusion(s, 9000);
    expect(s.factionId).toBe('hollow'); // 바탕 = 단계가 같으면 지금 캐릭터
    expect(s.evolution.formId).toBe('t4:fire:physical');
    expect(s.evolution.tierIndex).toBe(3);
    expect(s.evolution.ev).toEqual({ hp: 40, atk: 30, int: 12, def: 5, spr: 0, spd: 8 });
    expect(s.build.owned).toEqual(['t-fire-a', 't-water-b', 't-water-a']);
    expect(s.build.slots).toEqual(['t-fire-a', 't-water-a', 't-water-b']);
    expect(s.build.enhance).toEqual({ fire: 30, water: 50 });
    expect(s.evolution.abilities!.owned).toEqual({ 'el:fire': 3, 'el:water': 2 });
    expect(s.rebirth.count).toBe(2);
    expect(s.tower.best).toBe(7);
    expect(s.nest.bond).toBe(35);
    expect(s.rank.history.everRanked).toBe(false);
    expect(s.runLog.transcendence).toMatchObject({ transcendentId: s.transcendentId, fusionIndex: 1, baseFactionId: 'hollow', from: ['hollow', other('hollow')], tierIndex: 3, evTotal: 95, traits: 3, abilities: 2 });
    expect(s.runLog.runs).toEqual([]);
  });

  it('초월자 트랙은 합체 재료가 아니다 — 두 번째 합체도 캐릭터 두 명으로, 초월자 트랙은 늘어난다(최대 6)', () => {
    let s = fusionReady();
    for (let i = 0; i < TRANSCENDENTS.length; i++) {
      const r = performFusion(s, 10_000 + i);
      expect(r.ok).toBe(true);
      for (const t of characterTracks(s)) { toFinal(t, 't4:fire:physical', { hp: 1, atk: 1, int: 1, def: 1, spr: 1, spd: 1 }); makeTop(t); }
      developAll(s);
      s = migrateSave(JSON.parse(JSON.stringify(s)))!; // 저장·불러오기를 지나도 트랙이 남는다
    }
    expect(allTracks(s).filter((t) => t.transcendentId)).toHaveLength(TRANSCENDENTS.length);
    expect(new Set(allTracks(s).map(trackIdOf)).size).toBe(TRANSCENDENTS.length + 2);
    expect(characterTracks(s)).toHaveLength(BALANCE.provisional.twoTrack.maxTracks);
    expect(fusionGate(s).missing).toContain('complete');
  });
});

describe('초월자 규칙', () => {
  it('진화 없음: final 표시 → 걸음·진화 판정 없음 · 노력치 상한 = 마지막 단계 상한 (단계가 낮아도)', () => {
    const s = fusionReady();
    performFusion(s, 9000);
    expect(s.evolution.final).toBe(true);
    s.evolution.tierIndex = 1; // 마이그레이션처럼 낮은 단계여도
    expect(stepsNeeded(s.evolution)).toBeNull();
    s.evolution.steps = 999;
    expect(canEvolve(s.evolution)).toBe(false);
    const cap = evCaps(MAX_TIER_INDEX);
    s.evolution.ev = { hp: 0, atk: 0, int: 0, def: 0, spr: 0, spd: 0 };
    addEv(s.evolution, { hp: 9999 });
    expect(s.evolution.ev.hp).toBe(cap.perStat); // 상한에 닿으면 더 안 오른다
    addEv(s.evolution, { hp: 50 });
    expect(s.evolution.ev.hp).toBe(cap.perStat);
  });

  it('속성 흡수는 되지만 강화 효과는 최대에서 끝', () => {
    const s = fusionReady();
    performFusion(s, 9000);
    s.build.enhance = { fire: BALANCE.provisional.absorb.enhance.max + 40 };
    expect(enhanceLevel(s.build, 'fire')).toBe(BALANCE.provisional.absorb.enhance.max);
  });

  it('시간 감소 없음: 꺼 둔 72시간·켜 둔 시간 동안 배부름·컨디션·교감 그대로, 쇠약·빈사 없음, 돌봄 요청 없음 — 캐릭터는 그대로 닳는다', () => {
    const s = fusionReady();
    performFusion(s, 9000);
    const before = { hunger: s.nest.hunger, condition: s.nest.condition, bond: s.nest.bond };
    s.lastSeenAt = 10_000;
    s.nest.lastTickMs = 10_000;
    s.nest.lastMealAt = 10_000;
    const now = 10_000 + 72 * 3_600_000;
    const r = absenceOf(s, now);
    expect(r.collapsed).toBe(false);
    expect({ hunger: s.nest.hunger, condition: s.nest.condition, bond: s.nest.bond }).toEqual(before);
    expect(s.nest.weakened || s.nest.collapsed || s.nest.dead).toBe(false);
    expect(s.nest.lastMealAt).toBe(now); // 쇠약 시계가 멈춤
    tickIdle(s, now + 5 * 3_600_000);
    expect(s.nest.hunger).toBe(before.hunger);
    expect(tickCare(s, now + 99 * 3_600_000, () => 0)).toBe(false);
    expect(s.nest.careRequest).toBeNull();
    // 캐릭터 트랙으로 바꾸면 그 트랙은 지금 규칙 그대로 (쉬던 시간만큼 허기 오름)
    const fid = trackIdOf(characterTracks(s)[1]!);
    expect(switchTrack(s, fid, now + 10 * 3_600_000)).toBe(true);
    expect(trackRulesOf(s).timeDecay).toBe(true);
    expect(s.nest.hunger).toBeGreaterThan(0);
  });

  it('쉬다 돌아온 초월자도 안 닳는다 · 트랙 전환 = 트랙 키(tr:id)로', () => {
    const s = fusionReady();
    performFusion(s, 9000);
    const tid = trackIdOf(s);
    const hunger = s.nest.hunger;
    expect(switchTrack(s, 'hollow', 20_000)).toBe(true);
    expect(s.transcendentId).toBeNull();
    expect(switchTrack(s, tid, 20_000 + 48 * 3_600_000)).toBe(true);
    expect(s.transcendentId).not.toBeNull();
    expect(s.nest.hunger).toBe(hunger);
    expect(switchTrack(s, tid, 20_000 + 49 * 3_600_000)).toBe(false); // 이미 지금 트랙
  });

  it('★ 전부 열림 · 부활해도 진화체 그대로(퇴화 없음)', () => {
    const s = fusionReady();
    performFusion(s, 9000);
    expect(s.difficulty.unlocked).toBe(MAX_DIFFICULTY);
    s.nest.dead = true;
    const r = performRevive(s, 20_000);
    expect(r.ok).toBe(true);
    expect(s.evolution.tierIndex).toBe(3);
    expect(s.evolution.formId).toBe('t4:fire:physical');
    expect(s.evolution.ev.hp).toBeLessThan(40);
  });

  it('저장·불러오기로 초월자 트랙·final·★ 가 남는다', () => {
    const s = fusionReady();
    performFusion(s, 9000);
    const st = memStorage();
    expect(writeSave(st, s)).toBe(true);
    const l = loadSave(st)!;
    expect(l.transcendentId).toBe(s.transcendentId);
    expect(l.evolution.final).toBe(true);
    expect(l.difficulty.unlocked).toBe(MAX_DIFFICULTY);
    expect(l.otherTracks.map((t) => t.transcendentId)).toEqual([null, null]);
  });
});

describe('세이브 형식 82 (81 → 82 마이그레이션)', () => {
  it('형식 82 · 모든 트랙 transcendentId null · 이미 얻은 초월자마다 초월자 트랙(지금 캐릭터 + 합체 기록으로 올림)', () => {
    expect(SAVE_FORMAT_VERSION).toBe(82);
    const s = newSaveData('hollow', 1);
    clearStory(s);
    checkTrackOpen(s, 2);
    s.evolution.ev = { hp: 3, atk: 0, int: 0, def: 0, spr: 0, spd: 0 };
    s.transcendentDex = [{ id: TRANSCENDENTS[0]!.id, at: 5, fusionIndex: 1 }];
    s.slotLog.fusions = [{ at: 5, index: 1, transcendentId: TRANSCENDENTS[0]!.id, matched: true, soulSpent: 0, jade: 10, characters: [
      { factionId: other('hollow'), tierIndex: 3, formId: 't4:water:special', elements: ['water'], category: 'special', hidden: false, rebirths: 2, rank: 1, runs: 9, elitesDefeated: 1, evTotal: 120 },
      { factionId: 'hollow', tierIndex: 2, formId: null, elements: [], category: 'mixed', hidden: false, rebirths: 0, rank: 1, runs: 9, elitesDefeated: 1, evTotal: 30 },
    ] }];
    const raw = JSON.parse(JSON.stringify(s)) as Record<string, unknown> & { meta: { format: number }; otherTracks: Record<string, unknown>[] };
    raw.meta.format = 81;
    delete raw.transcendentId;
    for (const t of raw.otherTracks) delete t.transcendentId;
    const m = migrateSave(raw)!;
    expect(m.meta.format).toBe(82);
    expect(m.transcendentId).toBeNull(); // 지금 트랙은 그대로
    const tr = m.otherTracks.find((t) => t.transcendentId === TRANSCENDENTS[0]!.id)!;
    expect(tr).toBeDefined();
    expect(tr.factionId).toBe(other('hollow'));
    expect(tr.evolution).toMatchObject({ tierIndex: 3, formId: 't4:water:special', final: true });
    expect(tr.evolution.ev.hp).toBe(20); // 120 ÷ 6 = 20 (상한 안), 지금 캐릭터 3 보다 높은 쪽
    expect(tr.rebirth.count).toBe(2);
    expect(tr.difficulty.unlocked).toBe(MAX_DIFFICULTY);
    expect(tr.runLog.transcendence).toMatchObject({ migrated: true, transcendentId: TRANSCENDENTS[0]!.id, tierIndex: 3 });
    expect(characterTracks(m)).toHaveLength(2);
  });

  it('초월자가 없는 옛 세이브는 트랙이 그대로', () => {
    const raw = JSON.parse(JSON.stringify(newSaveData('hollow', 1))) as Record<string, unknown> & { meta: { format: number } };
    raw.meta.format = 81;
    delete raw.transcendentId;
    const m = migrateSave(raw)!;
    expect(m.transcendentId).toBeNull();
    expect(m.otherTracks).toEqual([]);
  });
});

describe('화면 (초월자 트랙)', () => {
  it('트랙 전환 메뉴에 초월자 이름 · 등급전 자물쇠 + 이유 · 스토리 탭 없음 · 환생 버튼 흐림', () => {
    expect(read('src/ui/roomView.ts')).toContain('`${trackRulesOf(t).label} ${trackNameOf(t)}`');
    const app = read('src/ui/app.ts');
    expect(app).toContain('...(trackRulesOf(s).rank ? {} : { rank: trackLockedText(s) })');
    expect(app).toContain('...(trackRulesOf(save!).story ? { onTab: () => storyScreen(faction) } : {})');
    expect(read('src/ui/lcdScreens.ts')).toContain('canRebirth(evo) && trackRulesOf(save).rebirth');
    expect(read('src/ui/bha/statusBox.ts')).toContain('if (save.transcendentId)');
  });
});
