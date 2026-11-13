// C.436 (GDD v6.039 12-4): 조합 고침(특+혼 유하바하 · 혼+혼 태초 · 물+혼 Unknown;03398) · 초월 특성(기반과 상관없이 늘 붙음, 내용 [미정] — 자리만) ·
// 특성이 전투 기반을 따라감(상태·빌드·전투) · 전투 화면 블록 이름 = 기반 종족 · 형식 84.
import { readFileSync } from 'node:fs';
import { BALANCE } from '../src/config/balance';
import { afterEach, describe, expect, it } from 'vitest';
import { FACTIONS, getFaction } from '../src/data/factions';
import { tryGetForm } from '../src/data/evolution';
import { comboKey, parseTranscendent, TRANSCENDENTS, type TranscendentTraitEffect } from '../src/data/transcendents';
import { transcendentComboText } from '../src/data/hogyoku';
import { applyEvolutionToParams, combatAbilitiesOf, combatEvolutionOf, transcendentTraitsOf, TRANSCENDENT_BASIS } from '../src/engine/evolution';
import { buildCombatParams } from '../src/engine/absorb/build';
import { decideTranscendent, HOGYOKU_TRACK_IDS } from '../src/engine/transcend';
import { testGrantTranscendent } from '../src/engine/testMode';
import {
  allTracks, characterTracks, checkTrackOpen, combatFactionIdOf, developHogyoku, fusionPreview, migrateSave, newSaveData, performFusion,
  SAVE_FORMAT_VERSION, statBonusOf, switchCombatBasis, type SaveData, type TrackKey,
} from '../src/game';
import { battleLabels, skillBlockLabel } from '../src/ui/labels';
import { clearStory } from './helpers/storyClear';
import { useLegacyMigrations } from './helpers/legacyGate';

// C.446: 게임은 형식 87 미만을 열지 않는다(MIN_LOADABLE_SAVE_FORMAT 87) — 이 파일의 옛 형식 마이그레이션 시험 동안만 문턱을 내린다
useLegacyMigrations();

const read = (p: string) => readFileSync(p, 'utf8');

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


const byId = (id: string) => TRANSCENDENTS.find((t) => t.id === id)!;

describe('조합 대응 (GDD 12-4 v6.039)', () => {
  it('물+물 이치고 · 특+특 아이젠 · 물+특 영왕 · 특+혼 유하바하 · 혼+혼 태초 · 물+혼 Unknown;03398 · 겹침 없음', () => {
    const by = Object.fromEntries(TRANSCENDENTS.map((t) => [comboKey(t.combo[0], t.combo[1]), t.name]));
    expect(by).toEqual({
      'physical+physical': '이치고', 'special+special': '아이젠', 'physical+special': '영왕',
      'mixed+special': '유하바하', 'mixed+mixed': '태초', 'mixed+physical': 'Unknown;03398',
    });
    expect(new Set(Object.keys(by)).size).toBe(6);
    expect(TRANSCENDENTS.map((t) => t.id)).toEqual(['yhwach', 'aizen', 'ichigo', 'iron-tyrant', 'zero-sage', 'rift-wanderer']); // 옛 세이브 id 그대로
    const d = (a: string, b: string) => decideTranscendent([{ category: a as never }, { category: b as never }], [])!.name;
    expect([d('special', 'mixed'), d('mixed', 'special')]).toEqual(['유하바하', '유하바하']);
    expect(d('mixed', 'mixed')).toBe('태초');
    expect([d('physical', 'mixed'), d('mixed', 'physical')]).toEqual(['Unknown;03398', 'Unknown;03398']);
    // 도감 상세 '얻는 조합' 글 = 데이터에서 자동
    expect(transcendentComboText(byId('yhwach').combo)).toBe('두 캐릭터 진화체 분류 특수 + 혼합');
    expect(transcendentComboText(byId('zero-sage').combo)).toBe('두 캐릭터 진화체 분류 혼합 + 혼합');
    expect(transcendentComboText(byId('rift-wanderer').combo)).toBe('두 캐릭터 진화체 분류 물리 + 혼합');
  });

  it('실제 합체 6가지(양 순서) → 그 초월자 · 합체 창 미리보기 같음', () => {
    for (const t of TRANSCENDENTS) {
      for (const [a, b] of [[t.combo[0], t.combo[1]], [t.combo[1], t.combo[0]]]) {
        const s = ready(`t4:fire:${a}`, `t4:water:${b}`);
        expect(fusionPreview(s).def!.id).toBe(t.id);
        const r = performFusion(s, 9000);
        expect(r.ok && r.def.id).toBe(t.id);
      }
    }
  });
});

