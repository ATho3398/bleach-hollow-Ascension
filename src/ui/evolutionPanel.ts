// 진화 제단·진화 연출 (GDD 20-5). 문구는 종족 설정(tierNames, slotName, appearanceChange)·진화 데이터에서 읽는다.
// 진화 타이밍(걸음 수)·후보는 숨긴다(v4.1): 제단은 지금 진화체·속성·고유 특성만 보이고, 진화는 둥지에 돌아오면 저절로 일어난다.
import { abilityNameByEffect, formName, physProcText, tryGetForm } from '../data/evolution';
import { STAT_IDS, type FormDef, type StatId, type Stats } from '../data/schema';
import { statName } from '../data/elements';
import { abilityLines, formAbilitiesOf, formDisplayName, isMaxTier, playerElementsOf, tierDisplayName, zeroStats, type AbilityLine, type EvolutionState } from '../engine/evolution';
import type { FactionConfig } from '../engine/faction';
import { BALANCE } from '../config/balance';
import { CUTSCENE_PROVISIONAL, cutsceneLines } from '../data/evolution/cutscene';
import { button, h, icon, mountApp, notice, panel, provisionalTag } from './bha/dom';
import { elementDot, elementsMark } from './bha/element';
import { toward } from './bha/nestLogic';
import { playCosmeticFx } from './bha/cosmeticFx';

const EV = BALANCE.provisional.evolution;

export const EVOLUTION_NOTE = '진화 트리·수치·진화체 이름은 임시 (기획 20-5, 이름·그림은 사용자 확정 전 자리 표시)';

/** 외형 변화 문구: 호로 = 본체 파츠, 사신 = 본체 그대로 참백도 외형 (종족 설정 appearanceChange) */
export function appearanceText(faction: FactionConfig): string {
  return faction.appearanceChange ? '본체의 파츠가 변한다 (뿔·꼬리·가면 무늬)' : `본체는 그대로, ${faction.slotName}의 외형이 변한다`;
}

/** 종족값 한 줄 (예 "체력 61 · 힘 58 · …") */
export function statsLine(factionId: string, stats: Stats): string {
  return STAT_IDS.map((k) => `${statName(k, factionId)} ${stats[k]}`).join(' · ');
}

/** 진화체 설명 줄 (도감 상세): 종족값 · 외형 */
export function formEffectLines(faction: FactionConfig, form: FormDef): string[] {
  return [`${faction.slotName} +${EV.slotsPerEvolution}칸`, `종족값 ${statsLine(faction.id, form.stats)}`, form.stab ? `자기 속성 보정 ×${form.stab}` : '', appearanceText(faction)].filter(Boolean);
}

/** 임시 데이터 안내 한 줄 (작게 + 임시 태그) */
export function evolutionNote(): HTMLElement {
  const p = h('p', 'bha-faint', EVOLUTION_NOTE);
  p.append(' ', provisionalTag());
  return p;
}

/** 지금 진화체의 특성 줄 (GDD 39장): 성향 + 속성·전용 */
export function evolutionAbilityLines(evo: EvolutionState, factionId: string): AbilityLine[] {
  const form = evo.formId ? tryGetForm(evo.formId) : undefined;
  return abilityLines(formAbilitiesOf(form ?? null, evo.ev, evo.ability), factionId);
}

/** 도감용 특성 줄: 성향은 진화 순간 노력치로 정해지므로 규칙만, 속성·전용은 진화체 label 로 */
export function dexAbilityLines(form: FormDef, factionId: string): AbilityLine[] {
  const fa = formAbilitiesOf(form, zeroStats(), null);
  const twin = formAbilitiesOf(form, zeroStats(), 'hp').dispositions.length > 1;
  return [{ slot: '성향', name: twin ? '노력치 1·2위 둘' : '노력치 최고 능력치', description: '진화하는 순간 정해진다' }, ...abilityLines(fa, factionId)];
}

/** 특성 줄 → 문단 (줄마다 "성향 특성 이름 — 설명"). 비면 "아직 없음" */
export function abilityParagraph(lines: readonly AbilityLine[], cls = 'bha-dim'): HTMLElement {
  const p = h('p', cls);
  p.dataset.abilities = String(lines.length);
  if (lines.length === 0) p.append('특성: 아직 없음 (진화하면 생긴다)');
  lines.forEach((l, i) => {
    if (i > 0) p.append(h('br'));
    const tag = h('span', '', `${l.slot} 특성 `);
    tag.dataset.abilitySlot = l.slot;
    p.append(tag, h('b', '', l.name), ` — ${l.description}`);
  });
  return p;
}

