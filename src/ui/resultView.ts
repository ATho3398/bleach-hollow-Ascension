// 원정 결과 (U-4, 기획서 2-1·9장): 종료 이유 4가지 → 귀환 계열 = 승리 톤, 패배 계열 = 패배 톤. 요약·시드·기록 저장 줄, [둥지로].
import { BALANCE } from '../config/balance';
import { tileName } from '../data/tiles';
import { traitName } from '../data/traits';
import type { ExpeditionState } from '../engine/expedition';
import { summarize } from '../engine/expedition';
import type { FactionConfig } from '../engine/faction';
import { button, el, icon, mountApp, panel } from './bha/dom';
import { endTone, iconInfo, val, type IconInfoRow } from './bha/expedition';
import { endReasonText } from './labels';

export function resultView(root: HTMLElement, faction: FactionConfig, exp: ExpeditionState, stability: number, onHome: () => void): void {
  const s = summarize(exp);
  const win = endTone(exp.endReason!) === 'win';
  const wins = exp.battles.filter((b) => b.won).length;
  const names = (ids: string[], f: (id: string) => string) => ids.map(f).join(', ');
  const countRow = (label: string, ic: string, ids: string[], f: (id: string) => string, unit: string, mod: 'good' | 'bad'): IconInfoRow => {
    const v = val(`${ids.length}${unit}`);
    if (ids.length > 0) v.append(el('br'), el('small', '', names(ids, f)));
    return { label, icon: ic, value: v, mod: ids.length > 0 ? mod : undefined };
  };

  const head = el('header', `bha-result bha-result--${win ? 'win' : 'lose'}`);
  const mark = el('span', 'bha-result__mark');
  mark.append(icon(win ? 'i-return' : 'i-broken'));
  head.append(mark, el('h1', 'bha-result__title', win ? '귀환' : faction.defeatStateName), el('p', 'bha-result__reason', endReasonText(exp.endReason!, faction)));

  const rows: IconInfoRow[] = [
    { label: '도달 바퀴', icon: 'i-loop', value: val(`${s.laps}`, `/ 기본 ${BALANCE.expedition.defaultLaps}`) },
    { label: '치른 전투', icon: 'i-practice', value: val(`${exp.battles.length}회`, `(승 ${wins})`) },
    countRow('지킨 타일', 'i-deck', s.kept, (id) => tileName(id, faction.id), '장', 'good'),
    countRow('잃은 타일', 'i-deck', s.lost, (id) => tileName(id, faction.id), '장', 'bad'),
    countRow('얻은 특성', 'i-slot', s.keptTraits, (id) => traitName(id, faction.id), '개', 'good'),
    countRow('잃은 특성', 'i-slot', s.lostTraits, (id) => traitName(id, faction.id), '개', 'bad'),
    {
      label: `${faction.riskGaugeName} (최고 / 끝)`, icon: 'i-risk', mod: exp.breakthrough ? 'em' : undefined,
      value: val(`${Math.round(exp.riskPeak)} / ${Math.round(exp.risk)}`, exp.breakthrough ? '한계 돌파' : undefined),
    },
    { label: faction.stabilityName, icon: 'i-stab', value: val(`${Math.round(stability)}`) },
    { label: '남은 허기', icon: 'i-hunger', value: val(`${Math.round(exp.hunger)}`) },
    { label: '남은 컨디션', icon: 'i-cond', value: val(`${Math.round(exp.condition)}`) },
  ];
  const sum = panel({ title: '원정 요약', aside: faction.huntingGroundName }, iconInfo(rows));

  const seed = el('p', 'bha-faint bha-center bha-num bha-seedline');
  seed.append(`시드 ${exp.seed} · `, icon('i-check', 'sm'), ' 기록이 런 로그에 저장됨');

  const dock = el('div', 'bha-dock');
  dock.append(button({ label: `${faction.nestName}으로`, icon: 'i-nest', variant: 'primary', size: 'lg', block: true, onClick: onHome }));
  mountApp(root, {}, head, sum, seed, dock);
}
