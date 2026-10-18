// 전투 연습 (U-4): 상대 목록(계통·종류 필터) + 연습 결과. 연습 전투 화면 자체는 battleView.
import { ENEMIES, enemyPatternKind } from '../data/enemies';
import { LINEAGES, lineageName, lineageShortName } from '../data/lineages';
import { pickFaction, type EnemyDef, type EnemyPatternKind } from '../data/schema';
import { traitName } from '../data/traits';
import { absorbReasons } from '../engine/absorb';
import { elapsedSeconds, type CombatState } from '../engine/combat';
import type { FactionConfig } from '../engine/faction';
import { absorbConditionText } from './absorbView';
import { button, el, icon, mountApp, panel, tag } from './bha/dom';
import { ALL, filterFoes, iconInfo, val, type IconInfoRow, type PracticeFilter } from './bha/expedition';
import { lineageClass, lineageIconId, lineageMark } from './bha/lineage';
import { battleLabels } from './labels';

/** 연습 목록용 패턴 이름 (임시 표시) */
export const PATTERN_LABEL: Record<EnemyPatternKind, string> = {
  basic: '기본형', swift: '속공형', sturdy: '단단형', 'heavy-seal': '강공격·봉인', 'heavy-chain': '연속 강공격', stance: '방어 자세·반격',
};
const PATTERN_ICON: Record<EnemyPatternKind, string> = {
  basic: 'i-basic', swift: 'i-pattern-fast', sturdy: 'i-pattern-tough', 'heavy-seal': 'i-pattern-heavy', 'heavy-chain': 'i-pattern-heavy', stance: 'i-guard',
};
const RANKS: readonly { id: string; label: string }[] = [{ id: ALL, label: '전체' }, { id: 'normal', label: '일반' }, { id: 'elite', label: '강적' }];

export interface PracticeListHandlers {
  onPick: (enemy: EnemyDef) => void;
  onHome: () => void;
}

/** 필터는 화면 상태만 (저장하지 않는다). 연습 메뉴로 돌아와도 처음부터 */
export function practiceListView(root: HTMLElement, faction: FactionConfig, recordCount: number, h: PracticeListHandlers): void {
  const labels = battleLabels(faction);
  const filter: PracticeFilter = { lineage: ALL, rank: ALL };

  const topbar = el('header', 'bha-topbar');
  const main = el('div', 'bha-topbar__main');
  const sub = el('p', 'bha-topbar__sub');
  sub.append('상대를 고르면 바로 전투가 시작된다 · 전투 기록 ', el('b', '', String(recordCount)), '판 저장됨');
  main.append(el('h1', 'bha-topbar__title', `${labels.factionName} · 전투 연습`), sub);
  topbar.append(main);

  const segOf = (label: string, items: HTMLElement[]) => {
    const s = el('div', 'bha-seg bha-seg--sm');
    s.setAttribute('role', 'radiogroup');
    s.setAttribute('aria-label', label);
    s.append(...items);
    return s;
  };
  const choice = (cls: string): HTMLButtonElement => {
    const b = el('button', cls);
    b.type = 'button';
    b.setAttribute('role', 'radio');
    return b;
  };
  const linBtns = [{ id: ALL, label: '전체' }, ...LINEAGES.map((l) => ({ id: l.id, label: '' }))].map((it) => {
    const b = choice('bha-seg__item');
    if (it.id === ALL) b.append(it.label);
    else {
      b.append(lineageMark(it.id, faction.id, lineageShortName(it.id, faction.id)));
      b.setAttribute('aria-label', lineageName(it.id, faction.id));
    }
    b.onclick = () => {
      filter.lineage = it.id;
      refresh();
    };
    return { id: it.id, b };
  });
  const rankBtns = RANKS.map((r) => {
    const b = choice('bha-seg__item');
    b.append(r.label);
    b.onclick = () => {
      filter.rank = r.id;
      refresh();
    };
    return { id: r.id, b };
  });
  const count = el('span', 'bha-faint bha-num');
  const rankSeg = segOf('종류', rankBtns.map((x) => x.b));
  const rankRow = el('div', 'bha-row');
  rankRow.append(rankSeg, count);
  const filters = el('div', 'bha-practice__filters');
  filters.append(segOf('약점 계통', linBtns.map((x) => x.b)), rankRow);

  const listEl = el('div', 'bha-foelist');
  const dock = el('div', 'bha-dock');
  dock.append(button({ label: `${faction.nestName}으로`, icon: 'i-nest', size: 'lg', block: true, onClick: h.onHome }));

  function refresh(): void {
    for (const x of linBtns) {
      x.b.classList.toggle('is-active', x.id === filter.lineage);
      x.b.setAttribute('aria-checked', String(x.id === filter.lineage));
    }
    for (const x of rankBtns) {
      x.b.classList.toggle('is-active', x.id === filter.rank);
      x.b.setAttribute('aria-checked', String(x.id === filter.rank));
    }
    const foes = filterFoes(ENEMIES, filter);
    count.textContent = `${foes.length}명`;
    listEl.replaceChildren();
    for (const enemy of foes) {
      const pat = enemyPatternKind(enemy);
      const row = el('button', ['bha-foerow', lineageClass(enemy.weaknessLineageId)].filter(Boolean).join(' '));
      row.type = 'button';
      const mark = el('span', 'bha-foerow__mark');
      mark.append(icon(lineageIconId(enemy.weaknessLineageId)));
      const name = el('span', 'bha-foerow__name', pickFaction(enemy.name, faction.id));
      name.append(' ', tag(enemy.class === 'elite' ? '강적' : '일반', enemy.class));
      const meta = el('span', 'bha-foerow__meta');
      meta.append(icon(PATTERN_ICON[pat]), `${PATTERN_LABEL[pat]} · 약점 ${lineageName(enemy.weaknessLineageId, faction.id)}`);
      const body = el('span');
      body.append(name, meta);
      row.append(mark, body, icon('i-chevron-right'));
      row.onclick = () => h.onPick(enemy);
      listEl.append(row);
    }
  }
  refresh();
  mountApp(root, {}, topbar, filters, listEl, dock);
}