describe('초월 특성 (GDD 12-4 v6.039)', () => {
  const saved = new Map<string, TranscendentTraitEffect>();
  afterEach(() => { for (const [id, fx] of saved) byId(id).trait.effect = fx; saved.clear(); });
  const fill = (id: string, fx: TranscendentTraitEffect) => { if (!saved.has(id)) saved.set(id, byId(id).trait.effect); byId(id).trait.effect = fx; };

  it('데이터: 6종 모두 자리만 — 이름 \'초월 특성 (미정)\'·설명 \'사용자가 정하는 중\'·효과 없음·provisional', () => {
    for (const t of TRANSCENDENTS) {
      expect(t.trait.name).toBe('초월 특성 (미정)');
      expect(t.trait.description).toBe('사용자가 정하는 중');
      expect(t.trait.effect).toEqual({});
      expect(t.trait.provisional).toBe(true);
    }
    const base = { id: 'x', order: 1, name: 'x', concept: '', combo: ['physical', 'physical'], trackKind: 'transcendent', provisional: true };
    expect(() => parseTranscendent(base)).toThrow(); // 초월 특성 칸 필수
    expect(() => parseTranscendent({ ...base, trait: { name: 'a', description: '', effect: { abilities: { 'bad': 1 } } } })).toThrow();
    expect(() => parseTranscendent({ ...base, trait: { name: 'a', description: '', effect: { maxHp: 0.1, abilities: { 'el:fire': 1 } } } })).not.toThrow();
  });

  it('합체하면 그 초월자의 초월 특성 1개 · 캐릭터 트랙엔 없음 · 상태 줄 = 효과 없음', () => {
    const s = ready();
    const r = performFusion(s, 9000);
    expect(r.ok).toBe(true);
    expect(s.evolution.transcendentTraits).toEqual([s.transcendentId]);
    const list = transcendentTraitsOf(s.evolution);
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ id: s.transcendentId, name: '초월 특성 (미정)', empty: true });
    expect(characterTracks(s).every((t) => !t.evolution.transcendentTraits)).toBe(true);
  });

  it('전투 기반을 바꿔도 초월 특성은 그대로 (기반 특성은 바뀜) · 저장·불러오기 유지', () => {
    const s = ready();
    performFusion(s, 9000);
    const id = s.transcendentId!;
    for (const key of [other('hollow'), 'hollow', TRANSCENDENT_BASIS]) {
      expect(switchCombatBasis(s, key, 9100).ok).toBe(true);
      expect(s.evolution.transcendentTraits).toEqual([id]);
    }
    switchCombatBasis(s, other('hollow'), 9200);
    expect(s.evolution.abilities!.owned).toEqual({ 'el:water': 2 }); // 기반 특성은 기반을 따라감
    const m = migrateSave(JSON.parse(JSON.stringify(s)))!;
    expect(m.evolution.transcendentTraits).toEqual([id]);
    // 깨진 값 보정: 모르는 id 는 빼고 자기 초월 특성은 늘 있다
    const raw = JSON.parse(JSON.stringify(s)) as SaveData;
    raw.evolution.transcendentTraits = ['nope', 7 as never];
    expect(migrateSave(raw)!.evolution.transcendentTraits).toEqual([id]);
  });

  it('효과 데이터를 채우면 전투에 실린다(기반과 상관없이) — 테스트용 가짜 데이터', () => {
    const s = ready();
    performFusion(s, 9000);
    const id = s.transcendentId!;
    const before = paramsOf(s);
    fill(id, { maxHp: 0.5, dealt: 0.2, abilities: { 'el4:fire': 1 } });
    for (const key of [TRANSCENDENT_BASIS, other('hollow'), 'hollow']) {
      switchCombatBasis(s, key, 9100);
      const p = paramsOf(s);
      expect(p.playerMaxHp!).toBeGreaterThan(before.playerMaxHp ?? 0);
      expect(p.abilityEffects?.mutation?.dealt ?? 0).toBeGreaterThanOrEqual(0.2);
      expect(combatAbilitiesOf(s.evolution).elements.some((e) => e.element === 'fire' && e.tier4)).toBe(true);
    }
    // 최대 체력 배율: 같은 기반에서 채우기 전·후 비교
    switchCombatBasis(s, TRANSCENDENT_BASIS, 9300);
    const filled = paramsOf(s).playerMaxHp!;
    fill(id, {});
    const empty = paramsOf(s).playerMaxHp ?? BALANCE.provisional.combat.playerMaxHp;
    expect(filled / empty).toBeCloseTo(1.5);
    expect(transcendentTraitsOf(s.evolution)[0]!.empty).toBe(true);
  });

  it('형식 84: 83 → 84 = 이미 있는 초월자 트랙에 초월 특성 칸 (쉬는 트랙 포함), 캐릭터 트랙엔 없음', () => {
    expect(SAVE_FORMAT_VERSION).toBe(87);
    const s = ready();
    performFusion(s, 9000);
    testGrantTranscendent(s, 'zero-sage', 9500); // 두 번째 초월자 트랙 (지금 트랙이 됨)
    const raw = JSON.parse(JSON.stringify(s)) as SaveData;
    raw.meta.format = 83;
    for (const t of allTracks(raw)) delete t.evolution.transcendentTraits;
    const m = migrateSave(raw)!;
    expect(m.meta.format).toBe(87);
    const tr = allTracks(m).filter((t) => t.transcendentId);
    expect(tr).toHaveLength(2);
    for (const t of tr) expect(t.evolution.transcendentTraits).toEqual([t.transcendentId]);
    expect(characterTracks(m).every((t) => t.evolution.transcendentTraits === undefined)).toBe(true);
  });

  it('엔진은 데이터만 읽는다 (초월자 id 분기 없음)', () => {
    for (const p of ['src/engine/evolution/evolution.ts', 'src/ui/evolutionPanel.ts', 'src/ui/lcdScreens.ts']) {
      expect(read(p)).not.toMatch(/'yhwach'|'aizen'|'ichigo'|'iron-tyrant'|'zero-sage'|'rift-wanderer'/);
    }
  });
});

