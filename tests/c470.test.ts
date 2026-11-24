// C.470 (GDD v6.096 8-5·14·15-2): 아쥬커스(호로 3단계) 진화체 = 능력치별 모델 6 + 히든 2, 속성 = 색 변형 · 진화체 도감 모델별 칸 · 도감 그림 = 실제 진화체 그림
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { BALANCE } from '../src/config/balance';
import { tryGetForm } from '../src/data/evolution';
import { FACTIONS } from '../src/data/factions';
import type { StatId } from '../src/data/schema';
import { evolve, formDisplayName, zeroStats } from '../src/engine/evolution';
import { cellName, foundVariants, lookCellOf, lookCellOfSkin, lookCells, lookDexKey, lookSkinOf, lookUnitName, lookUnitTable, lookVariantOf } from '../src/engine/evolution/lookDex';
import { parseFactionConfig } from '../src/engine/faction';
import { setCustomStats, setForm, fillAllUnlocked } from '../src/engine/testMode';
import { migrateLookDex, migrateSave, newSaveData, performEvolution, SAVE_FORMAT_VERSION, SAVE_MIGRATIONS } from '../src/game';
import { dexEntriesOfTier, dexLookOf } from '../src/ui/dexView';

const hollow = FACTIONS.find((f) => f.id === 'hollow')!;
const shin = FACTIONS.find((f) => f.id === 'shinigami')!;
const evOf = (o: Partial<Record<StatId, number>>) => ({ ...zeroStats(), ...o });

/** 1 → 2 → 3단계 (3단계 진화 순간 노력치 ev, equip = 노멀 강화 1 → 노멀 진화체 / 아니면 장착 없음 → 망한 진화체) */
function evolveTo3(ev: Partial<Record<StatId, number>>, equip = true) {
  const save = newSaveData('hollow', 1);
  const e = save.evolution;
  const need = BALANCE.provisional.evolution.stepsNeeded;
  e.steps = need[0]!;
  expect(evolve(e, save.build, { factionId: 'hollow', hunger: 30, condition: 80, rebirths: 0 }, 1).ok).toBe(true);
  e.ev = evOf(ev);
  e.steps = need[1]!;
  if (equip) save.build.enhance = { ...(save.build.enhance ?? {}), normal: 1 }; // 노멀 강화 1 = 장착으로 본다 (망한 진화체 아님)
  const r = performEvolution(save, 2);
  expect(r.ok).toBe(true);
  return { save, r };
}

