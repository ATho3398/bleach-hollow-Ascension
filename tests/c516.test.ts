// C.516 (GDD v6.154 허무 합침, 사용자 2026-11-21 "허무=공허로 합치고, 허무형은 적만 존재하고 블록흡수는 안되게 변경해. 능력치 흡수랑 풀어주기만 가능하고. 컨셉은 처형으로 유지하되, 용어는 허무로 가자."):
// ① 허(kyo) 속성 표시 = '허무' ② 허무 블록은 플레이어가 얻을 수 없다 ③ 허무 적 흡수 = 능력치만·놓아주기만 ④ 4단계 일반 허(t4:kyo:mixed) 판정에서 삭제 — 17종
// ⑤ 세이브 형식 95: 허무 블록 지우고 칸 비움, 허무 강화 → 노멀 강화(provisional), 바시오·허곡 몸·런 로그는 그대로
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ELEMENTS, ENEMY_ONLY_ELEMENT_IDS, PLAYER_ELEMENT_IDS, elementAbbr, elementName, isEnemyOnlyElement } from '../src/data/elements';
import { getEnemy } from '../src/data/enemies';
import { getBoss } from '../src/data/bosses';
import { FORM_TABLE, generateFormTable, getForm } from '../src/data/evolution';
import { getFaction } from '../src/data/factions';
import { TRAITS, getTrait, isPlayerTrait } from '../src/data/traits';
import { blocklessReason, buildOffer, dropEnemyOnlyTraits, gainTrait, newBuild, statAbsorbOnly, type BuildState } from '../src/engine/absorb';
import { createRng } from '../src/engine/rng';
import { chooseAbsorb, chooseRelease, createExpedition, offerElementsOf, rerollAbsorb, serializeExpedition, type ExpeditionState } from '../src/engine/expedition';
import { analyzeTree } from '../src/engine/evolution/analysis';
import { evolutionCandidates, tier3Element, tier4Normal } from '../src/engine/evolution/judge';
import { fillDefaultTraits, newTestSave, setForm, setTraitSlots } from '../src/engine/testMode';
import { blocklessLine } from '../src/ui/absorbView';
import { migrateSave, newSaveData, sanitizeDeck, SAVE_FORMAT_VERSION, SAVE_MIGRATIONS, MIN_LOADABLE_SAVE_FORMAT } from '../src/game';

const WON = { status: 'won', finisher: null, chain3Count: 0, weakChain3Count: 0 } as const;

/** 허무 적을 이긴 흡수 화면 */
function kyoAbsorb(seed = 1): ExpeditionState {
  const s = newSaveData('hollow', 1000);
  const exp = createExpedition({ factionId: 'hollow', seed, hunger: 60, condition: 80, deck: sanitizeDeck(s.tiles, 'hollow'), build: s.build, evolution: s.evolution });
  exp.absorbOffer = buildOffer(createRng(seed), getEnemy('kyo-basic'), exp.build, WON);
  exp.phase = 'absorb';
  return exp;
}

/** 슬롯에 바로 넣은 빌드 (gainTrait 를 거치지 않음 — 옛 세이브·판정 시험용) */
function rawBuild(slots: (string | null)[]): BuildState {
  const b = newBuild();
  b.slots = [...slots];
  b.owned = slots.filter((x): x is string => x !== null);
  b.equipOrder = [...b.owned];
  return b;
}

describe('① 허 속성 표시 = 허무 (데이터 키 kyo 그대로)', () => {
  it('속성 데이터: 이름·약어 허무, 적 전용 표시는 kyo 하나', () => {
    expect(elementName('kyo', 'hollow')).toBe('허무');
    expect(elementName('kyo', 'shinigami')).toBe('허무');
    expect(elementAbbr('kyo', 'hollow')).toBe('허무');
    expect(ENEMY_ONLY_ELEMENT_IDS).toEqual(['kyo']);
    expect(PLAYER_ELEMENT_IDS).not.toContain('kyo');
    expect(PLAYER_ELEMENT_IDS).toHaveLength(ELEMENTS.length - 1);
    expect(isEnemyOnlyElement('blood')).toBe(false);
  });
  it('공화 특수 블록 = 허무 블록 · 폭주 블록(옛 허 블록)·공허의 밤은 그대로', () => {
    const j = readFileSync('src/data/evolution/uniques.json', 'utf8');
    expect(j).toContain('"name": { "*": "허무 블록" }');
    expect(readFileSync('src/data/tiles/mutations.json', 'utf8')).toContain('공허의 밤');
  });
  it('두 글자 약어는 동그라미 대신 알약 (기존 토큰만)', () => {
    expect(readFileSync('src/ui/bha/element.ts', 'utf8')).toContain('bha-eldot--wide');
    expect(readFileSync('src/ui/bha/components/components.css', 'utf8')).toMatch(/\.bha-eldot--wide \{[^}]*var\(--bha-sp-1\)/);
  });
});

