// 진화 패널과 진화 연출 (GDD 4-2). 문구는 종족 설정(tierNames, slotName, appearanceChange)·진화 데이터에서 읽는다.
// 결과 형태는 진화를 확정하기 전까지 "?" 로 가린다. 임시 데이터 표시는 작게 유지한다.
import { formName, formPassiveText, tryGetForm } from '../data/evolution';
import type { FormDef } from '../data/schema';
import { absorbsNeeded, absorbsRemaining, canEvolve, currentCandidates, isMaxTier, type EvolutionState } from '../engine/evolution';
import type { FactionConfig } from '../engine/faction';
import { BALANCE } from '../config/balance';
import { CUTSCENE_PROVISIONAL, cutsceneLines } from '../data/evolution/cutscene';
import { button, h, icon, meter, mountApp, notice, panel, provisionalTag } from './bha/dom';
import { lineageKey } from './bha/lineage';
import { linbar } from './bha/nest';
import { toward } from './bha/nestLogic';
import { evolutionHint, hintText } from './bha/growthLogic';
import { lineageName } from '../data/lineages';

const EV = BALANCE.provisional.evolution;

export const EVOLUTION_NOTE = '진화 조건·수치·진화체 데이터는 임시 (기획 4-2, 11-3 계통 미정)';

/** 외형 변화 문구: 호로 = 본체 파츠, 사신 = 본체 그대로 참백도 외형 (종족 설정 appearanceChange) */
export function appearanceText(faction: FactionConfig): string {
  return faction.appearanceChange ? '본체의 파츠가 변한다 (뿔·꼬리·가면 무늬)' : `본체는 그대로, ${faction.slotName}의 외형이 변한다`;
}

/** 형태 효과 한 줄들 (임시 수치) */
export function formEffectLines(faction: FactionConfig, form: FormDef): string[] {
  const pctText = (m: number) => `${m >= 1 ? '+' : ''}${Math.round((m - 1) * 100)}%`;
  return [
    `${faction.slotName} +${EV.slotsPerEvolution}칸`,
    `체력 ${pctText(form.effects.hpMultiplier)} · 기본 공격 ${pctText(form.effects.attackMultiplier)}`,
    formPassiveText(form, faction.id),
    appearanceText(faction),
  ];
}

/** 임시 데이터 안내 한 줄 (작게 + 임시 태그) */
export function evolutionNote(): HTMLElement {
  const p = h('p', 'bha-faint', EVOLUTION_NOTE);
  p.append(' ', provisionalTag());
  return p;
}

/**
 * 진화 제단 화면의 두 열 (T-3): 왼쪽 = 단계·진화체 이름 + 이 단계 포식 진행 + 계통 누적 막대 / 오른쪽 = 후보 수·결과 ? + [진화] 또는 남은 횟수.
 * 데이터·계산은 엔진(absorbsNeeded 등)에서 그대로 읽는다. 진화 가능하면 오른쪽 칸 테두리가 강조(.bha-panel--accent)된다.
 */
export function evolutionColumns(faction: FactionConfig, evo: EvolutionState, onEvolve: () => void): { left: HTMLElement[]; right: HTMLElement[] } {
  const tierName = faction.tierNames[evo.tierIndex]!;
  const can = canEvolve(evo);
  const current = evo.formId ? tryGetForm(evo.formId) : undefined;
  const form = h('div', 'bha-evo__form');
  const formName_ = h('span', 'bha-evo__formname', current ? formName(current, faction.id) : tierName);
  if (current?.provisional) formName_.append(' ', provisionalTag());
  form.append(formName_, h('span', 'bha-dim', `${evo.tierIndex + 1}단계 · ${tierName}`));

  if (isMaxTier(evo)) {
    return {
      left: [form, linbar(faction, evo.lineageScores, 0)],
      right: [notice('rare', `더 이상 진화하지 않는다. ${faction.absorbActionName} 기록은 칭호 조건에 계속 쌓인다.`, { title: `마지막 단계(${tierName})에 도달했다`, icon: 'i-rare' }), evolutionNote()],
    };
  }

  const need = absorbsNeeded(evo)!;
  const left = [form, meter({ kind: 'stored', label: `이 단계 ${faction.absorbActionName}`, icon: 'i-absorb', value: Math.min(evo.absorbs, need), max: need, valueText: undefined }), linbar(faction, evo.lineageScores, need)];

  const facts = h('div', 'bha-evo__facts');
  const cand = h('div', 'bha-evo__fact');
  const candB = h('b', '', String(currentCandidates(evo).length));
  candB.append(h('small', '', '종'));
  cand.append(h('small', '', '지금 분포로 갈 수 있는 후보'), candB);
  const hidden = h('div', 'bha-evo__fact bha-evo__fact--hidden');
  hidden.append(h('small', '', '진화 결과'), h('b', '', '?'));
  facts.append(cand, hidden);

  let cta: HTMLElement;
  if (can) {
    const b = button({ icon: 'i-evolve', variant: 'primary', size: 'lg', block: true, onClick: onEvolve });
    const label = h('span', 'bha-btn__label');
    label.append(h('span', '', '진화'), h('span', 'bha-btn__sub', `${evo.tierIndex + 1}단계 → ${evo.tierIndex + 2}단계 ${faction.tierNames[evo.tierIndex + 1] ?? ''}`));
    b.append(label);
    cta = b;
  } else {
    cta = h('div', 'bha-evo__cta');
    const text = h('span', 'bha-evo__left');
    // 예고: 누적 상위 계통과 남은 횟수만 (확정 진화체·후보 이름은 숨긴다)
    const hint = evolutionHint(evo);
    text.append('진화까지 ', h('b', '', String(absorbsRemaining(evo)!)), '회 남음', h('br'));
    if (hint) text.append(h('span', 'bha-evo__hint', hintText({ ...hint, remaining: 0 }, (id) => lineageName(id, faction.id))), h('br'));
    text.append(h('span', 'bha-faint', `${faction.absorbActionName}하면 쌓인다. 진화는 ${faction.nestName}에서만.`));
    cta.append(text);
  }
  return { left, right: [facts, cta, evolutionNote()] };
}

