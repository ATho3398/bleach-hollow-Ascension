// 한계 돌파 연출 (U-4): 균열·떨림은 CSS(reduced-motion 이면 정지 화면). 한계 돌파 = 폭주(GDD 23-2): 상태 이름은 종족 설정 frenzyName.
import { BALANCE } from '../config/balance';
import type { FactionConfig } from '../engine/faction';
import { button, chip, el, icon, meter, panel, provisionalTag } from './bha/dom';
import { splitApp } from './bha/split';

const SVG_NS = 'http://www.w3.org/2000/svg';
/** 디자인 원본의 균열 선 (viewBox 390×844) */
const CRACKS = [
  'M195 300 L170 250 L182 200 L150 140 L160 70 L130 0',
  'M195 300 L240 270 L262 210 L310 180 L330 110 L390 80',
  'M195 300 L150 330 L90 320 L60 380 L0 400',
  'M195 300 L230 350 L300 370 L330 440 L390 470',
  'M195 300 L200 380 L170 450 L190 540 L160 640',
  'M182 200 L120 190 L80 220',
  'M262 210 L270 150',
];

export function breakthroughView(root: HTMLElement, faction: FactionConfig, risk: number, resume: () => void): void {
  const cracks = document.createElementNS(SVG_NS, 'svg');
  cracks.setAttribute('class', 'bha-break__cracks');
  cracks.setAttribute('viewBox', '0 0 390 844');
  cracks.setAttribute('preserveAspectRatio', 'none');
  cracks.setAttribute('aria-hidden', 'true');
  for (const d of CRACKS) {
    const p = document.createElementNS(SVG_NS, 'path');
    p.setAttribute('d', d);
    cracks.append(p);
  }

  const badge = chip(`한계 돌파 · ${faction.frenzyName}`, 'danger');
  badge.prepend(icon('i-risk'));

  const gauge = el('div', 'bha-break__gauge');
  gauge.append(meter({ kind: 'risk', label: faction.riskGaugeName, icon: 'i-risk', value: Math.round(risk), max: BALANCE.provisional.risk.limit, zone: 0.6, danger: true }));

  const list = el('ul', 'bha-stack bha-stack--tight bha-small bha-break__list');
  const RX = BALANCE.provisional.risk;
  const pct = (m: number) => Math.round((m - 1) * 100);
  for (const t of [
    `· 주는 피해 +${pct(RX.frenzyDamageDealt)}% · 받는 피해 +${pct(RX.frenzyDamageTaken)}%`,
    '· 공허 블록이 크게 늘어난다',
    `· ${faction.nestName}에 돌아오면 컨디션 −${RX.frenzyConditionLoss}, ${faction.stabilityName}이(가) 떨어진다`,
    `· ${faction.riskGaugeName}는 ${RX.riskAfterBreakthrough}에서 다시 시작한다`,
  ]) list.append(el('li', '', t));
  const penalty = panel({ title: `${faction.frenzyName} — 이번 원정 동안`, aside: provisionalTag('임시 수치') }, list);
  penalty.classList.add('bha-break__penalty');

  const go = button({ label: '계속', variant: 'danger', size: 'lg', block: true, onClick: resume });

  const title = el('h1', 'bha-break__title', faction.breakthroughText);

  // 가로 LCD: 왼쪽 = 균열·배지·제목·게이지, 오른쪽 = 임시 페널티·[계속]
  const app = splitApp(root, { cls: 'bha-break' }, cracks, [badge, title, gauge], [penalty, go]);
  app.classList.add('bha-break--split');
}