describe('② 허무 블록은 플레이어가 얻을 수 없다', () => {
  it('허무 특성 = 플레이어 특성 아님, gainTrait 가 거절', () => {
    const kyo = TRAITS.filter((t) => t.element === 'kyo');
    expect(kyo.length).toBeGreaterThan(0);
    for (const t of kyo) {
      expect(isPlayerTrait(t)).toBe(false);
      const r = gainTrait(newBuild(), t.id);
      expect(r.ok).toBe(false);
    }
    expect(gainTrait(newBuild(), 't-blood-a').ok).toBe(true);
  });
  it('보스 속성 바뀜 기믹의 허무도 후보에서 빠진다 (썬더우드: 천둥·물만, 허무 보스 특성 없음)', () => {
    const els = offerElementsOf('forest-lord', getBoss('forest-lord').enemy.element);
    for (let seed = 1; seed <= 30; seed++) {
      const o = buildOffer(createRng(seed), getBoss('forest-lord').enemy, newBuild(), WON, 2, getBoss('forest-lord').trait, 2, els);
      for (const id of o.candidates) expect(getTrait(id).element).not.toBe('kyo');
      expect(o.blockless).toBeUndefined();
    }
  });
  it('테스트 지급: 칸 직접 채우기·기본 특성 채우기 모두 허무를 넣지 않는다 (허무형 몸 포함)', () => {
    const save = newTestSave('shinigami', 1);
    expect(setTraitSlots(save, ['t-kyo-a', 't-water-a', null])).toEqual([null, 't-water-a', null]);
    const v = newTestSave('shinigami', 2);
    setForm(v, 'h4:void');
    fillDefaultTraits(v); // 허무형 몸: 허무 블록 대신 기본 속성(노멀 = 기본 블록)이라 칸은 비어 있을 수 있다
    for (const id of v.build.slots) if (id) expect(getTrait(id).element).not.toBe('kyo');
  });
});

