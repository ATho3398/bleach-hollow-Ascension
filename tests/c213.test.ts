// C.213 (GDD 136장): 희귀 특성 삭제 · '한계 돌파' 표시 문구 교체 · 출발 화면 배치판
import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { ENEMIES } from '../src/data/enemies';
import { TRAITS, retiredRareElement, traitName } from '../src/data/traits';
import { convertRetiredRareTraits, newBuild } from '../src/engine/absorb';
import { createExpedition, restoreExpedition, serializeExpedition } from '../src/engine/expedition';
import { loadSave, migrateSave, newSaveData, sanitizeDeck, SAVE_FORMAT_VERSION, SAVE_MIGRATIONS, writeSave, type SaveData } from '../src/game';

describe('136장 1: 희귀 특성 삭제', () => {
  it('희귀 특성·희귀 개체 데이터가 없다', () => {
    expect(TRAITS.filter((t) => /-rare$/.test(t.id))).toEqual([]);
    expect(TRAITS.some((t) => 'rare' in t)).toBe(false);
    expect(ENEMIES.some((e) => 'rareChance' in e || 'rare' in e)).toBe(false);
  });
  it('옛 id 는 속성으로 읽고, 런 로그 옛 기록 이름은 깨지지 않는다', () => {
    expect(retiredRareElement('t-fire-rare')).toBe('fire');
    expect(retiredRareElement('t-kyo-rare')).toBe('kyo');
    expect(retiredRareElement('t-fire-a')).toBeNull();
    expect(retiredRareElement('t-nope-rare')).toBeNull();
    expect(traitName('t-water-rare', 'shinigami')).toBe('물 강화(옛 기록)');
  });
  it('convertRetiredRareTraits: 보유·슬롯·장착 순서에서 빼고 같은 속성 강화 +1', () => {
    const b = newBuild();
    b.owned = ['t-fire-a', 't-fire-rare', 't-water-rare'];
    b.slots = ['t-fire-rare', 't-fire-a', 't-water-rare'];
    b.equipOrder = ['t-fire-a', 't-fire-rare', 't-water-rare'];
    b.enhance = { fire: 3 };
    expect(convertRetiredRareTraits(b)).toBe(2);
    expect(b.owned).toEqual(['t-fire-a']);
    expect(b.slots).toEqual([null, 't-fire-a', null]);
    expect(b.equipOrder).toEqual(['t-fire-a']);
    expect(b.enhance).toEqual({ fire: 4, water: 1 });
  });
});

describe('136장 1: 형식 55 → 56 마이그레이션 (옛 세이브 이어 쓰기)', () => {
  /** 형식 55 세이브: 희귀 특성을 가진 빌드·쉬는 트랙·진행 중 원정 */
  const v55 = (): Record<string, unknown> => {
    const s = newSaveData('hollow', 1000);
    s.build.owned = ['t-earth-a', 't-earth-rare'];
    s.build.slots = ['t-earth-a', 't-earth-rare', null];
    s.build.equipOrder = ['t-earth-a', 't-earth-rare'];
    s.build.enhance = { earth: 2 };
    s.runLog.absorbs.push({ runId: 1, enemyId: 'x', element: 'earth', rare: true, absorbed: true, traitId: 't-earth-rare', lap: 1 } as never);
    const raw = JSON.parse(JSON.stringify(s));
    raw.meta.format = 55;
    return raw;
  };
  it('단계 표에 55 가 있고 형식은 56', () => {
    expect(SAVE_FORMAT_VERSION).toBe(60); // C.226 · C.225
    expect(typeof SAVE_MIGRATIONS[55]).toBe('function');
  });
  it('가진 희귀 특성 → 같은 속성 강화 1단계, 다른 값과 런 로그 옛 기록은 그대로', () => {
    const m = migrateSave(v55())!;
    expect(m).not.toBeNull();
    expect(m.meta.format).toBe(SAVE_FORMAT_VERSION);
    expect(m.build.owned).toEqual(['t-earth-a']);
    expect(m.build.slots).toEqual(['t-earth-a', null, null]);
    expect(m.build.equipOrder).toEqual(['t-earth-a']);
    expect(m.build.enhance).toEqual({ earth: 3 });
    expect(m.runLog.absorbs.at(-1)).toMatchObject({ traitId: 't-earth-rare', rare: true });
  });
  it('형식 54 세이브도 54 → 55 → 56 으로 이어서 연다', () => {
    const raw = v55();
    (raw.meta as { format: number }).format = 54;
    const m = migrateSave(raw)!;
    expect(m.meta.format).toBe(SAVE_FORMAT_VERSION);
    expect(m.build.enhance).toEqual({ earth: 3 });
  });
  it('쉬는 트랙도 바꾼다', () => {
    const raw = v55() as { otherTracks: unknown[] };
    const o = JSON.parse(JSON.stringify(newSaveData('shinigami', 1000)));
    o.build.owned = ['t-kyo-rare'];
    o.build.slots = ['t-kyo-rare', null, null];
    raw.otherTracks = [{ factionId: 'shinigami', nest: o.nest, build: o.build, evolution: o.evolution, formDex: o.formDex, tiles: o.tiles, runLog: o.runLog, titles: o.titles, activeExpedition: null, rank: o.rank, training: o.training, skin: null, rebirth: o.rebirth, wear: o.wear, difficulty: o.difficulty, tower: o.tower, parkedAt: 1000 }];
    const m = migrateSave(raw)!;
    expect(m.otherTracks[0]!.build.owned).toEqual([]);
    expect(m.otherTracks[0]!.build.enhance).toEqual({ kyo: 1 });
  });
  it('진행 중 원정: 빌드·얻은 특성·제단 강화·흡수 후보에서 희귀 특성을 빼고 그대로 이어 간다', () => {
    const s = newSaveData('hollow', 1000);
    const e = createExpedition({ factionId: 'hollow', seed: 3, hunger: 60, condition: 80, deck: sanitizeDeck(s.tiles, 'hollow'), build: s.build, evolution: s.evolution });
    const snap = JSON.parse(JSON.stringify(serializeExpedition(e, 1, 1000)));
    snap.exp.build.owned = ['t-fire-a', 't-fire-rare'];
    snap.exp.build.slots = ['t-fire-a', 't-fire-rare', null];
    snap.exp.lapStartSlots = ['t-fire-rare', null, null];
    snap.exp.acquiredTraits = [{ traitId: 't-fire-rare', lap: 1 }, { traitId: 't-fire-a', lap: 1 }];
    snap.exp.traitBoosts = { 't-fire-rare': 0.1 };
    const raw = v55() as Record<string, unknown>;
    raw.activeExpedition = snap;
    const m = migrateSave(raw)!;
    const x = (m.activeExpedition as unknown as { exp: Record<string, unknown> }).exp;
    expect((x.build as { owned: string[] }).owned).toEqual(['t-fire-a']);
    expect((x.build as { enhance: Record<string, number> }).enhance).toEqual({ fire: 1 });
    expect(x.lapStartSlots).toEqual([null, null, null]);
    expect(x.acquiredTraits).toEqual([{ traitId: 't-fire-a', lap: 1 }]);
    expect(x.traitBoosts).toEqual({});
    expect(restoreExpedition(m.activeExpedition!).ok).toBe(true);
  });
  it('저장소 왕복(loadSave)으로 열 수 있다', () => {
    const mem = new Map<string, string>();
    const st = { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, v), removeItem: (k: string) => void mem.delete(k) };
    writeSave(st, v55() as unknown as SaveData);
    const back = loadSave(st)!;
    expect(back.meta.format).toBe(SAVE_FORMAT_VERSION);
    expect(back.build.enhance).toEqual({ earth: 3 });
  });
});