describe('C.470 아쥬커스 진화체 = 능력치별 모델 (GDD 8-5 v6.096)', () => {
  it('종족 설정: 호로 3단계만 모델 단위(lookUnit), 사신은 없음 — 칸 = 능력치 모델 6 + 히든 2', () => {
    expect(lookUnitTable(hollow, 3)?.lookUnit?.name).toBe('{model} {tier}');
    expect(lookUnitTable(hollow, 2)).toBeNull();
    for (const t of [2, 3, 4]) expect(lookUnitTable(shin, t)).toBeNull();
    const cells = lookCells(hollow, 3);
    expect(cells.map((c) => c.key)).toEqual(['carapace', 'stag', 'rhino', 'wyrm', 'panther', 'scorpion', 'h3:fail', 'h3:passage']);
    expect(cells.filter((c) => c.hidden).map((c) => c.model)).toEqual(['wraith', 'wraith']);
    // 모델 칸의 색 변형 = 일반 3단계 진화체 5개(노멀·물·불·흙·뇌), 히든 칸 = 그 진화체 하나
    expect(cells[0]!.forms.map((f) => lookVariantOf(lookUnitTable(hollow, 3)!, f))).toEqual(['normal', 'water', 'fire', 'earth', 'thunder']);
    expect(cells[6]!.forms.map((f) => f.id)).toEqual(['h3:fail']);
  });

  it('이름 = 모델 이름 + 아쥬커스, 히든 칸은 진화체 이름 그대로', () => {
    const names = lookCells(hollow, 3).map((c) => cellName(hollow, c));
    expect(names.slice(0, 6)).toEqual(['가시형 아쥬커스', '뱀형 아쥬커스', '외팔형 아쥬커스', '거미형 아쥬커스', '속도형 아쥬커스', '짐승형 아쥬커스']);
    expect(new Set(names).size).toBe(8);
    const water = tryGetForm('t3:water')!;
    expect(lookUnitName(hollow, water, 'wyrmwater')).toBe('거미형 아쥬커스');
    expect(lookUnitName(hollow, water, 'wyrm')).toBeNull(); // 색이 진화체와 안 맞는 외형은 모른다
    expect(lookUnitName(hollow, tryGetForm('h3:fail')!, 'wraith')).toBeNull();
    expect(lookUnitName(shin, water, 'wyrmwater')).toBeNull();
  });

  it('진화: 노력치 1위로 모델, 속성은 색 — 상태 이름·런 로그 외형·도감 발견 기록', () => {
    const { save, r } = evolveTo3({ spr: 9 });
    expect(r.ok && r.form.id).toBe('t3:normal'); // 장착 없음 = 노멀 (엔진 판정 그대로)
    expect(save.evolution.look).toBe('wyrm');
    expect(formDisplayName(save.evolution, 'hollow')).toBe('거미형 아쥬커스');
    const rec = save.runLog.tiers.evolutions.at(-1)!;
    expect(rec.toFormId).toBe('t3:normal');
    expect(rec.look).toBe('wyrm');
    expect(save.lookDex).toEqual(['wyrm@t3:normal']);
    expect(save.formDex).toContain('t3:normal'); // 속성 진화체 기록·엔진 규칙은 그대로
  });

  it('망한 진화체 = 히든 칸(부유형), 이름은 진화체 이름 그대로', () => {
    const { save, r } = evolveTo3({ atk: 9 }, false);
    expect(r.ok && r.form.id).toBe('h3:fail');
    expect(save.evolution.look).toBe('wraith');
    expect(save.lookDex).toEqual(['wraith@h3:fail']);
    expect(formDisplayName(save.evolution, 'hollow')).toBe(hollow.tierNames[0]);
  });

  it('사신 3단계는 지금처럼 진화체 이름 · 도감 발견 기록 없음', () => {
    const save = newSaveData('shinigami', 1);
    const e = save.evolution;
    const need = BALANCE.provisional.evolution.stepsNeeded;
    e.steps = need[0]!;
    expect(evolve(e, save.build, { factionId: 'shinigami', hunger: 30, condition: 80, rebirths: 0 }, 1).ok).toBe(true);
    e.ev = evOf({ spr: 9 });
    e.steps = need[1]!;
    const r = performEvolution(save, 2);
    expect(r.ok).toBe(true);
    expect(save.lookDex).toEqual([]);
    expect(formDisplayName(save.evolution, 'shinigami')).not.toContain('형 ');
    expect(save.runLog.tiers.evolutions.at(-1)!.look ?? null).toBeNull();
  });

  it('테스트 모드: 진화체·능력치를 고르면 그 모델·색이 발견된다', () => {
    const s = newSaveData('hollow', 1);
    setCustomStats(s, { spr: 300 });
    expect(setForm(s, 't3:water')).toBe(true);
    expect(s.evolution.look).toBe('wyrmwater');
    expect(setForm(s, 't3:fire')).toBe(true);
    expect(s.lookDex).toEqual(expect.arrayContaining(['wyrm@t3:water', 'wyrm@t3:fire']));
    const wyrm = lookCells(hollow, 3).find((c) => c.model === 'wyrm')!;
    expect(foundVariants(wyrm, s.lookDex!).map((f) => f.id)).toEqual(['t3:water', 't3:fire']);
    fillAllUnlocked(s, 1);
    expect(s.lookDex!.length).toBe(6 * 5 + 2);
  });
});