/** 전투 중 특성 발동 글자 (연타! / 되갚기! / 다시 일어남! / 연쇄!) — 이름은 데이터에서 */
export function abilityProcText(effect: string, factionId: string): string {
  // 물공 블록·특성 발동 글자 (GDD 49장, 데이터 proc) → 없으면 특성 이름!
  return physProcText(effect, factionId) ?? `${abilityNameByEffect(effect, factionId) ?? effect}!`;
}

/**
 * 진화 제단 화면의 두 열: 왼쪽 = 단계·진화체 이름·속성·고유 특성 / 오른쪽 = 진화 안내(타이밍은 비밀) 또는 마지막 단계 안내.
 */
export function evolutionColumns(faction: FactionConfig, evo: EvolutionState): { left: HTMLElement[]; right: HTMLElement[] } {
  // 실패형 줄기는 단계 이름·진화체 이름 모두 1단계 이름 (GDD 49-8 2번)
  const tierName = tierDisplayName(evo, faction.id);
  const current = evo.formId ? tryGetForm(evo.formId) : undefined;
  const form = h('div', 'bha-evo__form');
  const formName_ = h('span', 'bha-evo__formname', formDisplayName(evo, faction.id));
  if (current?.provisional) formName_.append(' ', provisionalTag());
  const els = h('span', 'bha-dim');
  els.append(`${evo.tierIndex + 1}단계 · ${tierName} · 속성 `, elementsMark(playerElementsOf(evo), faction.id));
  form.append(formName_, els);
  const left = [form, abilityParagraph(evolutionAbilityLines(evo, faction.id))];
  if (isMaxTier(evo)) {
    return {
      left,
      right: [notice('rare', `더 이상 진화하지 않는다. ${faction.absorbActionName} 기록은 칭호 조건에 계속 쌓인다.`, { title: `마지막 단계(${tierName})에 도달했다`, icon: 'i-rare' }), evolutionNote()],
    };
  }
  const how = h('div', 'bha-evo__cta');
  const text = h('span', 'bha-evo__left');
  text.append(
    h('b', '', '진화할 때는 비밀이다.'), h('br'),
    `원정을 다니다 보면 몸에 신호가 온다. 진화는 ${toward(faction.nestName)} 돌아오면 저절로 일어난다.`, h('br'),
    h('span', 'bha-faint', `그 순간 장착한 특성의 속성·공격 분류와 이 단계에 ${faction.absorbActionName}한 적이 결과를 정한다.`),
  );
  how.append(text);
  return { left, right: [how, evolutionNote()] };
}

/** 진화 결과 화면에 넘기는 지금 상태: 속성·성향 특성·노력치(실패형 2위 성향) */
export interface EvolutionExtra {
  elements: string[];
  ability: StatId | null;
  ev?: Stats;
  /** 실패형 줄기 (GDD 49-8 2번): 단계·진화체 이름을 1단계 이름으로 */
  failLine?: boolean;
  /** 실제 종족값 (실패형 줄기 낮춤 반영). 없으면 진화체 값 */
  stats?: Stats;
}

/** 진화 후 달라진 점 행들(임시 수치): 슬롯·속성·고유 특성·종족값·외형 */
export function evolutionEffectRows(
  faction: FactionConfig, form: FormDef, slotsAfter?: number, extra?: EvolutionExtra,
): { icon: string; label: string; value: string | Node; sub?: string; mod?: 'good' | 'stack' }[] {
  const slots = EV.slotsPerEvolution;
  const rows: { icon: string; label: string; value: string | Node; sub?: string; mod?: 'good' | 'stack' }[] = [
    {
      icon: 'i-slot', label: faction.slotName, mod: 'good',
      value: slotsAfter !== undefined ? `${slotsAfter - slots} → ${slotsAfter}칸` : `+${slots}칸`, sub: `+${slots}`,
    },
  ];
  if (extra) rows.push({ icon: 'i-weak', label: '속성', value: elementsMark(extra.elements, faction.id) });
  const lines = extra ? (extra.ev ? abilityLines(formAbilitiesOf(form, extra.ev, extra.ability), faction.id) : abilityLines(formAbilitiesOf(form, zeroStats(), extra.ability), faction.id)) : [];
  for (const l of lines) rows.push({ icon: 'i-rare', label: `${l.slot} 특성`, value: `${l.name} — ${l.description}`, mod: 'stack' });
  rows.push(
    { icon: 'i-cond', label: '종족값', value: statsLine(faction.id, extra?.stats ?? form.stats), mod: 'stack' },
    { icon: 'i-evolve', label: '외형', value: appearanceText(faction), mod: 'stack' },
  );
  return rows;
}