describe("136장 2: '한계 돌파' 표시 문구 → 폭주(호로)·호로화(사신), 종족 설정에서 읽기", () => {
  /** src 아래 파일 (재귀) */
  const files = (dir: string): string[] => readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? files(p) : [p];
  });
  it("화면 문구(문자열·데이터)에 '한계 돌파' 가 없다 — 주석만 남는다", () => {
    const hits: string[] = [];
    for (const f of files('src').filter((p) => /\.(ts|json)$/.test(p))) {
      readFileSync(f, 'utf8').split('\n').forEach((line, i) => {
        if (!line.includes('한계 돌파')) return;
        const code = f.endsWith('.json') ? line : line.replace(/\/\/.*$/, '').replace(/\/\*.*?\*\//g, '');
        if (f.endsWith('.ts') && /^\s*(\*|\/\*)/.test(line)) return; // 블록 주석 줄
        if (code.includes('한계 돌파')) hits.push(`${f}:${i + 1}`);
      });
    }
    expect(hits).toEqual([]);
  });
  it('폭주 고유 특성·진화 힌트·외형 이름은 종족 설정 frenzyName', async () => {
    const { abilityNameByEffect, abilityTextName, uniqueAbility, formHint, FORM_TABLE } = await import('../src/data/evolution');
    const { getFaction } = await import('../src/data/factions');
    expect(abilityTextName(uniqueAbility('frenzy'), 'hollow')).toBe(`${getFaction('hollow').frenzyName} 본능`);
    expect(abilityTextName(uniqueAbility('frenzy'), 'shinigami')).toBe('호로화 본능');
    expect(abilityNameByEffect('desperate', 'hollow')).toBe('폭주 본능');
    const limit = (FORM_TABLE as readonly { label: { kind: string } }[]).find((f) => f.label.kind === 'frenzy');
    expect(limit).toBeDefined();
    expect(formHint(limit as never, 'shinigami')).toContain('호로화');
    const { SKINS } = await import('../src/data/skins');
    expect(SKINS.find((s) => s.id === 'arrhiddena')?.name).toBe('아란칼 폭주');
  });
});

describe('136장 3: 출발 화면 배치판 = 바퀴 끝 창과 같은 칸 비율 + 가로 밀기', () => {
  const css = readFileSync('src/ui/bha/expedition.css', 'utf8');
  it('출발 화면 길은 한 줄 가로 스크롤, 칸 60×80 (바퀴 끝 창과 같은 규칙)', () => {
    expect(css).toContain('.bha-sheet .bha-road, .bha-lcd .bha-plan .bha-road { display: flex; overflow-x: auto;');
    expect(css).toContain('.bha-sheet .bha-road__cell, .bha-lcd .bha-plan .bha-road__cell { flex: 0 0 60px; min-height: 0; height: 80px;');
    expect(css).not.toContain('.bha-lcd .bha-plan .bha-road__cell { min-height: 40px; }');
  });
  it('길도 마우스 끌기로 넘긴다 (dragScroll)', () => {
    expect(readFileSync('src/ui/bha/road.ts', 'utf8')).toContain('dragScroll(road);');
  });
});