/** 진화 후 달라진 점 행들(임시 수치): 슬롯·체력·공격 배율·패시브·외형 */
export function evolutionEffectRows(faction: FactionConfig, form: FormDef, slotsAfter?: number): { icon: string; label: string; value: string; sub?: string; mod?: 'good' | 'stack' }[] {
  const mult = (m: number) => `×${m.toFixed(2)}`;
  const slots = EV.slotsPerEvolution;
  return [
    {
      icon: 'i-slot', label: faction.slotName, mod: 'good',
      value: slotsAfter !== undefined ? `${slotsAfter - slots} → ${slotsAfter}칸` : `+${slots}칸`, sub: `+${slots}`,
    },
    { icon: 'i-cond', label: '체력 배율', value: mult(form.effects.hpMultiplier) },
    { icon: 'i-attack', label: '공격 배율', value: mult(form.effects.attackMultiplier) },
    { icon: 'i-rare', label: '패시브', value: formPassiveText(form, faction.id), mod: 'stack' },
    { icon: 'i-evolve', label: '외형', value: appearanceText(faction), mod: 'stack' },
  ];
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
  if (CUTSCENE_PROVISIONAL) linesSection.lastElementChild!.append('연출 문구는 제안 문구 ', provisionalTag('제안 문구'));

  const path = h('p', 'bha-evolve__path');
  path.append(`${from + 1}단계 `, h('b', '', faction.tierNames[from]!), icon('i-chevron-right'), `${to + 1}단계 `, h('b', '', faction.tierNames[to]!));
  const created = h('div', 'bha-evolve__new');
  form.label.lineages.forEach((l, i) => {
    const k = lineageKey(l);
    if (!k) return;
    const m = icon(`i-lin-${k}`);
    m.style.color = `var(--bha-lin-${k})`;
    if (i > 0) m.style.marginLeft = '-10px';
    created.append(m);
  });
  created.append(`새 진화체: ${formName(form, faction.id)}`);
  if (form.provisional) created.append(' ', provisionalTag());

  const effects = panel({ title: '달라진 점', aside: provisionalTag('임시 수치'), mod: undefined });
  effects.classList.add('bha-evolve__effects');
  const dl = h('dl', 'bha-info');
  for (const r of evolutionEffectRows(faction, form, slotsAfter)) {
    const row = h('div', `bha-info__row${r.mod ? ` bha-info__row--${r.mod}` : ''}`);
    const dt = h('dt');
    dt.append(icon(r.icon), r.label);
    const dd = h('dd', '', r.value);
    if (r.sub && r.mod === 'good') dd.append(' ', h('small', '', r.sub));
    row.append(dt, dd);
    dl.append(row);
  }
  effects.append(dl);

  const home = button({ label: toward(faction.nestName), icon: 'i-nest', variant: 'primary', size: 'lg', block: true, onClick: () => {
    if (timer !== undefined) clearTimeout(timer);
    onDone();
  } });
  const title = h('h1', 'bha-evolve__title', `${faction.tierNames[to]}!`);
  resultMain.append(h('span', 'bha-evolve__eyebrow', '진화'), title, path, created, home);
  resultSide.append(effects, evolutionNote());
  resultSection.append(resultMain, resultSide);

  mountApp(root, { cls: 'bha-evolve' }, burst, linesSection, resultSection);
  timer = setTimeout(showResult, 3600);
}