export interface PracticeResultHandlers {
  onAgain: () => void;
  onMenu: () => void;
}

export function practiceResultView(root: HTMLElement, faction: FactionConfig, enemy: EnemyDef, s: CombatState, h: PracticeResultHandlers): void {
  const labels = battleLabels(faction);
  const won = s.status === 'won';
  const reasons = absorbReasons(s);
  const fin = s.finisher;
  const finText = !fin
    ? '-'
    : fin.kind === 'skill'
      ? `${fin.traitId && fin.lineageId ? traitName(fin.traitId, faction.id) : labels.basicBlock}${fin.lineageId ? ` (${lineageName(fin.lineageId, faction.id)})` : ''}`
      : { 'basic-attack': '기본 공격', special: labels.specialBlock, void: labels.voidBlock, reflect: '반사', stored: labels.storedSkill, skill: '' }[fin.kind];
  const name = pickFaction(enemy.name, faction.id);

  const head = el('header', `bha-result bha-result--${won ? 'win' : 'lose'}`);
  const mark = el('span', 'bha-result__mark');
  mark.append(icon(won ? 'i-flag-win' : 'i-broken'));
  head.append(
    mark,
    el('span', 'bha-label', `연습 결과 · ${name}`),
    el('h1', 'bha-result__title', won ? '승리' : labels.defeatState),
    el('p', 'bha-result__reason', won ? `${name}을(를) 쓰러뜨렸다.` : s.lossReason === 'timeout' ? '시간 제한을 넘겼다.' : '체력이 다했다.'),
  );

  const rows: IconInfoRow[] = [
    { label: '전투 시간', icon: 'i-timer', value: `${elapsedSeconds(s).toFixed(1)}초` },
    { label: `블록 사용 (${labels.chain}1 / 2 / 3)`, icon: 'i-chain-1', value: s.blocksByChain.join(' / ') },
    { label: `${labels.chain}3 발동`, icon: 'i-chain-3', value: `${s.chain3Count}회` },
    { label: '강공격 막기', icon: 'i-guard', value: `${s.guardSuccesses}회` },
    { label: labels.storedSkill, icon: 'i-stored', mod: 'em', value: `${s.storedUsed}회 사용 (낭비 ${Math.round(s.storedWasted)})` },
    { label: labels.specialBlock, icon: 'i-special', value: s.specialUsed ? '사용' : '안 씀' },
    { label: `${labels.voidBlock} (${labels.riskGauge} 상승)`, icon: 'i-void', value: val(`${s.voidUsed}회`, `(+${s.riskGained})`) },
    { label: '마무리 일격', icon: 'i-attack', value: finText },
    { label: faction.absorbActionName, icon: 'i-absorb', mod: reasons.length > 0 ? 'good' : undefined, value: `${reasons.length > 0 ? '가능' : '불가'} (연습에서는 쓰지 않음)` },
  ];

  const seed = el('p', 'bha-faint bha-center bha-num bha-seedline');
  seed.append(`시드 ${s.seed} · `, icon('i-check', 'sm'), ' 기록이 런 로그에 저장됨');
  const dock = el('div', 'bha-dock');
  const two = el('div', 'bha-dock__row bha-dock__row--two');
  two.append(
    button({ label: '같은 상대와 다시', icon: 'i-loop', variant: 'primary', size: 'lg', onClick: h.onAgain }),
    button({ label: '연습 메뉴로', size: 'lg', onClick: h.onMenu }),
  );
  dock.append(two);
  mountApp(root, {}, head, panel({}, iconInfo(rows)), el('p', 'bha-faint bha-center', absorbConditionText(faction, enemy.weaknessLineageId)), seed, dock);
}
