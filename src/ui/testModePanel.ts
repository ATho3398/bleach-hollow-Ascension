// 테스트 패널 (GDD 38-4, C.88): 독 [더보기] → [테스트] (테스트 모드에서만). 탭 = 진화체 · 진화 · 능력치 · 특성 · 아이템 · 스킨 · 바로 전투 · 둥지·시간.
// C.181 (GDD 109장 7): 진화(다음 진화 바로 + 연출)·아이템 생성·스킨 끼워보기 탭, 시간 앞당기기 +10분·+1시간·+1일.
// C.186 (GDD 112장): '불러오기' 탭(떠돌이 상인·돌봄 요청·대기 보상·원정 이벤트 타일·바퀴 변이), 아이템 생성 = 장비 종류 × 특수 효과 전부·떠돌이 상인 물건, 오른쪽 [테스트 모드 끄기](확인 창).
// 목록(종족·진화체·특성·적·보스·★·탑 층)은 모두 데이터에서 읽는다. 값을 바꾸면 persist 로 테스트 칸에만 저장된다.
import { FACTIONS } from '../data/factions';
import { formName, FORM_TABLE, abilityName } from '../data/evolution';
import { statName } from '../data/elements';
import { pickFaction, STAT_IDS, type StatId } from '../data/schema';
import { TRAITS, traitName } from '../data/traits';
import { isBasicBlockTrait } from '../engine/absorb';
import { bossName } from '../data/bosses';
import { BALANCE } from '../config/balance';
import { currentStats, elementDamageOf } from '../engine/evolution';
import { ELEMENT_DAMAGE_IDS } from '../engine/combat';
import { pickList, type PickList, type PickOption } from './bha/pickList';
import { elementDamageAbbr, elementDamagePct } from './bha/element';
import { MAX_DIFFICULTY, recommendedDifficulty } from '../engine/difficulty';
import type { FactionConfig } from '../engine/faction';
import {
  advanceTestTime, createTestItem, testEvolveNext, testItemIds, testSkins, testUnwearAll, testWearCosmetic, testWearSkin,
  createTestGearAll, getTestExpeditionForce, parseTestGearId, setTestExpeditionForce, testCallCare, testCallIdle, testCallWanderer, testClearCare, testClearIdle,
  testEventTiles, testGearGrade, testMutations, testRerollWanderer, testSendWanderer, TEST_IDLE_HOURS, TEST_WANDERER_TIERS,
  TEST_CURRENCY_NAMES, TEST_ITEM_KINDS, TEST_ITEM_KIND_NAMES, TEST_ITEM_MAX, TEST_TIME_STEPS, type TestCurrency, type TestItemKind,
  resetStats, setAbility, setCustomStats, setElementDamage, TEST_ELEMENT_DAMAGE_MAX, setForm, setNestValues, setTraitSlots, testFoes, TEST_SPEEDS, TOWER_FLOORS, type TestBattleChoice,
} from '../engine/testMode';
import { statBonusOf, type SaveData } from '../game';
import type { FoodId } from '../engine/faction';
import type { EvolveResult } from '../engine/evolution/evolution';
import { consumableName, gearKindName } from '../inventory';
import { categoryName, cosmeticName, getCosmetic, getWandererItem, COSMETIC_ITEMS, WANDERER_GRADE_NAMES } from '../data/shop';
import { CARE_ACTIONS, homeHpOf, type CareAction } from '../engine/nest';
import { mutationName, tileName } from '../data/tiles';
import { confirmDialog } from './confirmDialog';
import { skinLabel } from '../data/skins';
import { GEAR_GRADES, GEAR_GRADE_NAMES, GEAR_KINDS, GEAR_SPECIALS, getGearSpecial, type GearGrade } from '../data/gear';
import { isWorn } from '../shop';
import { button, el, info, panel, seg } from './bha/dom';
import { lcdHead, lcdPage } from './bha/lcdpage';
import { viewTitle } from './bha/viewtitle';
import { showToast } from './bha/nest';
import { disableTestMode, setTestSpeed, testSpeed } from './testMode';
import { setSpeed as setExpSpeed } from './expeditionView';
import { shownName } from './displayName';