describe('③ 허무 적 흡수 = 능력치만·놓아주기만', () => {
  it('흡수 화면: 후보 0, blockless (일반·강적 모두)', () => {
    for (const id of ['kyo-basic', 'kyo-swift', 'kyo-heavy-seal', 'kyo-stance']) {
      for (let seed = 1; seed <= 10; seed++) {
        const o = buildOffer(createRng(seed), getEnemy(id), newBuild(), WON, 2);
        expect(o.candidates, id).toEqual([]);
        expect(o.blockless).toBe(true);
        expect(statAbsorbOnly(o)).toBe(true);
      }
    }
    expect(buildOffer(createRng(1), getEnemy('blood-basic'), newBuild(), WON).blockless).toBeUndefined();
  });
  it('엔진: 둘 다·속성만·블록 지정·다시 뽑기 거절(이유 = 허무는 블록으로 흡수할 수 없다), 능력치만·놓아주기는 된다', () => {
    const exp = kyoAbsorb();
    const reason = '허무는 블록으로 흡수할 수 없다';
    expect(blocklessReason('kyo')).toBe(reason);
    expect(chooseAbsorb(exp, null, undefined, 'both')).toEqual({ ok: false, reason });
    expect(chooseAbsorb(exp, null, undefined, 'trait')).toEqual({ ok: false, reason });
    expect(chooseAbsorb(exp, 't-kyo-a', 0, 'both').ok).toBe(false);
    expect(rerollAbsorb(exp)).toEqual({ ok: false, reason });
    expect(exp.phase).toBe('absorb');
    const before = exp.evolution.elementAbsorbs.kyo ?? 0;
    expect(chooseAbsorb(exp, null, undefined, 'stat').ok).toBe(true);
    expect(exp.phase).toBe('moving');
    expect(exp.evolution.elementAbsorbs.kyo ?? 0).toBe(before); // 능력치만 = 속성 카운트 없음
    expect(exp.build.enhance?.kyo).toBeUndefined();
    expect(exp.absorbRecords.at(-1)).toMatchObject({ element: 'kyo', absorbed: true, traitId: null, mode: 'stat' });
    const rel = kyoAbsorb(2);
    expect(chooseRelease(rel).ok).toBe(true);
  });
  it('화면 이유 한 줄 = 종족 설정의 행위 이름 (포식 / 정화 흡수)', () => {
    const exp = kyoAbsorb();
    expect(blocklessLine(getFaction('hollow'), exp)).toBe('허무는 블록으로 포식할 수 없다');
    expect(blocklessLine(getFaction('shinigami'), exp)).toBe('허무는 블록으로 정화 흡수할 수 없다');
    exp.absorbOffer!.blockless = undefined;
    expect(blocklessLine(getFaction('hollow'), exp)).toBeNull();
    const src = readFileSync('src/ui/absorbView.ts', 'utf8');
    expect(src).toContain("b.dataset.blockless = '';");
    expect(src).toContain('b.disabled = true;');
  });
  it('봇(자동 원정)은 능력치만 흡수를 고른다', () => {
    expect(readFileSync('src/engine/expedition/bot.ts', 'utf8')).toContain("statAbsorbOnly(exp.absorbOffer)) chooseAbsorb(exp, null, undefined, 'stat')");
  });
});

describe('④ 진화: 4단계 일반 17종 (허 삭제), 혈·독 우선, 3단계 혈·독만 = 노멀', () => {
  it('t4:kyo:mixed 는 데이터만 남고(retired) 일반 4단계는 17종 · 생성기도 같게', () => {
    expect(getForm('t4:kyo:mixed').retired).toBe(true);
    expect(FORM_TABLE.filter((f) => f.tier === 4 && !f.hidden && !f.retired)).toHaveLength(17);
    expect(generateFormTable().find((f) => f.id === 't4:kyo:mixed')?.retired).toBe(true);
    expect(getForm('h4:void').elements).toEqual(['kyo']); // 히든 허무형은 그대로
  });
  it('허무 칸이 가장 많아도(옛 빌드) 바시오·허곡이 아니라 혈·독·원소로 간다', () => {
    const e = { ...newSaveData('hollow', 1).evolution, tierIndex: 2, formId: 't3:fire', formHistory: ['t2:base', 't3:fire'] };
    const ctx = (build: BuildState) => ({ factionId: 'hollow', build, hunger: 10, condition: 90 });
    expect(tier4Normal(e, ctx(rawBuild(['t-kyo-a', 't-kyo-b', 't-fire-a']))).id).not.toBe('t4:kyo:mixed');
    expect(tier4Normal(e, ctx(rawBuild(['t-kyo-a', 't-blood-a', 't-fire-a']))).id).toBe('t4:blood:physical');
    expect(tier4Normal(e, ctx(rawBuild(['t-poison-a', 't-poison-b', 't-fire-a']))).id).toBe('t4:poison:special');
    expect(evolutionCandidates(e, ctx(rawBuild(['t-kyo-a', 't-kyo-b', null]))).normal.id).not.toBe('t4:kyo:mixed');
  });
  it('3단계: 혈·독만 장착이면 노멀', () => {
    expect(tier3Element(rawBuild(['t-blood-a', 't-poison-a', null]))).toBe('normal');
  });
  it('진화 트리 점검: 판정에서 빠진 진화체는 도달 점검 대상이 아니다', () => {
    const rep = analyzeTree(FORM_TABLE, 'hollow', 300, 7);
    expect(rep.picked['t4:kyo:mixed']).toBeUndefined();
    expect(rep.unreachable).not.toContain('t4:kyo:mixed');
  });
});

