// 테스트 패널 (GDD 38-4, C.88): 독 [더보기] → [테스트] (테스트 모드에서만). 탭 = 진화체 · 진화 · 능력치 · 특성 · 아이템 · 스킨 · 바로 전투 · 둥지·시간.
// C.181 (GDD 109장 7): 진화(다음 진화 바로 + 연출)·아이템 생성·스킨 끼워보기 탭, 시간 앞당기기 +10분·+1시간·+1일.
// 목록(종족·진화체·특성·적·보스·★·탑 층)은 모두 데이터에서 읽는다. 값을 바꾸면 persist 로 테스트 칸에만 저장된다.
import { FACTIONS } from '../data/factions';
import { formName, FORM_TABLE, abilityName } from '../data/evolution';
import { statName } from '../data/elements';
import { pickFaction, STAT_IDS, type StatId } from '../data/schema';
import { TRAITS, traitName } from '../data/traits';
import { bossName } from '../data/bosses';
import { BALANCE } from '../config/balance';
import { currentStats, elementDamageOf } from '../engine/evolution';
import { ELEMENT_DAMAGE_IDS } from '../engine/combat';
import { elementDamageAbbr, elementDamagePct } from './bha/element';
import { MAX_DIFFICULTY, recommendedDifficulty } from '../engine/difficulty';
import type { FactionConfig } from '../engine/faction';
import {
  advanceTestTime, createTestItem, testEvolveNext, testItemIds, testSkins, testUnwearAll, testWearCosmetic, testWearSkin,
  TEST_CURRENCY_NAMES, TEST_ITEM_KINDS, TEST_ITEM_KIND_NAMES, TEST_ITEM_MAX, TEST_TIME_STEPS, type TestCurrency, type TestItemKind,
  resetStats, setAbility, setCustomStats, setElementDamage, TEST_ELEMENT_DAMAGE_MAX, setForm, setNestValues, setTraitSlots, testFoes, TEST_SPEEDS, TOWER_FLOORS, type TestBattleChoice,
} from '../engine/testMode';
import { statBonusOf, type SaveData } from '../game';
import type { FoodId } from '../engine/faction';
import type { EvolveResult } from '../engine/evolution/evolution';
import { consumableName, gearKindName } from '../inventory';
import { categoryName, cosmeticName, getCosmetic, COSMETIC_ITEMS } from '../data/shop';
import { skinLabel } from '../data/skins';
import { GEAR_GRADES, GEAR_GRADE_NAMES, type GearGrade, type GearKind } from '../data/gear';
import { isWorn } from '../shop';
import { button, el, info, panel, seg } from './bha/dom';
import { lcdHead, lcdPage } from './bha/lcdpage';
import { viewTitle } from './bha/viewtitle';
import { showToast } from './bha/nest';
import { disableTestMode, setTestSpeed, testSpeed } from './testMode';
import { setSpeed as setExpSpeed } from './expeditionView';

export type TestTab = 'form' | 'evolve' | 'stats' | 'traits' | 'items' | 'skins' | 'battle' | 'nest';
const TABS: { id: TestTab; label: string }[] = [
  { id: 'form', label: '진화체' },
  { id: 'evolve', label: '진화' },
  { id: 'stats', label: '능력치' },
  { id: 'traits', label: '특성' },
  { id: 'items', label: '아이템 생성' },
  { id: 'skins', label: '스킨' },
  { id: 'battle', label: '바로 전투' },
  { id: 'nest', label: '둥지·시간' },
];

export interface TestPanelHandlers {
  persist: () => void;
  /** 바로 전투 시작 */
  onBattle: (c: TestBattleChoice) => void;
  /** 시간 앞당기기 (GDD 102-7·109장 7): 그 시간(분)만큼 지난 것처럼 — 패널이 셈한 뒤(advanceTestTime) 부른다. 방으로 가서 복귀 알림 */
  onTimeAdvanced?: (report: ReturnType<typeof advanceTestTime>) => void;
  /** 진화를 했다 (GDD 109장 7): 진화 연출을 띄운다 (fromTier = 진화 전 단계) */
  onEvolved?: (fromTier: number, r: EvolveResult & { ok: true }) => void;
  /** 종족을 바꿔 테스트 칸을 새로 (전체 해금으로) */
  onNewFaction: (factionId: string) => void;
  /** [테스트 칸 초기화] */
  onReset: () => void;
  /** 진화체·종족이 바뀌어 방을 다시 그려야 할 때 (테마·그림) */
  onBodyChanged: () => void;
}