export type TestTab = 'form' | 'evolve' | 'stats' | 'traits' | 'items' | 'skins' | 'battle' | 'nest' | 'call';
const TABS: { id: TestTab; label: string }[] = [
  { id: 'form', label: '진화체' },
  { id: 'evolve', label: '진화' },
  { id: 'stats', label: '능력치' },
  { id: 'traits', label: '특성' },
  { id: 'items', label: '아이템 생성' },
  { id: 'skins', label: '스킨' },
  { id: 'battle', label: '바로 전투' },
  { id: 'nest', label: '둥지·시간' },
  { id: 'call', label: '불러오기' },
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
/** 불러오기 탭 마지막 선택 (다음에 열 때 그대로) */
let lastCall: { tier: number; care: CareAction; idleHours: number } = { tier: 1, care: 'pet', idleHours: 4 };

/** 고르기 칸: 게임 안 목록 (C.190, GDD 116장 추가 5 — 브라우저 기본 select 는 휴대폰 OS 창이 세로 회전 출력에서 세로로 떴다) */
function select(options: PickOption[], value: string, aria: string): PickList {
  return pickList(options, value, aria, 'bha-test__select');
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

const GEAR_KIND_COUNT = GEAR_KINDS.length;
const GEAR_SPECIAL_COUNT = GEAR_SPECIALS.length;

/** root 안에서 스크롤된 칸들의 자리를 적어 두고, 다시 그린 뒤 같은 클래스·순서의 칸에 되돌린다 */
function keepScroll(root: HTMLElement): () => void {
  const key = (e: Element) => e.className;
  const saved = [root, ...root.querySelectorAll<HTMLElement>('*')].filter((e) => e.scrollTop > 0).map((e) => {
    const k = key(e);
    return { k, i: [...root.querySelectorAll(`*`)].filter((x) => key(x) === k).indexOf(e), top: e.scrollTop, self: e === root };
  });
  return () => {
    for (const s of saved) {
      const e = s.self ? root : [...root.querySelectorAll<HTMLElement>('*')].filter((x) => key(x) === s.k)[s.i];
      if (e) e.scrollTop = s.top;
    }
  };
}

/** 마지막으로 본 탭 (진화 연출·전투에서 돌아오면 그 탭) */
let lastTab: TestTab = 'form';

export function testPanelView(root: HTMLElement, faction: FactionConfig, save: SaveData, hd: TestPanelHandlers, tab: TestTab = lastTab): void {
  lastTab = tab;
  const fid = save.factionId;
  // 같은 탭을 다시 그릴 때(버튼을 누른 뒤)는 스크롤 자리를 지킨다 — 눌린 줄 아래 버튼이 맨 위로 튀지 않게 (C.186 ui-audit)
  const redraw = (t: TestTab = tab) => {
    const keep = t === tab ? keepScroll(root) : null;
    testPanelView(root, faction, save, hd, t);
    keep?.();
  };
  const saved = (msg: string) => {
    hd.persist();
    showToast({ eyebrow: '테스트', title: msg, meta: '테스트 칸에만 저장한다. 진짜 세이브는 그대로 남는다.' }, 0, 1600);
  };
  const stats = currentStats(save.evolution, fid, statBonusOf(save).total);
  const elemDmg = elementDamageOf(save.evolution);

  // 오른쪽: 지금 상태 요약
  const form = save.evolution.formId ? FORM_TABLE.find((f) => f.id === save.evolution.formId) : undefined;
  const summary = panel({ title: '지금 몸' }, info([
    { label: '종족', value: faction.name },
    { label: '진화체', value: form ? `${form.tier}단계 · ${shownName(formName(form, fid))}` : '1단계 (진화 전)' },
    ...STAT_IDS.map((s) => ({ label: statName(s, fid), value: String(stats[s]) })),
    { label: '속성 피해', value: ELEMENT_DAMAGE_IDS.map((id) => `${elementDamageAbbr(id, fid)} ${elementDamagePct(elemDmg[id] ?? 0)}`).join(' · ') },
    { label: '특성', value: save.build.slots.map((id) => (id ? traitName(id, fid) : '—')).join(' · ') },
    { label: '고유 특성', value: save.evolution.ability ? abilityName(save.evolution.ability, fid) : '없음' },
    { label: '리스크·허기·컨디션', value: [save.nest.risk, save.nest.hunger, save.nest.condition].map((v) => Math.round(v)).join(' · ') }, // 소수 꼬리(20.00001…) 대신 정수 (C.182 UI 검수)
    { label: '속도', value: `×${testSpeed()}` },
  ]));
  // 떠돌이 상인 물건 (GDD 112장 2): 길이가 바뀌는 글이라 오른쪽 맨 아래 따로 (버튼 없는 칸 — 불러오기 탭 버튼이 안 움직이게)
  const visitNow = save.shared.wanderer.visit;
  const stockPanel = visitNow ? [panel({ title: '떠돌이 상인 물건', aside: `${visitNow.tier}단계` }, note(visitNow.stock.map((st) => `${getWandererItem(st.itemId)?.name ?? st.itemId}${st.sold ? ' (팔림)' : ''}`).join(' · ')))] : [];

  let body: Node[];
  if (tab === 'form') body = formTab();
  else if (tab === 'stats') body = statsTab();
  else if (tab === 'traits') body = traitsTab();
  else if (tab === 'battle') body = battleTab();
  else if (tab === 'evolve') body = evolveTab();
  else if (tab === 'items') body = itemsTab();
  else if (tab === 'skins') body = skinsTab();
  else if (tab === 'call') body = callTab();
  else body = nestTab();

  // 테스트 모드 끄기 (GDD 112장 1): 어느 탭에서나 왼쪽 맨 아래 — 확인 창 뒤 끈다 (설정 > [정보] 줄과 같은 동작)
  const quit = panel({ title: '테스트 모드' }, row(button({ label: '테스트 모드 끄기', icon: 'i-quit', variant: 'danger', onClick: () => confirmDialog({
    title: '테스트 모드 끄기',
    body: '진짜 세이브로 돌아가 처음부터 다시 연다. 테스트 칸은 지우지 않고 남는다. 다시 켜려면 설정 > [정보] 버전 줄을 7번 누른다.',
    yes: '끄기', no: '아니오', danger: true,
    onYes: disableTestMode,
  }) })), note('끄는 법: 여기, 또는 설정 > [정보] > [테스트 모드 끄기], 또는 주소에 ?test=0.'));

  // 머리의 탭 5개 줄 대신 제목 토글 "테스트 · 진화체 ▾" (C.114)
  const title = viewTitle(TABS.map((t) => ({ id: t.id, label: t.label })), tab, (id) => redraw(id as TestTab), { prefix: '테스트' });
  lcdPage(root, { cls: 'bha-test-page', cols: '3fr 2fr' }, lcdHead({ title, sub: '전체 해금된 테스트 칸이다. 진짜 세이브는 읽지도 쓰지도 않는다.' }), [...body, quit], [summary, ...stockPanel]);

  function formTab(): Node[] {
    const fSel = select(FACTIONS.map((f) => ({ value: f.id, label: f.name })), fid, '종족');
    fSel.onchange = () => {
      if (fSel.value !== fid) hd.onNewFaction(fSel.value);
    };
    // 진화체: 1단계 + 진화체 표 전부(단계별 묶음, 데이터 순서)
    const tiers = [...new Set(FORM_TABLE.map((f) => f.tier))].sort((a, b) => a - b);
    const opts = [
      { value: '', label: '1단계 (진화 전)', group: '1단계' },
      ...tiers.flatMap((t) => FORM_TABLE.filter((f) => f.tier === t).map((f) => ({ value: f.id, label: `${shownName(formName(f, fid))}${f.hidden ? ' (히든)' : ''}`, group: `${t}단계` }))),
    ];
    const formSel = select(opts, save.evolution.formId ?? '', '진화체');
    const apply = button({ label: '이 몸으로', icon: 'i-evolve', variant: 'primary', onClick: () => {
      if (!setForm(save, formSel.value || null)) return;
      saved('진화체를 바꿨다');
      hd.onBodyChanged();
    } });
    return [panel({ title: '진화체 고르기', aside: `${FORM_TABLE.length + 1}종` },
      grid([['종족', fSel.el], ['진화체', formSel.el]]),
      row(apply),
      note('종족을 바꾸면 테스트 칸을 그 종족으로 새로 만든다(전체 해금). 능력치는 그 진화체의 종족값 + 지금 노력치·입력값이다.'))];
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
      note('입력값은 모험·등급전·연습·바로 전투 모두에 그대로 쓰인다(노력치는 0으로).'))];
  }

  function traitsTab(): Node[] {
    const opts = [{ value: '', label: '— 빈칸 —' }, ...TRAITS.filter((t) => !isBasicBlockTrait(t.id)).map((t) => ({ value: t.id, label: traitName(t.id, fid), group: t.boss ? '보스' : t.kind }))];
    const sels = save.build.slots.map((id, i) => select(opts, id ?? '', `특성 칸 ${i + 1}`));
    const abil = select([{ value: '', label: '없음' }, ...STAT_IDS.map((s) => ({ value: s, label: abilityName(s, fid) }))], save.evolution.ability ?? '', '고유 특성');
    const apply = button({ label: '적용', icon: 'i-check', variant: 'primary', onClick: () => {
      setTraitSlots(save, sels.map((s) => s.value || null));
      setAbility(save, (abil.value || null) as StatId | null);
      saved('특성을 넣었다');
      redraw();
    } });
    return [panel({ title: '특성 고르기', aside: `${TRAITS.length}종` },
      grid([...sels.map((s, i) => [`칸 ${i + 1}`, s.el] as [string, Node]), ['고유 특성', abil.el]]), row(apply),
      note('같은 특성은 한 칸에만 넣는다. 고유 특성 = 진화 순간 노력치 방향(능력치 6종).'))];
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
      grid([['상대', foeSel.el], ['★', starSel.el], ['연속', streak], ['탑 층', floorSel.el]]), row(go),
      note('탑 층을 고르면 ★·배율은 층 규칙(★ = ⌈층/10⌉, 구간 안 층마다 +4%, 50층 +20%). 결과는 테스트 칸 런 로그에만 남는다.'))];
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
        { label: '지금', value: `${faction.tierNames[t]}${form ? ` · ${shownName(formName(form, fid))}` : ''}` },
        { label: '다음', value: last ? '마지막 단계' : faction.tierNames[t + 1]! },
      ]),
      row(go),
      note(last ? '마지막 단계다. [진화체] 탭에서 1단계(진화 전)로 바꾼 뒤 다시 진화해 본다.' : '걸음 수를 채우고 진짜 진화를 한다 — 진화체 판정·슬롯 +1·도감·칭호·연출 모두 같다. 진화체를 직접 고르려면 [진화체] 탭에서 고른다.'))];
  }

  // ── 아이템 생성 (GDD 109장 7): 장비·소모품·먹이·꾸밈·재화 → 개수·등급·강화 넣고 [생성] ──
  /** 장비 특수 효과 짧은 이름 (고르기 목록용 — 값은 등급에 따라 붙는다) */
  function specialShort(id: string): string {
    const d = getGearSpecial(id);
    if (!d) return id;
    switch (d.effect) {
      case 'family': return `${faction.families.find((f) => f.id === d.family)?.name ?? d.family} 블록 피해`;
      case 'elite': return '강적·보스 피해';
      case 'critDamage': return '치명 피해';
      case 'shield': return '시작 보호막';
      default: return `발동 ${d.name ?? d.effect}`;
    }
  }
  function itemLabel(kind: TestItemKind, id: string): { label: string; group?: string } {
    if (kind === 'gear') {
      const g = parseTestGearId(id);
      if (!g) return { label: id };
      const kindName = gearKindName(g.kind, faction);
      return { label: g.special ? `${kindName} · ${specialShort(g.special)}` : `${kindName} (특수 효과 무작위)`, group: kindName };
    }
    if (kind === 'wanderer') {
      const w = getWandererItem(id);
      return { label: w?.name ?? id, group: w ? WANDERER_GRADE_NAMES[w.grade] : undefined };
    }
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
      idWrap.replaceChildren(idSel.el);
      const gear = k === 'gear';
      for (const n of gearRows) n.hidden = !gear;
      all.disabled = !gear; // 자리는 그대로 (버튼 자리 고정)
    };
    const count = numInput(lastItem.count, 1, TEST_ITEM_MAX, '개수');
    const gradeSel = select(GEAR_GRADES.map((g) => ({ value: g, label: GEAR_GRADE_NAMES[g] })), lastItem.grade, '등급');
    const plus = numInput(lastItem.plus, 0, BALANCE.provisional.gear.maxPlus, '강화');
    const starSel = select(Array.from({ length: MAX_DIFFICULTY }, (_, i) => ({ value: String(i + 1), label: `★${i + 1}` })), String(recommendedDifficulty(save.evolution.tierIndex)), '★');
    const g = grid([['분류', kindSel.el], ['품목', idWrap], ['개수', count], ['등급', gradeSel.el], ['강화', plus], ['★', starSel.el]]);
    // 등급·강화·★ 줄(이름 + 칸)은 장비만
    const cells = [...g.children] as HTMLElement[];
    const gearRows = cells.slice(6);
    const all = button({ label: '전부 한 개씩 받기', icon: 'i-rare', onClick: () => {
      lastItem = { ...lastItem, kind: 'gear', grade: gradeSel.value as GearGrade, plus: Number(plus.value) || 0 };
      const made = createTestGearAll(save, { grade: lastItem.grade, plus: lastItem.plus, star: Number(starSel.value) });
      hd.persist();
      showToast({ eyebrow: '테스트', title: made > 0 ? `장비 ${made}개 생성` : '못 넣었다', meta: `종류 ${GEAR_KIND_COUNT}개 + 특수 효과 ${GEAR_SPECIAL_COUNT}개를 한 번씩. 보관함(${BALANCE.provisional.gear.cap}칸)이 차면 멈춘다.` }, 0, 2000);
      redraw();
    } });
    kindSel.onchange = fillIds;
    fillIds();
    const make = button({ label: '생성', icon: 'i-check', variant: 'primary', onClick: () => {
      const k = kindSel.value as TestItemKind;
      lastItem = { kind: k, id: idSel.value, count: Number(count.value) || 1, grade: gradeSel.value as GearGrade, plus: Number(plus.value) || 0 };
      const made = createTestItem(save, { kind: k, id: idSel.value, count: lastItem.count, grade: lastItem.grade, plus: lastItem.plus, star: Number(starSel.value) });
      hd.persist();
      const gradeNote = k === 'gear' && testGearGrade(idSel.value, lastItem.grade) !== lastItem.grade ? ` (${GEAR_GRADE_NAMES[testGearGrade(idSel.value, lastItem.grade)]})` : '';
      showToast({ eyebrow: '테스트', title: made > 0 ? `${itemLabel(k, idSel.value).label}${gradeNote} ×${made} 생성` : '못 넣었다', meta: made < lastItem.count ? '보관 상한·보관함 가득·이미 보유는 그만큼 빠진다.' : '테스트 칸에만 저장한다. 진짜 세이브는 그대로 남는다.' }, 0, 1800);
      redraw();
    } });
    return [panel({ title: '아이템 생성', aside: TEST_ITEM_KIND_NAMES[kindSel.value as TestItemKind] }, g, row(make, all),
      note('장비는 종류 × 특수 효과 전부를 고른다(상점 장비 = 노말 종류, 떠돌이 상인 장비 = 레어~전설 종류와 같다). 특수 효과는 영웅·전설에만 붙어서, 노말·레어를 고르면 영웅으로 만든다.'),
      note('떠돌이 상인 물건은 사는 것과 같은 효과를 공짜로 낸다. 먹이·소모품·뽑기권·수련권은 보관 상한까지, 장비는 보관함이 차면 멈춘다. 꾸밈은 1개(보유)다. 골드·영옥·영혼 결정은 상한이 없다.'))];
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
      panel({ title: '스킨', aside: `${skins.length}종` }, grid([['스킨', skinSel.el]]), row(wearSkin, offSkin),
        note(skins.length ? '가진 것 상관없이 이 종족이 입을 수 있는 스킨 전부를 보인다(상점에 안 나오는 단계·아란칼 외형 포함).' : '이 종족은 스킨 데이터가 없다.')),
      panel({ title: '꾸밈', aside: `${wearables.length}종` }, grid([['꾸밈', cosSel.el]]), row(wearCos, offCos), row(offAll),
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
    const hp = numInput(Math.round(homeHpOf(save.nest) * 100), 0, 100, '체력 %');
    const apply = button({ label: '적용', icon: 'i-check', variant: 'primary', onClick: () => {
      setNestValues(save, { risk: Number(risk.value), hunger: Number(hunger.value), condition: Number(cond.value), hp: Number(hp.value) });
      saved('둥지 값을 넣었다');
      redraw();
    } });
    return [
      panel({ title: '속도 (전투·모험)' }, sp, note('전투는 전투 화면 배속에 곱한다. 모험은 시작 배속에 쓴다.')),
      panel({ title: '리스크·허기·컨디션·체력' }, grid([[faction.riskGaugeName, risk], ['허기', hunger], ['컨디션', cond], ['체력 %', hp]]), row(apply)),
      // 시간 앞당기기 (GDD 102-7·109장 7): 배부름·돌봄·대기 보상·먹이 한도(10분)·빈사(48시간)·사망을 바로 본다
      ...(hd.onTimeAdvanced ? [panel({ title: '시간 앞당기기' },
        row(...TEST_TIME_STEPS.map((t) => button({ label: t.label, icon: 'i-timer', size: 'small', variant: 'primary', onClick: () => advance(t.minutes) }))),
        row(...[12, 48, 72].map((hr) => button({ label: `+${hr}시간`, icon: 'i-timer', size: 'small', onClick: () => advance(hr * 60) }))),
        note('그 시간만큼 지난 것처럼 셈한다 (배부름·컨디션·영압 안정도·교감·대기 보상·먹이 10분 한도·돌봄 요청·빈사·사망). 셈한 뒤 방으로 간다.'))] : []),
      panel({ title: '테스트 칸' }, row(
        button({ label: '테스트 칸 초기화', icon: 'i-loop', variant: 'danger', onClick: hd.onReset }),
      ), note('초기화하면 테스트 칸을 지우고 처음 화면으로 간다. 테스트 모드 끄기는 맨 아래에 있다.')),
    ];
  }

  // ── 불러오기 (GDD 112장 2): 무작위로 뜨는 것을 바로 부른다. 줄마다 고르기 → [지금 부르기] · 걷기 ──
  function callTab(): Node[] {
    const done = (msg: string, meta: string) => {
      hd.persist();
      showToast({ eyebrow: '테스트', title: msg, meta }, 0, 1800);
      redraw();
    };
    // 떠돌이 상인 (GDD 85장 5번): 숨은 단계 1~n → 그 단계 등급표로 물건을 뽑는다
    const visit = save.shared.wanderer.visit;
    const tierSel = select(Array.from({ length: TEST_WANDERER_TIERS }, (_, i) => ({ value: String(i + 1), label: `${i + 1}단계` })), String(visit?.tier ?? lastCall.tier), '상인 단계');
    const callW = button({ label: '지금 부르기', icon: 'i-check', variant: 'primary', onClick: () => {
      lastCall = { ...lastCall, tier: Number(tierSel.value) };
      testCallWanderer(save, lastCall.tier);
      done('떠돌이 상인을 불렀다', '밖으로 → 시장 → [떠돌이 상인]에서 산다. 다음 모험에서 돌아오면 떠난다.');
    } });
    const rerollW = button({ label: '물건 다시 뽑기', icon: 'i-loop', disabled: !visit, onClick: () => {
      if (testRerollWanderer(save)) done('물건을 다시 뽑았다', '팔린 칸도 새로 채운다.');
    } });
    const sendW = button({ label: '보내기', icon: 'i-quit', disabled: !visit, onClick: () => {
      if (testSendWanderer(save)) done('떠돌이 상인을 보냈다', '다음 모험 바퀴부터 다시 확률이 쌓인다.');
    } });
    // 돌봄 요청 (GDD 82장)
    const care = save.nest.careRequest;
    const careSel = select(CARE_ACTIONS.map((a) => ({ value: a, label: faction.nestActions[a] })), care?.action ?? lastCall.care, '돌봄 요청');
    const callC = button({ label: '지금 부르기', icon: 'i-check', variant: 'primary', disabled: save.nest.dead, onClick: () => {
      lastCall = { ...lastCall, care: careSel.value as CareAction };
      if (testCallCare(save, lastCall.care)) done('돌봄 요청을 띄웠다', `방에서 [${faction.nestActions[lastCall.care]}]로 응답한다. ${BALANCE.provisional.nest.careRequest.holdMinutes}분 동안 남는다.`);
    } });
    const clearC = button({ label: '걷기', icon: 'i-quit', disabled: !care, onClick: () => {
      if (testClearCare(save)) done('돌봄 요청을 걷었다', '다음 요청은 진짜 간격 뒤에 온다.');
    } });
    // 대기 보상 (GDD 92장)
    const idleSel = select(TEST_IDLE_HOURS.map((h) => ({ value: String(h), label: `${h}시간` })), String(lastCall.idleHours), '대기 보상 시간');
    const callI = button({ label: '지금 부르기', icon: 'i-check', variant: 'primary', onClick: () => {
      lastCall = { ...lastCall, idleHours: Number(idleSel.value) };
      if (testCallIdle(save, lastCall.idleHours)) done('대기 보상을 쌓았다', '방 [대기 보상] 아이콘에서 받는다. 허기·컨디션은 그대로다.');
    } });
    const clearI = button({ label: '비우기', icon: 'i-quit', disabled: !save.idlePending, onClick: () => {
      if (testClearIdle(save)) done('대기 보상을 비웠다', '받지 않고 버렸다.');
    } });
    // 원정 이벤트 타일·바퀴 변이 (GDD 25-5 ③④): 원정 안에서만 뜨므로 다음 자유 원정 출발 때 놓는다
    const force = getTestExpeditionForce();
    const evSel = select([{ value: '', label: '— 없음 —' }, ...testEventTiles(fid).map((id) => ({ value: id, label: tileName(id, fid) }))], force.eventTile ?? '', '이벤트 타일');
    const mutSel = select([{ value: '', label: '— 없음 —' }, ...testMutations().map((id) => ({ value: id, label: mutationName(id, fid) }))], force.mutation ?? '', '바퀴 변이');
    const callE = button({ label: '다음 모험에 부르기', icon: 'i-check', variant: 'primary', onClick: () => {
      const f = setTestExpeditionForce({ eventTile: evSel.value || null, mutation: mutSel.value || null });
      showToast({ eyebrow: '테스트', title: f.eventTile || f.mutation ? '다음 모험에 부른다' : '예약 없음', meta: '다음 자유 모험 배치 단계에서 이벤트 타일은 첫 빈 칸에, 변이는 1바퀴에 놓인다.' }, 0, 1800);
      redraw();
    } });
    const clearE = button({ label: '예약 취소', icon: 'i-quit', disabled: !force.eventTile && !force.mutation, onClick: () => {
      setTestExpeditionForce({ eventTile: null, mutation: null });
      redraw();
    } });
    const forced = [force.eventTile ? tileName(force.eventTile, fid) : null, force.mutation ? mutationName(force.mutation, fid) : null].filter(Boolean).join(' · ');
    return [
      panel({ title: '떠돌이 상인', aside: visit ? `와 있음 · ${visit.tier}단계` : '없음' }, grid([['단계', tierSel.el]]), row(callW, rerollW, sendW),
        note('단계가 높을수록 영웅·전설 물건이 잘 나온다. 와 있으면 새 상인으로 바꾼다. 물건 목록은 오른쪽 맨 아래에 보인다.')),
      panel({ title: '돌봄 요청', aside: care ? `${faction.nestActions[care.action]} 요청 중` : '없음' }, grid([['요청', careSel.el]]), row(callC, clearC),
        note(save.nest.dead ? '사망 상태에서는 요청이 오지 않는다.' : '방 아래 독 버튼에 요청 표시가 붙는다.')),
      panel({ title: '대기 보상', aside: save.idlePending ? `${Math.round(save.idlePending.hours * 10) / 10}시간 쌓임` : '없음' }, grid([['시간', idleSel.el]]), row(callI, clearI),
        note('그 시간만큼 자동 모험을 한 것으로 쌓는다. 시간까지 흐르게 하려면 [둥지·시간] 탭의 시간 앞당기기를 쓴다.')),
      panel({ title: '모험 이벤트', aside: forced || '예약 없음' }, grid([['이벤트 타일', evSel.el], ['바퀴 변이', mutSel.el]]), row(callE, clearE),
        note('모험 안에서만 뜨는 것이라 다음 자유 모험 출발 때 놓는다(스토리·첫 진화 전 모험은 제외). 예약은 이 실행 동안만 남는다.')),
    ];
  }
}