/**
 * 진화 연출 → 결과 (evolve.html). 연출 줄은 0.9초 간격으로 떠오르고(--k, CSS 지연) 3.6초 뒤 결과로 바뀐다.
 * [건너뛰기]로 바로 결과를 볼 수 있다. 연출 문구는 src/data/evolution/cutscene.json (종족 설정 값을 끼워 쓴다).
 */
export function evolutionView(
  root: HTMLElement,
  faction: FactionConfig,
  from: number,
  to: number,
  form: FormDef,
  onDone: () => void,
  slotsAfter?: number,
  extra?: EvolutionExtra,
): void {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const burst = h('span', 'bha-evolve__burst');

  const linesSection = h('section');
  const crack = h('div', 'bha-evolve__crack');
  crack.append(icon('i-broken'));
  const lines = h('div', 'bha-evolve__lines');
  lines.setAttribute('aria-live', 'polite');
  cutsceneLines(faction.id, { nest: faction.nestName, absorb: faction.absorbActionName, from: faction.tierNames[from]! }).forEach((t, i) => {
    const line = h('p', 'bha-evolve__line', t);
    line.style.setProperty('--k', String(i));
    lines.append(line);
  });
  const resultSection = h('section', 'bha-evolve__result');
  const resultMain = h('div', 'bha-evolve__resmain');
  const resultSide = h('div', 'bha-evolve__resside');
  resultSection.hidden = true;

  const showResult = () => {
    if (timer !== undefined) clearTimeout(timer);
    linesSection.hidden = true;
    resultSection.hidden = false;
  };
  const skip = button({ label: '건너뛰기', variant: 'ghost', onClick: showResult });
  linesSection.append(crack, lines, skip);
  if (CUTSCENE_PROVISIONAL) linesSection.append(h('p', 'bha-faint', ''));
  if (CUTSCENE_PROVISIONAL) linesSection.lastElementChild!.append('연출 문구는 ', provisionalTag('제안 문구'));

  const path = h('p', 'bha-evolve__path');
  const failLine = extra?.failLine === true;
  const shownTo = faction.tierNames[failLine ? 0 : to]!;
  path.append(`${from + 1}단계 `, h('b', '', faction.tierNames[failLine && form.label.kind !== 'fail' ? 0 : from]!), icon('i-chevron-right'), `${to + 1}단계 `, h('b', '', shownTo));
  const created = h('div', 'bha-evolve__new');
  for (const e of extra?.elements ?? form.elements ?? []) created.append(elementDot(e, faction.id));
  created.append(` 새 진화체: ${failLine ? shownTo : formName(form, faction.id, extra?.elements ?? [])}`);
  if (form.hidden) created.append(' ', h('span', 'bha-chip bha-chip--rare', '히든'));
  if (form.provisional) created.append(' ', provisionalTag());

  const effects = panel({ title: '달라진 점', aside: provisionalTag('임시 수치'), mod: undefined });
  effects.classList.add('bha-evolve__effects');
  const dl = h('dl', 'bha-info');
  for (const r of evolutionEffectRows(faction, form, slotsAfter, extra)) {
    const row = h('div', `bha-info__row${r.mod ? ` bha-info__row--${r.mod}` : ''}`);
    const dt = h('dt');
    dt.append(icon(r.icon), r.label);
    const dd = h('dd');
    dd.append(r.value);
    if (r.sub && r.mod === 'good') dd.append(' ', h('small', '', r.sub));
    row.append(dt, dd);
    dl.append(row);
  }
  effects.append(dl);

  const home = button({ label: toward(faction.nestName), icon: 'i-nest', variant: 'primary', size: 'lg', block: true, onClick: () => {
    if (timer !== undefined) clearTimeout(timer);
    onDone();
  } });
  const title = h('h1', 'bha-evolve__title', `${shownTo}!`);
  resultMain.append(h('span', 'bha-evolve__eyebrow', '진화'), title, path, created, home);
  resultSide.append(effects, evolutionNote());
  resultSection.append(resultMain, resultSide);

  const app = mountApp(root, { cls: 'bha-evolve' }, burst, linesSection, resultSection);
  playCosmeticFx('evo', app); // 진화 연출 꾸밈 (GDD 25-11): 변하는 순간(연출 줄 동안). 결과·문구는 그대로
  timer = setTimeout(showResult, 3600);
}