describe('C.470 진화체 도감 (GDD 14 도감 v6.096)', () => {
  it('호로 아쥬커스 = 모델 8칸, 다른 단계·사신은 진화체 칸 그대로', () => {
    expect(dexEntriesOfTier(hollow, 3).map((e) => (e.kind === 'cell' ? e.cell.key : e.form.id))).toHaveLength(8);
    expect(dexEntriesOfTier(hollow, 3).every((e) => e.kind === 'cell')).toBe(true);
    expect(dexEntriesOfTier(shin, 3).map((e) => (e.kind === 'form' ? e.form.id : '')).sort()).toEqual(['h3:fail', 'h3:passage', 't3:earth', 't3:fire', 't3:normal', 't3:thunder', 't3:water']);
    // C.516 (GDD 8-5 v6.154, 사용자 2026-11-21): 바시오(t4:kyo:mixed) 삭제 — 도감에서 숨김(이미 발견했으면 보인다). 옛 기대 = 28
    expect(dexEntriesOfTier(hollow, 4)).toHaveLength(27);
    expect(dexEntriesOfTier(hollow, 4, new Set(['t4:kyo:mixed']))).toHaveLength(28);
    expect(dexEntriesOfTier(hollow, 2)).toHaveLength(1);
  });

  it('카드 그림 = 실제 게임 외형: 호로 2단계 = 길리안, 아쥬커스 모델·색 = 그 스킨, 표 없는 단계 = 단계 그림(null)', () => {
    expect(dexLookOf(hollow, tryGetForm('t2:base')!)).toBe('gillian');
    expect(dexLookOf(hollow, tryGetForm('t4:fire:physical')!)).toBeNull(); // 아란칼 외형은 아란칼화를 깬 뒤에만
    expect(dexLookOf(shin, tryGetForm('t2:base')!)).toBeNull();
    const t = lookUnitTable(hollow, 3)!;
    expect(lookSkinOf(t, 'wyrm', tryGetForm('t3:thunder')!)).toBe('wyrmthunder');
    expect(lookSkinOf(t, 'wyrm', tryGetForm('t3:normal')!)).toBe('wyrm');
    expect(lookCellOf(hollow, tryGetForm('h3:passage')!, 'wraith')?.key).toBe('h3:passage');
  });
});

describe('C.470 세이브 형식 91 — lookDex 마이그레이션', () => {
  it('형식 91, 90 → 91 변환이 있다', () => {
    expect(SAVE_FORMAT_VERSION).toBe(96);
    expect(typeof SAVE_MIGRATIONS[90]).toBe('function');
  });

  it('지금 트랙 외형(wyrmwater) + 진화체로 모델·색 복원, 히든은 formDex 로, 지난 진화(외형 없음)는 속성만', () => {
    const s = newSaveData('hollow', 1);
    s.evolution.tierIndex = 2;
    s.evolution.formId = 't3:water';
    s.evolution.look = 'wyrmwater';
    s.formDex = ['t2:base', 't3:fire', 't3:water', 'h3:fail'];
    delete s.lookDex;
    s.meta.format = 90;
    const m = migrateSave(JSON.parse(JSON.stringify(s)))!;
    expect(m.meta.format).toBe(SAVE_FORMAT_VERSION);
    expect([...m.lookDex!].sort()).toEqual(['wraith@h3:fail', 'wyrm@t3:water']);
    expect(m.formDex).toEqual(['t2:base', 't3:fire', 't3:water', 'h3:fail']); // 속성 기록은 그대로 (불 = 모델 미발견)
  });

  it('외형과 진화체 색이 안 맞거나 모르는 외형이면 모델은 미발견, 다른 트랙도 본다', () => {
    const s = newSaveData('hollow', 1);
    s.evolution.tierIndex = 2;
    s.evolution.formId = 't3:fire';
    s.evolution.look = 'wyrmwater';
    s.lookDex = undefined;
    migrateLookDex(s);
    expect(s.lookDex).toEqual([]);
    expect(lookCellOfSkin(hollow, 3, 'scorpionearth')?.model).toBe('scorpion');
    expect(lookCellOfSkin(hollow, 3, 'nope')).toBeNull();
  });
});

describe('C.470 종족 분기 없음', () => {
  it('새 코드에 종족 id 문자열이 없다', () => {
    for (const f of ['src/engine/evolution/lookDex.ts', 'src/ui/dexView.ts']) {
      const src = readFileSync(f, 'utf8');
      expect(src, f).not.toMatch(/['"](hollow|shinigami)['"]/);
    }
  });
  it('lookUnit 은 종족 설정 검증을 통과하고, 잘못된 모양은 막힌다', () => {
    const raw = JSON.parse(readFileSync('src/data/factions/hollow.json', 'utf8'));
    expect(() => parseFactionConfig(raw)).not.toThrow();
    raw.tierLooks['3'].lookUnit = { name: 3 };
    expect(() => parseFactionConfig(raw)).toThrow();
  });
});