describe('특성·블록 이름이 전투 기반을 따라감', () => {
  it('상태·빌드·전투가 같은 특성 묶음(기반 진화체) — 기반 바꾸면 속성 특성이 바뀜', () => {
    const s = ready();
    performFusion(s, 9000);
    switchCombatBasis(s, other('hollow'), 9100);
    s.evolution.abilities!.equipped = ['el:water'];
    expect(combatAbilitiesOf(s.evolution).elements.map((e) => e.element)).toEqual(['water']);
    expect(tryGetForm(combatEvolutionOf(s.evolution).formId!)!.label.category).toBe('special');
    switchCombatBasis(s, 'hollow', 9200);
    s.evolution.abilities!.equipped = ['el:fire'];
    expect(combatAbilitiesOf(s.evolution).elements.map((e) => e.element)).toEqual(['fire']);
    switchCombatBasis(s, other('hollow'), 9300);
    expect(combatAbilitiesOf(s.evolution).elements.map((e) => e.element)).toEqual(['water']); // 기반별로 따로 남음
  });

  it('전투 화면 블록 이름 = 기반 종족 설정의 계열 약어 (트랙 종족이 아니라)', () => {
    const s = ready();
    performFusion(s, 9000);
    const sh = other('hollow');
    switchCombatBasis(s, sh, 9100);
    expect(s.factionId).not.toBe(sh); // 트랙(바탕) 종족은 그대로
    const bf = getFaction(combatFactionIdOf(s));
    expect(bf.id).toBe(sh);
    const fam = bf.families[0]!;
    expect(skillBlockLabel(battleLabels(bf), fam.id, 'attack')).toBe(fam.abbr);
    // 전투 화면이 기반 종족으로 이름을 읽는다 (호출부 전부 battleBasis 로)
    const bv = read('src/ui/battleView.ts');
    expect(bv).toContain('const bf = opts.combatFaction ?? faction;');
    expect(bv).toContain('blockName(b, labels, bf.id, s.params)');
    expect(bv).toContain('...battleLabels(bf,');
    const app = read('src/ui/app.ts');
    expect(app).not.toMatch(/formId: s(ave\?|0)\.evolution\.formId/);
    expect((app.match(/battleBasis\(/g) ?? []).length).toBeGreaterThanOrEqual(8);
    expect(FACTIONS.length).toBeGreaterThanOrEqual(2);
  });
});
