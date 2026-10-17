// 흡수 화면 (GDD 4장, 4-1): 전투 승리 후 흡수 / 놓아줌 → 특성 후보 선택 → 슬롯 장착(가득 차면 교체/포기).
// 문구는 FactionConfig(absorbActionName, tileNames, riskGaugeName, stabilityName …)에서 읽는다.
import { BALANCE } from '../config/balance';
import { getEnemy } from '../data/enemies';
import { lineageName } from '../data/lineages';
import { pickFaction } from '../data/schema';
import { getTrait, traitDescription, traitName } from '../data/traits';
import { absorbRisk, isFull, lineageCounts } from '../engine/absorb';
import { chooseAbsorb, chooseRelease, type ExpeditionState } from '../engine/expedition';
import type { FactionConfig } from '../engine/faction';
import { el, mountScreen } from './dom';
import { PROVISIONAL_NOTE, slotPanel, traitLabel } from './buildPanel';

const AX = BALANCE.provisional.absorb;
const RX = BALANCE.provisional.risk;

export function absorbView(root: HTMLElement, faction: FactionConfig, exp: ExpeditionState, onDone: (absorbed: boolean) => void): void {
  const offer = exp.absorbOffer;
  if (!offer) return onDone(false);
  const enemy = getEnemy(offer.enemyId);
  const act = faction.absorbActionName;
  let step: 'choose' | 'pick' | 'replace' = 'choose';
  let picked: string | null = null;
  let error = '';

  const finish = (r: { ok: true } | { ok: false; reason: string }, absorbed: boolean) => {
    if (!r.ok) {
      error = r.reason;
      render();
    } else onDone(absorbed);
  };

  function render(): void {
    const info = el('div');
    const risk = absorbRisk(offer!.strength);
    info.innerHTML = `<table>
      <tr><td>상대</td><td>${pickFaction(enemy.name, faction.id)} (${offer!.elite ? '강적' : '일반'})</td></tr>
      <tr><td>계통</td><td>${lineageName(offer!.lineageId, faction.id)}</td></tr>
      <tr><td>${faction.tileNames.absorb} 게이지</td><td>${offer!.absorbGained.toFixed(1)} / 필요 ${AX.threshold}</td></tr>
      <tr><td>${act}하면</td><td>허기 리셋 · ${faction.riskGaugeName} +${Math.round(risk)} · 타일 +1</td></tr>
      <tr><td>놓아주면</td><td>${faction.riskGaugeName} −${RX.releaseRelief} · ${faction.stabilityName} +${RX.releaseStability}</td></tr>
      <tr><td>지금 ${faction.riskGaugeName}</td><td>${Math.round(exp.risk)} / ${RX.limit}${exp.risk + risk >= RX.limit ? ' — 흡수하면 한계 돌파!' : ''}</td></tr></table>`;
    const nodes: HTMLElement[] = [
      el('h1', '', `${act} 가능`),
      el('p', 'dim', `${pickFaction(enemy.name, faction.id)}을(를) 쓰러뜨렸다.`),
    ];
    if (offer!.rare) nodes.push(el('div', 'notice rare', '희귀 개체! 이 개체의 희귀 특성이 후보에 확정으로 나온다.'));
    nodes.push(info, slotPanel(faction, exp.build));

    if (step === 'choose') {
      const a = el('button', 'primary', act);
      a.onclick = () => {
        step = 'pick';
        render();
      };
      const r = el('button', '', '놓아준다');
      r.onclick = () => finish(chooseRelease(exp), false);
      const row = el('div', 'grid2');
      row.append(a, r);
      nodes.push(row);
    } else if (step === 'pick') {
      nodes.push(el('h2', '', '특성 후보 (1개 고르기)'));
      if (offer!.candidates.length === 0) {
        nodes.push(el('p', 'dim', '이 계통에서 새로 얻을 특성이 없다. 효과만 얻는다.'));
        const go = el('button', 'primary', `특성 없이 ${act}`);
        go.onclick = () => finish(chooseAbsorb(exp, null), true);
        nodes.push(go);
      }
      for (const id of offer!.candidates) {
        const t = getTrait(id);
        const n = (lineageCounts(exp.build)[t.lineageId] ?? 0) + 1;
        const b = el('button', 'cand');
        b.append(
          el('b', '', traitLabel(faction, id)),
          el('div', 'dim', traitDescription(id, faction.id)),
          el('small', 'dim', `장착하면 ${lineageName(t.lineageId, faction.id)} ${Math.min(n, AX.lineageBonusCount)}/${AX.lineageBonusCount}${n >= AX.lineageBonusCount && !isFull(exp.build) ? ` → ${faction.lineageBonusName}!` : ''}`),
        );
        b.onclick = () => {
          if (isFull(exp.build)) {
            picked = id;
            step = 'replace';
            render();
          } else finish(chooseAbsorb(exp, id), true);
        };
        nodes.push(b);
      }
      const back = el('button', '', '돌아가기');
      back.onclick = () => {
        step = 'choose';
        render();
      };
      nodes.push(back);
    } else {
      nodes.push(el('h2', '', `${faction.slotName}: 가득 참`), el('p', 'dim', `${traitName(picked!, faction.id)}을(를) 어느 슬롯과 바꿀까? 포기하면 특성 없이 ${act} 효과만 얻는다.`));
      exp.build.slots.forEach((id, i) => {
        const b = el('button', 'cand');
        b.append(el('b', '', `${i + 1}번 교체: ${traitLabel(faction, id!)}`), el('div', 'dim', '교체된 특성은 보유 목록에 남아 둥지에서 다시 장착할 수 있다'));
        b.onclick = () => finish(chooseAbsorb(exp, picked, i), true);
        nodes.push(b);
      });
      const giveUp = el('button', '', '포기 (특성 없이 흡수)');
      giveUp.onclick = () => finish(chooseAbsorb(exp, null), true);
      const back = el('button', '', '돌아가기');
      back.onclick = () => {
        step = 'pick';
        render();
      };
      nodes.push(giveUp, back);
    }
    if (error) nodes.push(el('div', 'notice', error));
    nodes.push(el('small', 'dim', PROVISIONAL_NOTE));
    mountScreen(root, ...nodes);
  }
  render();
}
