// C.435 (GDD v6.037 12-4): 초월자 = 두 캐릭터 진화체 분류 조합 6가지에 하나씩 · 이미 가진 조합은 합체 막힘 ·
// 전투 기반 3택(초월자 / 키웠던 호로 / 키웠던 사신 — 공격 분류·블록·특성·속성 블록만, 능력치·외형 그대로) · 형식 83 · Unknown;03398 조각 모델 6×8·2/3.
import { describe, expect, it } from 'vitest';
import { FACTIONS } from '../src/data/factions';
import { tryGetForm } from '../src/data/evolution';
import { comboKey, TRANSCENDENTS } from '../src/data/transcendents';
import { transcendentComboText } from '../src/data/hogyoku';
import { applyEvolutionToParams, combatEvolutionOf, TRANSCENDENT_BASIS } from '../src/engine/evolution';
import { buildCombatParams } from '../src/engine/absorb/build';
import { HOGYOKU_TRACK_IDS } from '../src/engine/transcend';
import { testGrantTranscendent } from '../src/engine/testMode';
import {
  allTracks, artSkinOf, basisChoices, characterTracks, checkTrackOpen, combatFactionIdOf, developHogyoku, fusionGate, fusionPreview, migrateSave, newSaveData, performFusion,
  SAVE_FORMAT_VERSION, statBonusOf, switchCombatBasis, type SaveData, type TrackKey,
} from '../src/game';
import { fusionBlockText } from '../src/ui/hogyokuView';
import { charArt } from '../src/data/art/manifest';
import { clearStory } from './helpers/storyClear';
import { useLegacyMigrations } from './helpers/legacyGate';

// C.446: 게임은 형식 87 미만을 열지 않는다(MIN_LOADABLE_SAVE_FORMAT 87) — 이 파일의 옛 형식 마이그레이션 시험 동안만 문턱을 내린다
useLegacyMigrations();

const other = (fid: string) => FACTIONS.find((f) => f.id !== fid)!.id;

