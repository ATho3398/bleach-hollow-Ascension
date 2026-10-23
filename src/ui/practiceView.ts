// 전투 연습 (U-4): 상대 목록(속성·종류 필터) + 연습 결과. 연습 전투 화면 자체는 battleView.
import { ENEMIES, enemyPatternKind } from '../data/enemies';
import { ELEMENT_IDS, elementAbbr, elementName } from '../data/elements';
import { pickFaction, type EnemyDef, type EnemyPatternKind } from '../data/schema';
import { traitName } from '../data/traits';
import { absorbReasons } from '../engine/absorb';
import { BASIC_SKILL_ID, comboOf, isBasicBlockId, elapsedSeconds, sourceOf, type CombatState } from '../engine/combat';
import type { FactionConfig } from '../engine/faction';
import { absorbRuleText, weaknessText } from './absorbView';
import { button, el, icon, panel, tag } from './bha/dom';
import { splitApp } from './bha/split';
import { lcdHead, lcdPage } from './bha/lcdpage';
import { ALL, filterFoes, iconInfo, val, type IconInfoRow, type PracticeFilter } from './bha/expedition';
import { elementDot, elementMark, paintElement } from './bha/element';
import { battleLabels, comboBlockLabel, liberationBlockLabel, skillBlockLabel } from './labels';

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
}

/** 필터는 화면 상태만 (저장하지 않는다). 연습 메뉴로 돌아와도 처음부터 */
export function practiceListView(root: HTMLElement, faction: FactionConfig, recordCount: number, h: PracticeListHandlers): void {
  const labels = battleLabels(faction);
  const filter: PracticeFilter = { element: ALL, rank: ALL };

  const sub = el('span');
  sub.append('상대를 고르면 바로 전투가 시작된다 · 기록 ', el('b', '', String(recordCount)), '판');

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
  const linBtns = [{ id: ALL, label: '전체' }, ...ELEMENT_IDS.map((id) => ({ id, label: '' }))].map((it) => {
    const b = choice('bha-seg__item');
    if (it.id === ALL) b.append(it.label);
    else {
      b.append(elementMark(it.id, faction.id, elementAbbr(it.id, faction.id)));
      b.setAttribute('aria-label', elementName(it.id, faction.id));
    }
    b.onclick = () => {
      filter.element = it.id;
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
  filters.append(segOf('적 속성', linBtns.map((x) => x.b)), rankRow);

  const listEl = el('div', 'bha-foelist');

  function refresh(): void {
    for (const x of linBtns) {
      x.b.classList.toggle('is-active', x.id === filter.element);
      x.b.setAttribute('aria-checked', String(x.id === filter.element));
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
      const row = paintElement(el('button', 'bha-foerow'), enemy.element);
      row.type = 'button';
      const mark = el('span', 'bha-foerow__mark');
      mark.append(elementDot(enemy.element, faction.id));
      const name = el('span', 'bha-foerow__name', pickFaction(enemy.name, faction.id));
      name.append(' ', tag(enemy.class === 'elite' ? '강적' : '일반', enemy.class));
      const meta = el('span', 'bha-foerow__meta');
      const weak = weaknessText(enemy, faction.id);
      meta.append(icon(PATTERN_ICON[pat]), `${PATTERN_LABEL[pat]} · ${elementName(enemy.element, faction.id)}${weak ? ` · 약점 ${weak}` : ''}`);
      const body = el('span');
      body.append(name, meta);
      row.append(mark, body, icon('i-chevron-right'));
      row.onclick = () => h.onPick(enemy);
      listEl.append(row);
    }
  }
  refresh();
  // 가로 LCD (T-3): 머리 = 제목, 왼쪽 = 필터, 오른쪽 = 상대 목록 (목록만 그 열 안에서 스크롤). 돌아가기는 취소 버튼
  lcdPage(root, { cls: 'bha-practicepage', cols: 'minmax(0, 0.8fr) minmax(0, 1.2fr)' }, lcdHead({ title: `${labels.factionName} · 전투 연습`, sub }), [filters], [listEl]);
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
  // 마무리 일격 이름 (GDD 20장 v5.4): 스킬 = `속성_계열`(기본 블록은 내 캐릭터 속성), 콤보 = `콤보_계열`
  const finSkill = () => {
    const src = sourceOf(s.params, fin!.traitId);
    const element = fin!.element ?? (isBasicBlockId(fin!.traitId) ? s.params.playerElements[0] ?? null : null);
    return skillBlockLabel(labels, faction.id, element, fin!.family ?? src?.family, src?.role ?? 'attack') ?? (fin!.traitId && !isBasicBlockId(fin!.traitId) ? traitName(fin!.traitId, faction.id) : labels.skillBlock);
  };
  const finText = !fin
    ? '-'
    : fin.kind === 'skill'
      ? finSkill()
      : { 'basic-attack': '기본 공격', special: '필살(옛 기록)', void: labels.voidBlock, reflect: '반사', stored: '저장 필살(옛 기록)', combo: comboBlockLabel(labels, comboOf(s.params, fin.traitId)?.family), dot: '독', liberation: liberationBlockLabel(faction.id, fin.element), skill: '' }[fin.kind];
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
    ...(Object.keys(s.chainsByFamily).length > 0
      ? [{ label: `계열별 ${labels.chain} (1 / 2 / 3)`, icon: 'i-chain-2', value: Object.entries(s.chainsByFamily).map(([f, v]) => `${labels.families.find((x) => x.id === f)?.abbr ?? f} ${v.join('/')}`).join(' · ') }]
      : []),
    ...(s.params.combos.length > 0 ? [{ label: '콤보 (발동 / 사용)', icon: 'i-special', value: `${s.combosTriggered}회 / ${s.comboBlocksUsed}회` }] : []),
    { label: '강공격 막기', icon: 'i-guard', value: `${s.guardSuccesses}회` },
    { label: labels.liberation.name, icon: 'i-special', mod: 'em', value: `${s.liberation.uses}회 사용 (해방 중 ${labels.chain} ${s.liberation.chains}회)` },
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
  splitApp(root, { cls: 'bha-resultpage', sticky: true }, null, [head, seed, dock], [panel({}, iconInfo(rows)), el('p', 'bha-faint bha-center', absorbRuleText(faction, enemy))]);
}
