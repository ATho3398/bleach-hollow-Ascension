// C.516 (GDD v6.154 허무 합침, 사용자 2026-11-21 "허무=공허로 합치고, 허무형은 적만 존재하고 블록흡수는 안되게 변경해. 능력치 흡수랑 풀어주기만 가능하고. 컨셉은 처형으로 유지하되, 용어는 허무로 가자."):
// ① 허(kyo) 속성 표시 = '허무' ② 허무 블록은 플레이어가 얻을 수 없다 ③ 허무 적 흡수 = 능력치만·놓아주기만 ④ 4단계 일반 허(t4:kyo:mixed) 판정에서 삭제 — 17종
// ⑤ 세이브 형식 95: 허무 블록 지우고 칸 비움, 허무 강화 → 노멀 강화(provisional), 바시오·허곡 몸·런 로그는 그대로
//
// C.531 (GDD 8-8 v6.160~v6.168, 사용자 2026-11-23 "잘들어. 허무도 흡수 가능해. 허무기본블록 나오고…" · 2026-11-24 "재설계는 지금 해."): ②·③·⑤ 는 사용자가 번복했다.
// 이 파일의 ②·③·⑤ 기대값을 번복된 규칙으로 바꿨다(지우지 않음 — 줄마다 옛 기대값을 적는다). ①(표기 '허무')·④(허무 일반 진화체 없음)는 그대로.
// '적 전용 속성' 장치(enemyOnly·blockless)는 코드에 남아 있고(지금 켠 속성 없음) 손으로 만든 흡수 화면으로 계속 지킨다. 새 규칙 전체는 tests/c531.test.ts
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
  it('속성 데이터: 이름·약어 허무 (C.531: 적 전용 표시는 없다 — 옛 kyo 하나)', () => {
    expect(elementName('kyo', 'hollow')).toBe('허무');
    expect(elementName('kyo', 'shinigami')).toBe('허무');
    expect(elementAbbr('kyo', 'hollow')).toBe('허무');
    // C.531: 허무는 더 이상 적 전용이 아니다 — 옛 기대값 ENEMY_ONLY = ['kyo'], PLAYER 에 kyo 없음(길이 −1)
    expect(ENEMY_ONLY_ELEMENT_IDS).toEqual([]);
    expect(PLAYER_ELEMENT_IDS).toContain('kyo');
    expect(PLAYER_ELEMENT_IDS).toHaveLength(ELEMENTS.length);
    expect(isEnemyOnlyElement('kyo')).toBe(false);
    expect(isEnemyOnlyElement('blood')).toBe(false);
  });
  it('공화 특수 블록 = 허무 블록 · 폭주 블록(옛 허 블록)·공허의 밤은 그대로', () => {
    const j = readFileSync('src/data/evolution/uniques.json', 'utf8');
    // C.522 GDD v6.168: 공화 특수 블록 표시 이름 = '낙화 블록'(허무 블록 ≠ 공화 전용 블록) — 옛 기대 = '허무 블록'
    expect(j).toContain('"name": { "*": "낙화 블록" }');
    expect(readFileSync('src/data/tiles/mutations.json', 'utf8')).toContain('공허의 밤');
  });
  it('두 글자 약어는 동그라미 대신 알약 (기존 토큰만)', () => {
    expect(readFileSync('src/ui/bha/element.ts', 'utf8')).toContain('bha-eldot--wide');
    expect(readFileSync('src/ui/bha/components/components.css', 'utf8')).toMatch(/\.bha-eldot--wide \{[^}]*var\(--bha-sp-1\)/);
  });
});