function toFinal(t: Pick<SaveData, TrackKey>, formId: string): void {
  const e = t.evolution;
  e.tierIndex = 3;
  e.formHistory = ['t2:base', 't3:fire', formId];
  e.formId = formId;
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

/** 호로 = 불 물리, 사신 = 물 특수 (블록·특성 서로 다름) — 합체 준비 끝 */
function ready(a = 't4:fire:physical', b = 't4:water:special'): SaveData {
  const s = newSaveData('hollow', 1000);
  toFinal(s, a);
  s.evolution.ev = { hp: 40, atk: 10, int: 0, def: 5, spr: 0, aspd: 0, bspd: 0 };
  s.build.owned = ['t-fire-a', 't-water-b'];
  s.build.slots = ['t-fire-a', null, null];
  s.build.enhance = { fire: 30 };
  s.evolution.abilities!.owned = { 'el:fire': 1 };
  clearStory(s);
  checkTrackOpen(s, 2000);
  const o = s.otherTracks[0]!;
  toFinal(o, b);
  o.evolution.ev = { hp: 5, atk: 30, int: 12, def: 0, spr: 0, aspd: 8, bspd: 0 };
  o.build.owned = ['t-water-a', 't-water-b'];
  o.build.slots = ['t-water-a', 't-water-b', null];
  o.build.enhance = { water: 50 };
  o.evolution.abilities!.owned = { 'el:water': 2 };
  for (const t of allTracks(s)) makeTop(t);
  clearStory(s, other('hollow'));
  checkTrackOpen(s, 3000);
  developAll(s);
  return s;
}

const paramsOf = (s: SaveData) => {
  const p = buildCombatParams(s.build, s.factionId);
  applyEvolutionToParams(p, s.evolution, s.factionId, statBonusOf(s).total, false);
  return p;
};

describe('초월자 = 분류 조합 (GDD 12-4 v6.037)', () => {
  it('데이터: 조합 6가지가 모두 다르고 초월자마다 하나 · 대응표', () => {
    expect(new Set(TRANSCENDENTS.map((t) => comboKey(t.combo[0], t.combo[1]))).size).toBe(6);
    const by = Object.fromEntries(TRANSCENDENTS.map((t) => [comboKey(t.combo[0], t.combo[1]), t.name]));
    expect(by).toEqual({
      'physical+physical': '이치고', 'special+special': '아이젠', 'mixed+mixed': '태초',
      'physical+special': '영왕', 'mixed+physical': 'Unknown;03398', 'mixed+special': '유하바하',
    });
    expect(transcendentComboText(['physical', 'special'])).toBe('두 캐릭터 진화체 분류 물리 + 특수');
  });

  it('실제 합체: 조합마다 그 초월자 (순서 무관)', () => {
    for (const t of TRANSCENDENTS) {
      for (const [a, b] of [[t.combo[0], t.combo[1]], [t.combo[1], t.combo[0]]]) {
        const s = ready(`t4:fire:${a}`, `t4:water:${b}`);
        expect(fusionPreview(s).def!.id).toBe(t.id);
        const r = performFusion(s, 9000);
        expect(r.ok && r.def.id).toBe(t.id);
      }
    }
  });

  it('이미 가진 조합은 막힘 + 이유 · 미리보기는 그 초월자(이미 있음)', () => {
    const s = ready();
    s.transcendentDex.push({ id: 'iron-tyrant', at: 1, fusionIndex: 1 });
    const pv = fusionPreview(s);
    expect(pv.def!.id).toBe('iron-tyrant');
    expect(pv.owned).toBe(true);
    expect(fusionGate(s)).toEqual({ ok: false, missing: ['owned'] });
    expect(performFusion(s).ok).toBe(false);
    expect(fusionBlockText('owned')).toBe('이 조합의 초월자는 이미 있다 — 다른 분류로 키워라.');
  });
});

describe('전투 기반 3택 (GDD 12-4 v6.037)', () => {
  it('합체하면 기반 = 초월자 / 키웠던 호로 / 키웠던 사신(종족 설정 이름), 처음은 초월자', () => {
    const s = ready();
    performFusion(s, 9000);
    const ch = basisChoices(s);
    expect(ch.map((c) => c.key)).toEqual([TRANSCENDENT_BASIS, ...FACTIONS.map((f) => f.id)]);
    expect(ch.map((c) => c.label)).toEqual(['초월자', ...FACTIONS.map((f) => `키웠던 ${f.name}`)]);
    expect(ch.find((c) => c.current)!.key).toBe(TRANSCENDENT_BASIS);
    // 합체 순간 두 캐릭터 빌드를 따로 저장
    const b = s.evolution.basis!.builds;
    expect(b.hollow!.build.slots).toEqual(['t-fire-a', null, null]);
    expect(b[other('hollow')]!.build.slots).toEqual(['t-water-a', 't-water-b', null]);
    expect(b[other('hollow')]!.formId).toBe('t4:water:special');
    expect(basisChoices(characterTracks(s)[0]!)).toEqual([]); // 캐릭터 트랙엔 없음
  });

  it('바꾸면 블록·특성·공격 분류·속성이 그 기반으로 · 능력치·외형은 그대로 · 기반별 편집은 따로 남음 · 런 로그', () => {
    const s = ready();
    performFusion(s, 9000);
    const stats0 = paramsOf(s).playerStats;
    const skin0 = artSkinOf(s), form0 = s.evolution.formId;
    const sh = other('hollow');
    expect(switchCombatBasis(s, sh, 9100)).toEqual({ ok: true, changed: true });
    expect(s.build.slots).toEqual(['t-water-a', 't-water-b', null]);
    expect(s.build.enhance).toEqual({ water: 50 });
    expect(s.evolution.abilities!.owned).toEqual({ 'el:water': 2 });
    expect(tryGetForm(combatEvolutionOf(s.evolution).formId!)!.label.category).toBe('special');
    expect(combatFactionIdOf(s)).toBe(sh);
    const p = paramsOf(s);
    expect(p.playerStats).toEqual(stats0);
    expect(p.playerElements).toEqual(['water']);
    expect(s.evolution.formId).toBe(form0);
    expect(artSkinOf(s)).toBe(skin0);
    // 호로 기반: 물리·불
    switchCombatBasis(s, 'hollow', 9200);
    expect(tryGetForm(combatEvolutionOf(s.evolution).formId!)!.label.category).toBe('physical');
    expect(paramsOf(s).playerElements).toEqual(['fire']);
    expect(paramsOf(s).playerStats).toEqual(stats0);
    // 편집은 기반마다
    s.build.slots = [null, null, null];
    switchCombatBasis(s, TRANSCENDENT_BASIS, 9300);
    expect(s.build.slots.filter(Boolean).length).toBeGreaterThan(0);
    switchCombatBasis(s, 'hollow', 9400);
    expect(s.build.slots).toEqual([null, null, null]);
    expect(s.runLog.basisChanges!.map((r) => r.to)).toEqual([sh, 'hollow', TRANSCENDENT_BASIS, 'hollow']);
    // 같은 기반·모르는 기반·모험 중
    expect(switchCombatBasis(s, 'hollow')).toEqual({ ok: true, changed: false });
    expect(switchCombatBasis(s, 'nope')).toEqual({ ok: false, reason: 'unknown' });
    s.activeExpedition = {} as never;
    expect(switchCombatBasis(s, sh)).toEqual({ ok: false, reason: 'expedition' });
  });

  it('저장·불러오기를 지나도 기반·기반별 빌드 유지', () => {
    const s = ready();
    performFusion(s, 9000);
    switchCombatBasis(s, other('hollow'), 9100);
    const m = migrateSave(JSON.parse(JSON.stringify(s)))!;
    expect(m.evolution.basis!.current).toBe(other('hollow'));
    expect(m.build.slots).toEqual(['t-water-a', 't-water-b', null]);
    expect(Object.keys(m.evolution.basis!.builds).sort()).toEqual([TRANSCENDENT_BASIS, ...FACTIONS.map((f) => f.id)].sort());
  });

  it('테스트 모드 초월자 얻기도 기반 3택이 생긴다', () => {
    const s = ready();
    expect(testGrantTranscendent(s, 'zero-sage', 6000)).toBe('added');
    expect(basisChoices(s)).toHaveLength(3);
  });
});

describe('세이브 형식 83 (82 → 83)', () => {
  it('이미 있는 초월자 트랙: 지금 합친 빌드 = 초월자 기반, 키웠던 캐릭터 = 합친 빌드 복사 + 합체 기록의 진화체 · id 그대로', () => {
    expect(SAVE_FORMAT_VERSION).toBe(88);
    const s = ready();
    performFusion(s, 9000);
    const raw = JSON.parse(JSON.stringify(s)) as SaveData;
    raw.meta.format = 82;
    delete raw.evolution.basis;
    raw.transcendentId = 'aizen'; // 조합과 안 맞는 옛 id 도 그대로
    raw.slotLog.fusions[0]!.transcendentId = 'aizen';
    const m = migrateSave(raw)!;
    expect(m.meta.format).toBe(88);
    expect(m.transcendentId).toBe('aizen');
    const b = m.evolution.basis!;
    expect(b.current).toBe(TRANSCENDENT_BASIS);
    expect(b.builds[TRANSCENDENT_BASIS]!.build).toEqual(m.build);
    expect(b.builds[other('hollow')]!.build).toEqual(m.build);
    expect(b.builds[other('hollow')]!.formId).toBe('t4:water:special');
    expect(b.builds.hollow!.formId).toBe('t4:fire:physical');
    expect(characterTracks(m).every((t) => t.evolution.basis === undefined)).toBe(true);
  });
});

describe('Unknown;03398 조각 모델 크기 (GDD 12-4 v6.037)', () => {
  it('세로가 긴 직사각형(6×8 조각) · 표시 배율 2/3', () => {
    const m = TRANSCENDENTS.find((t) => t.model)!.model!;
    expect(m.grid[1]).toBeGreaterThan(m.grid[0]);
    expect(m.grid).toEqual([6, 8]);
    expect(m.scale).toBeCloseTo(2 / 3, 2);
    expect(charArt('hollow', 3, 'char.hollow', '/', {}, [], 'mosaic:rift-wanderer').scale).toBe(m.scale);
  });
});
