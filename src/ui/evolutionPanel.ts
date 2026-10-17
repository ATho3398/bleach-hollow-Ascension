// 진화 패널과 진화 연출 (GDD 4-2). 문구는 종족 설정(tierNames, slotName, appearanceChange)·진화 데이터에서 읽는다.
// 결과 형태는 진화를 확정하기 전까지 "?" 로 가린다. 임시 데이터 표시는 작게 유지한다.
import { formName, formPassiveText, tryGetForm } from '../data/evolution';
import { LINEAGES, lineageName } from '../data/lineages';
import type { FormDef } from '../data/schema';
import { absorbsNeeded, absorbsRemaining, canEvolve, currentCandidates, isMaxTier, type EvolutionState } from '../engine/evolution';
import type { FactionConfig } from '../engine/faction';
import { BALANCE } from '../config/balance';
import { barOf, el, mountScreen, pct, rowOf } from './dom';

const EV = BALANCE.provisional.evolution;

export const EVOLUTION_NOTE = '진화 조건·수치·진화체 데이터는 임시입니다 (기획 4-2, 11-3 계통 미정)';

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

export function evolutionPanel(faction: FactionConfig, evo: EvolutionState, onEvolve: () => void, onDex: () => void): HTMLElement {
  const box = el('div', 'evo');
  const tierName = faction.tierNames[evo.tierIndex]!;
  box.append(el('div', 'tier', `${evo.tierIndex + 1}단계 · ${tierName}`));
  const current = evo.formId ? tryGetForm(evo.formId) : undefined;
  if (current) box.append(el('small', 'dim', `지금 진화체: ${formName(current, faction.id)}`));
  const dexBtn = el('button', 'small', '진화체 도감');
  dexBtn.onclick = onDex;
  if (isMaxTier(evo)) {
    box.append(el('p', 'dim', `마지막 단계(${tierName})에 도달했다. 더 이상 진화하지 않는다.`), dexBtn, el('small', 'dim', EVOLUTION_NOTE));
    return box;
  }
  const need = absorbsNeeded(evo)!;
  box.append(rowOf(el('span', '', `이 단계 ${faction.absorbActionName}`), el('span', 'dim', `${Math.min(evo.absorbs, need)} / ${need}회`)));
  const max = Math.max(1, ...LINEAGES.map((l) => evo.lineageScores[l.id] ?? 0));
  for (const l of LINEAGES) {
    const score = evo.lineageScores[l.id] ?? 0;
    const fill = el('i');
    fill.style.width = pct(score, max);
    box.append(rowOf(el('span', 'dim', lineageName(l.id, faction.id)), el('span', 'dim', `${score}`)), barOf('lin', fill));
  }
  box.append(rowOf(el('span', '', '지금 분포로 갈 수 있는 후보'), el('span', 'combo', `${currentCandidates(evo).length}종`)));
  box.append(rowOf(el('span', '', '진화 결과'), el('span', 'unknown', '?')));
  const remaining = absorbsRemaining(evo)!;
  if (canEvolve(evo)) {
    const b = el('button', 'primary', '진화');
    b.onclick = onEvolve;
    box.append(b);
  } else {
    box.append(el('small', 'dim', `진화까지 ${faction.absorbActionName} ${remaining}회 남음 (원정에서 ${faction.absorbActionName}하면 쌓인다. 진화는 ${faction.nestName}에서만)`));
  }
  box.append(dexBtn, el('small', 'dim', EVOLUTION_NOTE));
  return box;
}

/** 진화 연출(텍스트 수준) → 결과. 연출 줄은 순서대로 나타나고, 마지막에 새 형태·효과·슬롯 +1을 보여 준다 */
export function evolutionView(
  root: HTMLElement,
  faction: FactionConfig,
  from: number,
  to: number,
  form: FormDef,
  onDone: () => void,
): void {
  const lines = [
    `${faction.nestName}이(가) 조용히 흔들린다…`,
    `지금까지 ${faction.absorbActionName}한 힘이 하나로 모여 간다.`,
    `${faction.tierNames[from]}의 모습이 허물어지고…`,
  ];
  const nodes = lines.map((t, i) => {
    const n = el('div', 'evo-line', t);
    n.style.animationDelay = `${i * 0.7}s`;
    return n;
  });
  const result = el('div', 'stack');
  result.style.animation = 'evofade .6s 2.4s both';
  result.append(
    el('div', 'evo-result', `${faction.tierNames[to]}!`),
    el('p', 'dim', `${from + 1}단계 ${faction.tierNames[from]} → ${to + 1}단계 ${faction.tierNames[to]}`),
    el('b', '', `새 진화체: ${formName(form, faction.id)}`),
    ...formEffectLines(faction, form).map((t) => el('div', 'dim', t)),
    el('small', 'dim', EVOLUTION_NOTE),
  );
  const home = el('button', 'primary', `${faction.nestName}으로`);
  home.onclick = onDone;
  mountScreen(root, el('h1', '', '진화'), ...nodes, result, home);
}