describe('② 허무 블록 — C.531 번복: 다시 얻을 수 있다 (옛 "플레이어가 얻을 수 없다")', () => {
  it('허무 특성 = 플레이어 특성, gainTrait 가 받는다 (옛 기대값: isPlayerTrait false·gainTrait 거절)', () => {
    const kyo = TRAITS.filter((t) => t.element === 'kyo');
    expect(kyo.length).toBeGreaterThan(0);
    for (const t of kyo) {
      expect(isPlayerTrait(t)).toBe(true);
      expect(gainTrait(newBuild(), t.id).ok).toBe(true);
    }
    expect(gainTrait(newBuild(), 't-blood-a').ok).toBe(true);
  });
  // C.517 마스터 11-21: 썬더우드 보스 특성 속성 허무 → 뇌(provisional) — 보스 특성(뇌)은 확정 후보 그대로
  it('보스 속성 바뀜 기믹의 허무 블록도 다시 후보에 든다 (썬더우드: 뇌·허무·물 — 옛 기대값: 허무는 빠짐)', () => {
    const els = offerElementsOf('forest-lord', getBoss('forest-lord').enemy.element);
    let kyoSeen = 0;
    for (let seed = 1; seed <= 30; seed++) {
      const o = buildOffer(createRng(seed), getBoss('forest-lord').enemy, newBuild(), WON, 2, getBoss('forest-lord').trait, 2, els);
      for (const id of o.candidates) expect(['thunder', 'kyo', 'water']).toContain(getTrait(id).element);
      if (o.candidates.includes('t-kyo')) kyoSeen++;
      expect(o.blockless).toBeUndefined();
    }
    expect(kyoSeen).toBeGreaterThan(0);
  });
  it('테스트 지급: 칸 직접 채우기·기본 특성 채우기에 허무 블록을 넣을 수 있다 (옛 기대값: 허무를 넣지 않는다) · 옛 id 는 모르는 특성 = 빈칸', () => {
    const save = newTestSave('shinigami', 1);
    expect(setTraitSlots(save, ['t-kyo', 't-water-a', null])).toEqual(['t-kyo', 't-water-a', null]);
    expect(setTraitSlots(newTestSave('shinigami', 3), ['t-kyo-a', 't-water-a', null])).toEqual([null, 't-water-a', null]);
    const v = newTestSave('shinigami', 2);
    setForm(v, 'h4:void');
    fillDefaultTraits(v); // 허무형 몸: 허무 블록(전투에서는 그 진화체 오리지널 블록으로 바뀐다)
    expect(v.build.slots.filter((id) => id !== null).every((id) => TRAITS.some((t) => t.id === id))).toBe(true);
  });
});

