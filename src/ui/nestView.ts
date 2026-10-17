// 둥지 / 대원실 화면 (GDD 7장, P2 최소 버전): 허기·컨디션, 행동 3개, 덱 편성, 출발
import { BALANCE } from '../config/balance';
import { tilesFor, tileName } from '../data/tiles';
import { NEST_ACTIONS, type FactionConfig } from '../engine/faction';
import { applyIdle, doNestAction } from '../engine/nest';
import { sanitizeDeck, type SaveData } from '../game';
import { versionLabel } from '../version';
import { BALANCE as B } from '../config/balance';
import { barOf, el, mountScreen, pct, rowOf } from './dom';
import { organizer, PROVISIONAL_NOTE } from './buildPanel';
import { evolutionPanel } from './evolutionPanel';
import { tileHint } from './labels';

export interface NestViewHandlers {
  onDepart: () => void;
  onPractice: () => void;
  /** 진화 확정: 앱이 performEvolution 을 부르고 연출 화면을 보여 준다 */
  onEvolve: () => void;
  onChangeFaction: () => void;
  persist: () => void;
}

export function nestView(root: HTMLElement, faction: FactionConfig, save: SaveData, h: NestViewHandlers): void {
  applyIdle(save.nest, Date.now());
  save.tiles.deck = sanitizeDeck(save.tiles, faction.id);
  h.persist();
  const rerender = () => nestView(root, faction, save, h);
  const n = save.nest;
  const deckSize = BALANCE.provisional.expedition.deckSize;

  const hungerFill = el('i');
  hungerFill.style.width = pct(n.hunger, 100);
  const condFill = el('i');
  condFill.style.width = pct(n.condition, 100);
  const riskFill = el('i');
  riskFill.style.width = pct(n.risk, B.provisional.risk.limit);
  const stabFill = el('i');
  stabFill.style.width = pct(n.stability, B.provisional.risk.stabilityMax);
  const status = [
    rowOf(el('span', '', '허기'), el('span', 'dim', `${Math.round(n.hunger)} / 100`)),
    barOf('hunger', hungerFill),
    rowOf(el('span', '', '컨디션'), el('span', 'dim', `${Math.round(n.condition)} / 100${n.condition < 40 ? ' (나쁨: 전투에 공허 블록 ↑)' : ''}`)),
    barOf('cond', condFill),
    rowOf(el('span', '', faction.stabilityName), el('span', 'dim', `${Math.round(n.stability)} / ${B.provisional.risk.stabilityMax}`)),
    barOf('stab', stabFill),
    rowOf(el('span', '', faction.riskGaugeName), el('span', 'dim', `${Math.round(n.risk)} / ${B.provisional.risk.limit}${n.risk >= 60 ? ' (높음: 원정 시작부터 위험)' : ''}`)),
    barOf('risk', riskFill),
  ];
  if (n.weakened) status.push(el('div', 'notice', `${faction.defeatStateName} 상태. 재우기로 회복한다.`));

  const actions = el('div', 'stack');
  const acts = el('div', 'grid3');
  for (const a of NEST_ACTIONS) {
    const b = el('button', '', faction.nestActions[a]);
    b.onclick = () => {
      doNestAction(save.nest, a);
      h.persist();
      rerender();
    };
    acts.append(b);
  }
  actions.append(acts);

  // 덱 편성: 가져갈 타일 (원정 중 보상으로 뽑히는 풀)
  const deckBox = el('div', 'stack');
  const count = (id: string) => save.tiles.deck.filter((x) => x === id).length;
  for (const t of tilesFor(faction.id)) {
    const owned = save.tiles.collection[t.id] ?? 0;
    const row = el('div', 'deckrow');
    const label = el('div', 'grow');
    label.append(el('b', '', tileName(t.id, faction.id)), el('div', 'dim', `${tileHint(t)} · 보유 ${owned}`));
    const minus = el('button', 'small', '−');
    const plus = el('button', 'small', '+');
    minus.disabled = count(t.id) === 0;
    plus.disabled = count(t.id) >= owned || save.tiles.deck.length >= deckSize;
    minus.onclick = () => {
      save.tiles.deck.splice(save.tiles.deck.indexOf(t.id), 1);
      h.persist();
      rerender();
    };
    plus.onclick = () => {
      save.tiles.deck.push(t.id);
      h.persist();
      rerender();
    };
    row.append(label, minus, el('span', 'cnt', String(count(t.id))), plus);
    deckBox.append(row);
  }

  const depart = el('button', 'primary', '원정 출발');
  depart.disabled = save.tiles.deck.length === 0;
  depart.onclick = h.onDepart;
  const practice = el('button', '', '전투 연습 (테스트)');
  practice.onclick = h.onPractice;
  const change = el('button', '', '종족 바꾸기');
  change.onclick = h.onChangeFaction;
  const runs = save.runLog.runs;
  mountScreen(
    root,
    el('h1', '', faction.nestName),
    el('p', 'dim', `사냥터: ${faction.huntingGroundName}. 원정 ${runs.length}회 · 귀환 ${runs.filter((r) => r.outcome === 'returned').length} · 패배 ${runs.filter((r) => r.outcome === 'defeated').length}`),
    ...status,
    el('h2', '', '진화'),
    evolutionPanel(faction, save.evolution, h.onEvolve),
    el('h2', '', '돌보기'),
    actions,
    el('h2', '', `흡수 특성 (${faction.slotName})`),
    organizer(faction, save.build, () => {
      h.persist();
      rerender();
    }),
    el('small', 'dim', PROVISIONAL_NOTE),
    el('h2', '', `타일 덱 (${save.tiles.deck.length} / ${deckSize})`),
    el('p', 'dim', '원정 중 보상으로 이 덱에서 타일이 뽑힌다. 뽑힌 타일만 길 옆에 놓을 수 있다.'),
    deckBox,
    depart,
    practice,
    change,
    el('small', 'dim', versionLabel()),
  );
}