/** 패널을 그린다. tab = 처음 보일 탭. 마지막 바로 전투 선택은 다음에 열 때 그대로 */
let lastBattle: TestBattleChoice | null = null;
/** 마지막 아이템 생성 선택·꾸밈 선택 (다음에 열 때 그대로) */
let lastItem: { kind: TestItemKind; id: string; count: number; grade: GearGrade; plus: number } = { kind: 'gear', id: 'weapon', count: 1, grade: 'legendary', plus: 0 };
let lastCos: string | null = null;

function select(options: { value: string; label: string; group?: string }[], value: string, aria: string): HTMLSelectElement {
  const s = el('select', 'bha-test__select');
  s.setAttribute('aria-label', aria);
  const groups = new Map<string, HTMLOptGroupElement>();
  for (const o of options) {
    const opt = el('option', '', o.label);
    opt.value = o.value;
    if (o.group) {
      let g = groups.get(o.group);
      if (!g) {
        g = el('optgroup');
        g.label = o.group;
        groups.set(o.group, g);
        s.append(g);
      }
      g.append(opt);
    } else s.append(opt);
  }
  s.value = value;
  return s;
}

function numInput(value: number, min: number, max: number, aria: string): HTMLInputElement {
  const i = el('input', 'bha-test__input');
  i.type = 'number';
  i.inputMode = 'numeric';
  i.min = String(min);
  i.max = String(max);
  i.step = '1';
  i.value = String(value);
  i.setAttribute('aria-label', aria);
  return i;
}

const grid = (rows: [string, Node][]): HTMLElement => {
  const g = el('div', 'bha-test__grid');
  for (const [label, node] of rows) g.append(el('span', 'bha-test__label', label), node);
  return g;
};
const row = (...nodes: Node[]): HTMLElement => {
  const r = el('div', 'bha-test__row');
  r.append(...nodes);
  return r;
};
const note = (text: string): HTMLElement => el('p', 'bha-test__note', text);

/** 마지막으로 본 탭 (진화 연출·전투에서 돌아오면 그 탭) */
let lastTab: TestTab = 'form';