describe('③ 허무 적 흡수 — C.531 번복: 다른 속성과 같다 (옛 "능력치만·놓아주기만") · 적 전용 장치(blockless)는 그대로 동작', () => {
  it('흡수 화면: 허무 블록 후보 1개, blockless 아님 (일반·강적 모두 — 옛 기대값: 후보 0·blockless)', () => {
    for (const id of ['kyo-basic', 'kyo-swift', 'kyo-heavy-seal', 'kyo-stance']) {
      for (let seed = 1; seed <= 10; seed++) {
        const o = buildOffer(createRng(seed), getEnemy(id), newBuild(), WON, 2);
        expect(o.candidates, id).toEqual(['t-kyo']);
        expect(o.blockless).toBeUndefined();
        expect(statAbsorbOnly(o)).toBe(false);
      }
    }
    expect(buildOffer(createRng(1), getEnemy('blood-basic'), newBuild(), WON).blockless).toBeUndefined();
  });
  it('엔진: 허무 적을 둘 다·속성만으로 흡수해 허무 블록·허무 강화를 얻는다 (옛 기대값: 거절) · 능력치만은 블록·속성 카운트 없음', () => {
    const exp = kyoAbsorb();
    expect(chooseAbsorb(exp, 't-kyo', undefined, 'both').ok).toBe(true);
    expect(exp.phase).toBe('moving');
    expect(exp.build.owned).toContain('t-kyo');
    expect(exp.build.enhance?.kyo).toBe(1);
    expect(exp.evolution.elementAbsorbs.kyo).toBe(1); // 허무형 조건 '허무 블록 흡수 수'
    expect(exp.absorbRecords.at(-1)).toMatchObject({ element: 'kyo', absorbed: true, traitId: 't-kyo' });
    const st = kyoAbsorb(3);
    const before = st.evolution.elementAbsorbs.kyo ?? 0;
    expect(chooseAbsorb(st, null, undefined, 'stat').ok).toBe(true);
    expect(st.evolution.elementAbsorbs.kyo ?? 0).toBe(before); // 능력치만 = 속성 카운트 없음
    expect(st.build.enhance?.kyo).toBeUndefined();
    const rr = kyoAbsorb(4);
    expect(rerollAbsorb(rr).ok).toBe(true); // 다시 뽑기도 된다 (후보는 허무 블록 1종 그대로)
    expect(rr.absorbOffer!.candidates).toEqual(['t-kyo']);
    const rel = kyoAbsorb(2);
    expect(chooseRelease(rel).ok).toBe(true);
  });
  it('적 전용 장치(지금 켠 속성 없음): blockless 흡수 화면이면 둘 다·속성만·블록 지정·다시 뽑기 거절, 능력치만은 된다', () => {
    const exp = kyoAbsorb();
    exp.absorbOffer!.blockless = true;
    exp.absorbOffer!.candidates = [];
    const reason = '허무는 블록으로 흡수할 수 없다';
    expect(blocklessReason('kyo')).toBe(reason);
    expect(chooseAbsorb(exp, null, undefined, 'both')).toEqual({ ok: false, reason });
    expect(chooseAbsorb(exp, null, undefined, 'trait')).toEqual({ ok: false, reason });
    expect(chooseAbsorb(exp, 't-kyo', 0, 'both').ok).toBe(false);
    expect(rerollAbsorb(exp)).toEqual({ ok: false, reason });
    expect(exp.phase).toBe('absorb');
    expect(chooseAbsorb(exp, null, undefined, 'stat').ok).toBe(true);
    expect(exp.absorbRecords.at(-1)).toMatchObject({ element: 'kyo', absorbed: true, traitId: null, mode: 'stat' });
  });
  it('화면 이유 한 줄 = 종족 설정의 행위 이름 (포식 / 정화 흡수) — blockless 화면에만 (허무 적 흡수 화면에는 없다, C.531)', () => {
    const exp = kyoAbsorb();
    expect(blocklessLine(getFaction('hollow'), exp)).toBeNull(); // 옛 기대값: '허무는 블록으로 포식할 수 없다'
    exp.absorbOffer!.blockless = true;
    expect(blocklessLine(getFaction('hollow'), exp)).toBe('허무는 블록으로 포식할 수 없다');
    expect(blocklessLine(getFaction('shinigami'), exp)).toBe('허무는 블록으로 정화 흡수할 수 없다');
    exp.absorbOffer!.blockless = undefined;
    expect(blocklessLine(getFaction('hollow'), exp)).toBeNull();
    const src = readFileSync('src/ui/absorbView.ts', 'utf8');
    expect(src).toContain("b.dataset.blockless = '';");
    expect(src).toContain('b.disabled = true;');
  });
  it('봇(자동 원정)은 능력치만·놓아주기만 화면이면 능력치만 흡수를 고른다', () => {
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
    // C.532 (GDD 8-5 v6.164, 사용자 2026-11-23): 혈·독은 장착 최다가 아니라 그 단계 합계 조건(그 속성 블록 10개 흡수 + 빈사로 귀환 / 독 지속 피해 처치 3회) — 옛 기대값 '장착 최다면 혈·독'
    expect(tier4Normal(e, ctx(rawBuild(['t-kyo-a', 't-blood-a', 't-fire-a']))).id).toBe('t4:fire:physical');
    expect(tier4Normal(e, ctx(rawBuild(['t-poison-a', 't-poison-b', 't-fire-a']))).id).toBe('t4:fire:physical');
    expect(tier4Normal({ ...e, elementAbsorbs: { blood: 10 }, collapsedReturns: 1 }, ctx(rawBuild(['t-kyo-a', 't-kyo-b', 't-fire-a']))).id).toBe('t4:blood:physical');
    expect(tier4Normal({ ...e, elementAbsorbs: { poison: 10 }, dotKills: { poison: 3 } }, ctx(rawBuild(['t-kyo-a', 't-kyo-b', 't-fire-a']))).id).toBe('t4:poison:special');
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

describe('⑤ 세이브 — C.531 번복: 94 → 95 는 허무를 지우지 않고, 95 → 96 이 옛 허무 조·탄·교를 허무 블록 하나로 합친다 (옛 "허무 블록 지우고 칸 비움, 허무 강화 → 노멀")', () => {
  it('형식 96 · 94·95 변환 있음 · 문턱 87 그대로', () => {
    expect(SAVE_FORMAT_VERSION).toBe(99);
    expect(typeof SAVE_MIGRATIONS[94]).toBe('function');
    expect(typeof SAVE_MIGRATIONS[95]).toBe('function');
    expect(MIN_LOADABLE_SAVE_FORMAT).toBe(87);
  });
  it('dropEnemyOnlyTraits: 지금은 적 전용 속성이 없어 아무것도 빼지 않는다 (옛 기대값: 허무 2개 빠짐·강화 kyo 4 → 노멀 +4)', () => {
    const b = rawBuild(['t-kyo', 't-fire-a', 'boss-forest-lord']);
    b.enhance = { kyo: 4, normal: 2, fire: 1 };
    expect(dropEnemyOnlyTraits(b)).toBe(0);
    expect(b.slots).toEqual(['t-kyo', 't-fire-a', 'boss-forest-lord']);
    expect(b.owned).toEqual(['t-kyo', 't-fire-a', 'boss-forest-lord']);
    expect(b.enhance).toEqual({ kyo: 4, normal: 2, fire: 1 });
  });
  it('옛 세이브(94): 허무 조·탄 장착한 바시오 몸 — 허무 블록 하나로 합쳐 이어 쓴다 · 몸·런 로그·쉬는 트랙·원정 중간 저장도', () => {
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
    expect(m.meta.format).toBe(99);
    // 옛 기대값(C.516): 칸 [null, 't-water-a', null] · 보유 ['t-water-a'] · 강화 { normal: 3, water: 1 }
    expect(m.build.slots).toEqual(['t-kyo', 't-water-a', null]);
    expect(m.build.owned).toEqual(['t-kyo', 't-water-a']);
    expect(m.build.enhance).toEqual({ kyo: 3, water: 1 });
    expect(m.evolution.formId).toBe('t4:kyo:mixed'); // 이번 생 동안 몸은 그대로 (허무 일반 진화체는 여전히 없다 — 다음 진화·환생부터 안 나온다)
    expect(m.formDex).toContain('t4:kyo:mixed');
    expect(m.runLog.absorbs.at(-1)).toMatchObject({ element: 'kyo', traitId: 't-kyo-a' }); // 런 로그는 옛 id 그대로 (getTrait 이 지금 블록으로 읽는다)
    expect(getTrait('t-kyo-a').id).toBe('t-kyo');
    expect(m.otherTracks[0]!.build.slots).toEqual(['t-kyo', null, null]);
    expect(m.otherTracks[0]!.build.enhance).toEqual({ kyo: 2 });
    const ex = m.activeExpedition!.exp;
    expect(ex.build.slots).toEqual(['t-kyo', 't-water-a', null]);
    expect(ex.absorbOffer!.candidates).toEqual(['t-kyo']); // 옛 기대값: 후보 [] · blockless
    expect(ex.absorbOffer!.blockless).toBeUndefined();
  });
});