describe('⑤ 세이브 형식 95 (94 → 95): 허무 블록 지우고 칸 비움, 허무 강화 → 노멀', () => {
  it('형식 95 · 변환 있음 · 문턱 87 그대로', () => {
    expect(SAVE_FORMAT_VERSION).toBe(95);
    expect(typeof SAVE_MIGRATIONS[94]).toBe('function');
    expect(MIN_LOADABLE_SAVE_FORMAT).toBe(87);
  });
  it('dropEnemyOnlyTraits: 장착·보유·장착 순서에서 빼고, 강화 n → 노멀 +n', () => {
    const b = rawBuild(['t-kyo-a', 't-fire-a', 'boss-forest-lord']);
    b.owned.push('t-kyo-b');
    b.enhance = { kyo: 4, normal: 2, fire: 1 };
    expect(dropEnemyOnlyTraits(b)).toBe(3);
    expect(b.slots).toEqual([null, 't-fire-a', null]);
    expect(b.owned).toEqual(['t-fire-a']);
    expect(b.equipOrder).toEqual(['t-fire-a']);
    expect(b.enhance).toEqual({ normal: 6, fire: 1 });
  });
  it('옛 세이브(94): 허무 블록 장착한 바시오 몸 — 블록만 빠지고 몸·런 로그·쉬는 트랙·원정 중간 저장도 정리', () => {
    const s = newSaveData('hollow', 1000);
    s.build = rawBuild(['t-kyo-a', 't-water-a', null]);
    s.build.owned.push('t-kyo-c');
    s.build.enhance = { kyo: 3, water: 1 };
    s.evolution.tierIndex = 3;
    s.evolution.formId = 't4:kyo:mixed';
    s.evolution.formHistory = ['t2:base', 't3:normal', 't4:kyo:mixed'];
    s.formDex = [...s.formDex, 't4:kyo:mixed'];
    s.runLog.absorbs.push({ runId: 'r1', enemyId: 'kyo-basic', element: 'kyo', rare: false, absorbed: true, traitId: 't-kyo-a', lap: 1 } as never);
    const e = createExpedition({ factionId: 'hollow', seed: 3, hunger: 60, condition: 80, deck: sanitizeDeck(s.tiles, 'hollow'), build: s.build, evolution: s.evolution });
    e.absorbOffer = { ...buildOffer(createRng(1), getEnemy('blood-basic'), e.build, WON), element: 'kyo', candidates: ['t-kyo-b'] };
    delete e.absorbOffer.blockless;
    e.phase = 'absorb';
    s.activeExpedition = JSON.parse(JSON.stringify(serializeExpedition(e, 1, 1000)));
    const o = JSON.parse(JSON.stringify(newSaveData('shinigami', 1000)));
    o.build.owned = ['t-kyo-a'];
    o.build.slots = ['t-kyo-a', null, null];
    o.build.enhance = { kyo: 2 };
    s.otherTracks = [{ ...o, parkedAt: 1000 }];
    s.meta.format = 94;
    const m = migrateSave(JSON.parse(JSON.stringify(s)))!;
    expect(m).not.toBeNull();
    expect(m.meta.format).toBe(95);
    expect(m.build.slots).toEqual([null, 't-water-a', null]);
    expect(m.build.owned).toEqual(['t-water-a']);
    expect(m.build.enhance).toEqual({ normal: 3, water: 1 });
    expect(m.evolution.formId).toBe('t4:kyo:mixed'); // 이번 생 동안 몸은 그대로
    expect(m.formDex).toContain('t4:kyo:mixed');
    expect(m.runLog.absorbs.at(-1)).toMatchObject({ element: 'kyo', traitId: 't-kyo-a' }); // 런 로그는 지우지 않는다
    expect(m.otherTracks[0]!.build.slots).toEqual([null, null, null]);
    expect(m.otherTracks[0]!.build.enhance).toEqual({ normal: 2 });
    const ex = m.activeExpedition!.exp;
    expect(ex.build.slots).toEqual([null, 't-water-a', null]);
    expect(ex.absorbOffer!.candidates).toEqual([]);
    expect(ex.absorbOffer!.blockless).toBe(true);
  });
});