export function testPanelView(root: HTMLElement, faction: FactionConfig, save: SaveData, hd: TestPanelHandlers, tab: TestTab = lastTab): void {
  lastTab = tab;
  const fid = save.factionId;
  const redraw = (t: TestTab = tab) => testPanelView(root, faction, save, hd, t);
  const saved = (msg: string) => {
    hd.persist();
    showToast({ eyebrow: '테스트', title: msg, meta: '테스트 칸에만 저장 — 진짜 세이브는 그대로.' }, 0, 1600);
  };
  const stats = currentStats(save.evolution, fid, statBonusOf(save).total);
  const elemDmg = elementDamageOf(save.evolution);

  // 오른쪽: 지금 상태 요약
  const form = save.evolution.formId ? FORM_TABLE.find((f) => f.id === save.evolution.formId) : undefined;
  const summary = panel({ title: '지금 몸' }, info([
    { label: '종족', value: faction.name },
    { label: '진화체', value: form ? `${form.tier}단계 · ${formName(form, fid)}` : '1단계 (진화 전)' },
    ...STAT_IDS.map((s) => ({ label: statName(s, fid), value: String(stats[s]) })),
    { label: '속성 피해', value: ELEMENT_DAMAGE_IDS.map((id) => `${elementDamageAbbr(id, fid)} ${elementDamagePct(elemDmg[id] ?? 0)}`).join(' · ') },
    { label: '특성', value: save.build.slots.map((id) => (id ? traitName(id, fid) : '—')).join(' · ') },
    { label: '고유 특성', value: save.evolution.ability ? abilityName(save.evolution.ability, fid) : '없음' },
    { label: '리스크·허기·컨디션', value: [save.nest.risk, save.nest.hunger, save.nest.condition].map((v) => Math.round(v)).join(' · ') }, // 소수 꼬리(20.00001…) 대신 정수 (C.182 UI 검수)
    { label: '속도', value: `×${testSpeed()}` },
  ]));

  let body: Node[];
  if (tab === 'form') body = formTab();
  else if (tab === 'stats') body = statsTab();
  else if (tab === 'traits') body = traitsTab();
  else if (tab === 'battle') body = battleTab();
  else if (tab === 'evolve') body = evolveTab();
  else if (tab === 'items') body = itemsTab();
  else if (tab === 'skins') body = skinsTab();
  else body = nestTab();

  // 머리의 탭 5개 줄 대신 제목 토글 "테스트 · 진화체 ▾" (C.114)
  const title = viewTitle(TABS.map((t) => ({ id: t.id, label: t.label })), tab, (id) => redraw(id as TestTab), { prefix: '테스트' });
  lcdPage(root, { cls: 'bha-test-page', cols: '3fr 2fr' }, lcdHead({ title, sub: '전체 해금된 테스트 칸 — 진짜 세이브는 읽지도 쓰지도 않는다' }), body, [summary]);

  function formTab(): Node[] {
    const fSel = select(FACTIONS.map((f) => ({ value: f.id, label: f.name })), fid, '종족');
    fSel.onchange = () => {
      if (fSel.value !== fid) hd.onNewFaction(fSel.value);
    };
    // 진화체: 1단계 + 진화체 표 전부(단계별 묶음, 데이터 순서)
    const tiers = [...new Set(FORM_TABLE.map((f) => f.tier))].sort((a, b) => a - b);
    const opts = [
      { value: '', label: '1단계 (진화 전)', group: '1단계' },
      ...tiers.flatMap((t) => FORM_TABLE.filter((f) => f.tier === t).map((f) => ({ value: f.id, label: `${formName(f, fid)}${f.hidden ? ' (히든)' : ''}`, group: `${t}단계` }))),
    ];
    const formSel = select(opts, save.evolution.formId ?? '', '진화체');
    const apply = button({ label: '이 몸으로', icon: 'i-evolve', variant: 'primary', onClick: () => {
      if (!setForm(save, formSel.value || null)) return;
      saved('진화체를 바꿨다');
      hd.onBodyChanged();
    } });
    return [panel({ title: '진화체 고르기', aside: `${FORM_TABLE.length + 1}종` },
      grid([['종족', fSel], ['진화체', formSel]]),
      row(apply),
      note('종족을 바꾸면 테스트 칸을 그 종족으로 새로 만든다(전체 해금). 능력치는 그 진화체의 종족값 + 지금 노력치·입력값.'))];
  }

  function statsTab(): Node[] {
    const max = BALANCE.provisional.stats.statMax;
    const inputs = STAT_IDS.map((s) => [s, numInput(stats[s], 0, max, statName(s, fid))] as const);
    // 속성 피해 5종 % (GDD 48장 5번)
    const elemInputs = ELEMENT_DAMAGE_IDS.map((id) => [id, numInput(elemDmg[id] ?? 0, 0, TEST_ELEMENT_DAMAGE_MAX, `${elementDamageAbbr(id, fid)} 피해 %`)] as const);
    const apply = button({ label: '적용', icon: 'i-check', variant: 'primary', onClick: () => {
      const want: Partial<Record<StatId, number>> = {};
      for (const [s, i] of inputs) want[s] = Number(i.value);
      setCustomStats(save, want);
      setElementDamage(save, Object.fromEntries(elemInputs.map(([id, i]) => [id, Number(i.value)])));
      saved('능력치를 넣었다');
      redraw();
    } });
    const reset = button({ label: '진화체 기본값으로', icon: 'i-loop', onClick: () => {
      resetStats(save);
      saved('진화체 기본값으로 되돌렸다');
      redraw();
    } });
    return [panel({ title: '능력치 직접 입력', aside: `0~${max}` }, grid([...inputs.map(([s, i]) => [statName(s, fid), i] as [string, Node]), ...elemInputs.map(([id, i]) => [`${elementDamageAbbr(id, fid)} 피해 %`, i] as [string, Node])]), row(apply, reset),
      note('입력값은 원정·등급전·연습·바로 전투 모두에 그대로 쓰인다(노력치는 0으로).'))];
  }

  function traitsTab(): Node[] {
    const opts = [{ value: '', label: '— 빈칸 —' }, ...TRAITS.map((t) => ({ value: t.id, label: traitName(t.id, fid), group: t.boss ? '보스' : t.rare ? '희귀' : t.kind }))];
    const sels = save.build.slots.map((id, i) => select(opts, id ?? '', `특성 칸 ${i + 1}`));
    const abil = select([{ value: '', label: '없음' }, ...STAT_IDS.map((s) => ({ value: s, label: abilityName(s, fid) }))], save.evolution.ability ?? '', '고유 특성');
    const apply = button({ label: '적용', icon: 'i-check', variant: 'primary', onClick: () => {
      setTraitSlots(save, sels.map((s) => s.value || null));
      setAbility(save, (abil.value || null) as StatId | null);
      saved('특성을 넣었다');
      redraw();
    } });
    return [panel({ title: '특성 고르기', aside: `${TRAITS.length}종` },
      grid([...sels.map((s, i) => [`칸 ${i + 1}`, s] as [string, Node]), ['고유 특성', abil]]), row(apply),
      note('같은 특성은 한 칸에만. 고유 특성 = 진화 순간 노력치 방향(능력치 6종).'))];
  }

  function battleTab(): Node[] {
    const foes = testFoes();
    const prev = lastBattle;
    const foeSel = select(foes.map((f) => ({
      value: f.id,
      label: f.kind === 'boss' ? bossName(f.id, fid) : pickFaction(f.def.name, fid),
      group: f.kind === 'boss' ? '보스' : f.def.class === 'elite' ? '강적' : '일반',
    })), prev?.foeId ?? foes[0]?.id ?? '', '상대');
    const starSel = select(Array.from({ length: MAX_DIFFICULTY }, (_, i) => ({ value: String(i + 1), label: `★${i + 1}` })), String(prev?.star ?? recommendedDifficulty(save.evolution.tierIndex)), '난이도');
    const streak = numInput(prev?.streak ?? 0, 0, BALANCE.provisional.difficulty.streak.maxClears, '연속 클리어');
    const floorSel = select([{ value: '', label: '탑 아님' }, ...Array.from({ length: TOWER_FLOORS }, (_, i) => ({ value: String(i + 1), label: `${i + 1}층` }))], prev?.floor ? String(prev.floor) : '', '탑 층');
    const go = button({ label: '전투 시작', icon: 'i-attack', variant: 'primary', onClick: () => {
      lastBattle = { foeId: foeSel.value, star: Number(starSel.value), streak: Number(streak.value) || 0, floor: floorSel.value ? Number(floorSel.value) : null };
      hd.onBattle(lastBattle);
    } });
    return [panel({ title: '바로 전투', aside: `${foes.length}종` },
      grid([['상대', foeSel], ['★', starSel], ['연속', streak], ['탑 층', floorSel]]), row(go),
      note('탑 층을 고르면 ★·배율은 층 규칙(★ = ⌈층/10⌉, 구간 안 층마다 +4%, 50층 +20%). 결과는 테스트 칸 런 로그에만.'))];
  }

  function advance(minutes: number): void {
    const rep = advanceTestTime(save, minutes);
    hd.persist();
    hd.onTimeAdvanced?.(rep);
  }

  // ── 진화 (GDD 109장 7): 지금 몸에서 다음 진화를 바로 — 판정은 진짜 진화와 같다(장착 특성·노력치·배부름·컨디션), 연출 포함 ──
  function evolveTab(): Node[] {
    const t = save.evolution.tierIndex;
    const last = t >= faction.tierNames.length - 1;
    const go = button({ label: '다음 진화', icon: 'i-evolve', variant: 'primary', disabled: last, onClick: () => {
      const r = testEvolveNext(save);
      if (!r.ok) return showToast({ eyebrow: '테스트', title: '진화 못 함', meta: r.reason }, 0, 1600);
      hd.persist();
      hd.onEvolved?.(t, r);
    } });
    return [panel({ title: '진화', aside: `${t + 1}단계 → ${last ? '끝' : `${t + 2}단계`}` },
      info([
        { label: '지금', value: `${faction.tierNames[t]}${form ? ` · ${formName(form, fid)}` : ''}` },
        { label: '다음', value: last ? '마지막 단계' : faction.tierNames[t + 1]! },
      ]),
      row(go),
      note(last ? '마지막 단계다. [진화체] 탭에서 1단계(진화 전)로 바꾼 뒤 다시 진화해 본다.' : '걸음 수를 채우고 진짜 진화를 한다 — 진화체 판정·슬롯 +1·도감·칭호·연출 모두 같다. 진화체를 직접 고르려면 [진화체] 탭.'))];
  }

  // ── 아이템 생성 (GDD 109장 7): 장비·소모품·먹이·꾸밈·재화 → 개수·등급·강화 넣고 [생성] ──
  function itemLabel(kind: TestItemKind, id: string): { label: string; group?: string } {
    if (kind === 'gear') return { label: gearKindName(id as GearKind, faction) };
    if (kind === 'consumable') return { label: consumableName(id) };
    if (kind === 'food') return { label: faction.foodNames[id as FoodId] ?? id };
    if (kind === 'cosmetic') {
      const c = getCosmetic(id);
      return { label: c ? `${cosmeticName(c, faction)}${save.shared.cosmetics.includes(id) ? ' (보유)' : ''}` : id, group: c ? categoryName(c.category) : undefined };
    }
    return { label: TEST_CURRENCY_NAMES[id as TestCurrency] ?? id };
  }
  function itemsTab(): Node[] {
    const kindSel = select(TEST_ITEM_KINDS.map((k) => ({ value: k, label: TEST_ITEM_KIND_NAMES[k] })), lastItem.kind, '분류');
    const idWrap = el('span');
    let idSel = select([], '', '품목');
    const fillIds = () => {
      const k = kindSel.value as TestItemKind;
      idSel = select(testItemIds(k).map((id) => ({ value: id, ...itemLabel(k, id) })), k === lastItem.kind ? lastItem.id : '', '품목');
      if (!idSel.value && idSel.options.length) idSel.selectedIndex = 0;
      idWrap.replaceChildren(idSel);
      const gear = k === 'gear';
      for (const n of gearRows) n.hidden = !gear;
    };
    const count = numInput(lastItem.count, 1, TEST_ITEM_MAX, '개수');
    const gradeSel = select(GEAR_GRADES.map((g) => ({ value: g, label: GEAR_GRADE_NAMES[g] })), lastItem.grade, '등급');
    const plus = numInput(lastItem.plus, 0, BALANCE.provisional.gear.maxPlus, '강화');
    const starSel = select(Array.from({ length: MAX_DIFFICULTY }, (_, i) => ({ value: String(i + 1), label: `★${i + 1}` })), String(recommendedDifficulty(save.evolution.tierIndex)), '★');
    const g = grid([['분류', kindSel], ['품목', idWrap], ['개수', count], ['등급', gradeSel], ['강화', plus], ['★', starSel]]);
    // 등급·강화·★ 줄(이름 + 칸)은 장비만
    const cells = [...g.children] as HTMLElement[];
    const gearRows = cells.slice(6);
    kindSel.onchange = fillIds;
    fillIds();
    const make = button({ label: '생성', icon: 'i-check', variant: 'primary', onClick: () => {
      const k = kindSel.value as TestItemKind;
      lastItem = { kind: k, id: idSel.value, count: Number(count.value) || 1, grade: gradeSel.value as GearGrade, plus: Number(plus.value) || 0 };
      const made = createTestItem(save, { kind: k, id: idSel.value, count: lastItem.count, grade: lastItem.grade, plus: lastItem.plus, star: Number(starSel.value) });
      hd.persist();
      showToast({ eyebrow: '테스트', title: made > 0 ? `${itemLabel(k, idSel.value).label} ×${made} 생성` : '못 넣었다', meta: made < lastItem.count ? '보관 상한·보관함 가득·이미 보유는 그만큼 빠진다.' : '테스트 칸에만 저장 — 진짜 세이브는 그대로.' }, 0, 1800);
      redraw();
    } });
    return [panel({ title: '아이템 생성', aside: TEST_ITEM_KIND_NAMES[kindSel.value as TestItemKind] }, g, row(make),
      note('먹이·소모품·뽑기권·수련권은 보관 상한까지, 장비는 보관함이 차면 멈춘다. 꾸밈은 1개(보유). 골드·영옥·영혼 결정은 상한 없음.'))];
  }

  // ── 스킨 끼워보기 (GDD 109장 7): 가진 것 상관없이 이 종족 스킨·꾸밈 전부 착용·해제 ──
  function skinsTab(): Node[] {
    const skins = testSkins(fid);
    const skinSel = select([{ value: '', label: '— 기본(진화체) —' }, ...skins.map((k) => ({ value: k.id, label: `${skinLabel(k)}${save.skin === k.id ? ' (착용 중)' : ''}`, group: k.tierLook ? '단계 외형' : k.startOnly ? '시작 외형' : '스킨' }))], save.skin ?? '', '스킨');
    const wearSkin = button({ label: '착용', icon: 'i-check', variant: 'primary', onClick: () => {
      if (!testWearSkin(save, skinSel.value || null)) return;
      saved(skinSel.value ? '스킨을 입혔다' : '스킨을 벗겼다');
      hd.onBodyChanged();
      redraw();
    } });
    const offSkin = button({ label: '해제', icon: 'i-quit', onClick: () => {
      testWearSkin(save, null);
      saved('스킨을 벗겼다');
      hd.onBodyChanged();
      redraw();
    } });
    const wearables = COSMETIC_ITEMS.filter((c) => c.category !== 'skin');
    const cosSel = select(wearables.map((c) => ({ value: c.id, label: `${cosmeticName(c, faction)}${isWorn(save, c) ? ' (착용 중)' : ''}`, group: categoryName(c.category) })), lastCos ?? wearables[0]?.id ?? '', '꾸밈');
    const wearCos = button({ label: '착용', icon: 'i-check', variant: 'primary', onClick: () => {
      lastCos = cosSel.value;
      if (!testWearCosmetic(save, cosSel.value)) return;
      saved('꾸밈을 입혔다');
      hd.onBodyChanged();
      redraw();
    } });
    const offCos = button({ label: '그 분류 해제', icon: 'i-quit', onClick: () => {
      const c = getCosmetic(cosSel.value);
      lastCos = cosSel.value;
      if (!c || c.category === 'skin') return;
      delete save.wear[c.category as keyof typeof save.wear];
      saved(`${categoryName(c.category)} 해제`);
      hd.onBodyChanged();
      redraw();
    } });
    const offAll = button({ label: '전부 해제', icon: 'i-loop', variant: 'danger', onClick: () => {
      testUnwearAll(save);
      saved('스킨·꾸밈을 모두 벗겼다');
      hd.onBodyChanged();
      redraw();
    } });
    return [
      panel({ title: '스킨', aside: `${skins.length}종` }, grid([['스킨', skinSel]]), row(wearSkin, offSkin),
        note(skins.length ? '가진 것 상관없이 이 종족이 입을 수 있는 스킨 전부(상점에 안 나오는 단계·아란칼 외형 포함).' : '이 종족은 스킨 데이터가 없다.')),
      panel({ title: '꾸밈', aside: `${wearables.length}종` }, grid([['꾸밈', cosSel]]), row(wearCos, offCos), row(offAll),
        note('안 가진 꾸밈은 입힐 때 테스트 칸에 보유로 넣는다.')),
    ];
  }

  function nestTab(): Node[] {
    const sp = seg(TEST_SPEEDS.map((v) => ({ id: String(v), label: `×${v}` })), String(testSpeed()), (id) => {
      setTestSpeed(Number(id));
      setExpSpeed(testSpeed()); // 원정 시작 배속도 같이
      redraw();
    }, { small: true });
    const risk = numInput(save.nest.risk, 0, BALANCE.provisional.risk.limit, faction.riskGaugeName);
    const hunger = numInput(save.nest.hunger, 0, 100, '허기');
    const cond = numInput(save.nest.condition, 0, 100, '컨디션');
    const apply = button({ label: '적용', icon: 'i-check', variant: 'primary', onClick: () => {
      setNestValues(save, { risk: Number(risk.value), hunger: Number(hunger.value), condition: Number(cond.value) });
      saved('둥지 값을 넣었다');
      redraw();
    } });
    return [
      panel({ title: '속도 (전투·원정)' }, sp, note('전투는 전투 화면 배속에 곱한다. 원정은 시작 배속.')),
      panel({ title: '리스크·허기·컨디션' }, grid([[faction.riskGaugeName, risk], ['허기', hunger], ['컨디션', cond]]), row(apply)),
      // 시간 앞당기기 (GDD 102-7·109장 7): 배부름·돌봄·대기 보상·먹이 한도(10분)·빈사(48시간)·사망을 바로 본다
      ...(hd.onTimeAdvanced ? [panel({ title: '시간 앞당기기' },
        row(...TEST_TIME_STEPS.map((t) => button({ label: t.label, icon: 'i-timer', size: 'small', variant: 'primary', onClick: () => advance(t.minutes) }))),
        row(...[12, 48, 72].map((hr) => button({ label: `+${hr}시간`, icon: 'i-timer', size: 'small', onClick: () => advance(hr * 60) }))),
        note('그 시간만큼 지난 것처럼 셈한다 (배부름·컨디션·영압 안정도·교감·대기 보상·먹이 10분 한도·돌봄 요청·빈사·사망). 셈한 뒤 방으로 간다.'))] : []),
      panel({ title: '테스트 칸' }, row(
        button({ label: '테스트 칸 초기화', icon: 'i-loop', variant: 'danger', onClick: hd.onReset }),
        button({ label: '테스트 모드 끄기', icon: 'i-quit', onClick: disableTestMode }),
      ), note('초기화 = 테스트 칸을 지우고 처음 화면으로. 끄면 진짜 세이브로 돌아간다.')),
    ];
  }
}
