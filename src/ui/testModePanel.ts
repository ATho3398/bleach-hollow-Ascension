// 테스트 패널 (GDD 38-4, C.88): 독 [더보기] → [테스트] (테스트 모드에서만). 탭 = 진화체 · 능력치 · 특성 · 바로 전투 · 둥지·속도.
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
  resetStats, setAbility, setCustomStats, setElementDamage, TEST_ELEMENT_DAMAGE_MAX, setForm, setNestValues, setTraitSlots, testFoes, TEST_SPEEDS, TOWER_FLOORS, type TestBattleChoice,
} from '../engine/testMode';
import { statBonusOf, type SaveData } from '../game';
import { button, el, info, panel, seg } from './bha/dom';
import { lcdHead, lcdPage } from './bha/lcdpage';
import { viewTitle } from './bha/viewtitle';
import { showToast } from './bha/nest';
import { disableTestMode, setTestSpeed, testSpeed } from './testMode';
import { setSpeed as setExpSpeed } from './expeditionView';

export type TestTab = 'form' | 'stats' | 'traits' | 'battle' | 'nest';
const TABS: { id: TestTab; label: string }[] = [
  { id: 'form', label: '진화체' },
  { id: 'stats', label: '능력치' },
  { id: 'traits', label: '특성' },
  { id: 'battle', label: '바로 전투' },
  { id: 'nest', label: '둥지·속도' },
];

export interface TestPanelHandlers {
  persist: () => void;
  /** 바로 전투 시작 */
  onBattle: (c: TestBattleChoice) => void;
  /** 시간 빨리 감기 (GDD 102-7): 그 시간만큼 꺼 두었다 다시 연 것처럼 */
  onFastForward?: (hours: number) => void;
  /** 종족을 바꿔 테스트 칸을 새로 (전체 해금으로) */
  onNewFaction: (factionId: string) => void;
  /** [테스트 칸 초기화] */
  onReset: () => void;
  /** 진화체·종족이 바뀌어 방을 다시 그려야 할 때 (테마·그림) */
  onBodyChanged: () => void;
}

/** 패널을 그린다. tab = 처음 보일 탭. 마지막 바로 전투 선택은 다음에 열 때 그대로 */
let lastBattle: TestBattleChoice | null = null;

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

export function testPanelView(root: HTMLElement, faction: FactionConfig, save: SaveData, hd: TestPanelHandlers, tab: TestTab = 'form'): void {
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
    { label: '리스크·허기·컨디션', value: `${save.nest.risk} · ${save.nest.hunger} · ${save.nest.condition}` },
    { label: '속도', value: `×${testSpeed()}` },
  ]));

  let body: Node[];
  if (tab === 'form') body = formTab();
  else if (tab === 'stats') body = statsTab();
  else if (tab === 'traits') body = traitsTab();
  else if (tab === 'battle') body = battleTab();
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
      // 시간 빨리 감기 (GDD 102-7): 꺼 둔 동안의 시간 흐름·쓰러짐(48시간)·사망(+24시간)을 바로 본다
      ...(hd.onFastForward ? [panel({ title: '시간 빨리 감기' }, row(...[1, 12, 48, 72].map((hr) => button({ label: `${hr}시간`, icon: 'i-timer', size: 'small', onClick: () => hd.onFastForward!(hr) }))),
        note('그 시간만큼 꺼 두었다 다시 연 것처럼 셈한다 (배부름·컨디션·영압 안정도·교감·쓰러짐·사망).'))] : []),
      panel({ title: '테스트 칸' }, row(
        button({ label: '테스트 칸 초기화', icon: 'i-loop', variant: 'danger', onClick: hd.onReset }),
        button({ label: '테스트 모드 끄기', icon: 'i-quit', onClick: disableTestMode }),
      ), note('초기화 = 테스트 칸을 지우고 처음 화면으로. 끄면 진짜 세이브로 돌아간다.')),
    ];
  }
}
