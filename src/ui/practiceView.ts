// 전투 연습 (U-4): 수련장 훈련 인형 입구(C.471 — [전투 들어가기], 상대는 전투 안 적 설정 창) + 연습 결과 화면. 연습 전투 화면 자체는 battleView.
import { pickFaction, type EnemyDef, type EnemyPatternKind } from '../data/schema';
import { traitName } from '../data/traits';
import { comboOf, isBasicBlockId, elapsedSeconds, sourceOf, type CombatState } from '../engine/combat';
import type { FactionConfig } from '../engine/faction';
import { button, el, icon, panel } from './bha/dom';
import { splitApp } from './bha/split';
import { lcdHead, lcdPage } from './bha/lcdpage';
import { iconInfo, val, type IconInfoRow } from './bha/expedition';
import { battleLabels, comboBlockLabel, liberationBlockLabel, skillBlockLabel } from './labels';
import { devText, shownName } from './displayName';
import { asBack } from './bha/screenBack';

/** 연습 목록용 패턴 이름 (임시 표시) */
export const PATTERN_LABEL: Record<EnemyPatternKind, string> = {
  basic: '기본형', swift: '속공형', sturdy: '단단형', 'heavy-seal': '강공격·봉인', 'heavy-chain': '연속 강공격', stance: '방어 자세·반격',
};
export interface PracticeEntryHandlers {
  /** [전투 들어가기]: 빈 적 자리 + 적 설정 창 전투로 (GDD 8-9, C.471) */
  onEnter: () => void;
  /** 머리 제목 (수련장 토글, GDD 99장 2). 없으면 글자 제목 */
  title?: Node;
}

/** 수련장 훈련 인형 입구 (GDD 8-9, C.471 사용자 2026-11-17 "전투 들어간 뒤에 훈련장 설정 있고 그 창에서 설정해서 나오는 식"):
 *  상대 목록 대신 [전투 들어가기] 하나 — 들어가면 빈 적 자리 + 적 설정 창(테스트 전투와 같은 창, 적 = 훈련 인형 + 도감에서 본 적) */
export function practiceEntryView(root: HTMLElement, faction: FactionConfig, recordCount: number, h: PracticeEntryHandlers): void {
  const labels = battleLabels(faction);
  const sub = el('span');
  sub.append('들어가서 창에서 상대를 정한다 · 기록 ', el('b', '', String(recordCount)), '판');
  const rules = el('ul', 'bha-practice__rules');
  for (const t of [
    '상대 = 기본 훈련 인형 + 적 도감에서 만난 적',
    '★ = 연 난이도까지 · 체력·공격력 = 내 기본 공격 n회 분량',
    '쓰러뜨리면 결과 창 없이 다시 설정 창이 뜬다',
    '보상·사망 없음 · 펫도 같이 싸운다',
  ]) rules.append(el('li', '', t));
  const enter = button({ label: '전투 들어가기', icon: 'i-attack', variant: 'primary', size: 'lg', onClick: h.onEnter });
  enter.dataset.sc = 'practice-enter';
  const right = el('div', 'bha-practice__enter');
  right.append(enter);
  // 가로 LCD (T-3): 머리 = 제목(수련장 토글), 왼쪽 = 규칙, 오른쪽 = [전투 들어가기]. 돌아가기는 취소 버튼
  lcdPage(root, { cls: 'bha-practicepage', cols: 'minmax(0, 1.2fr) minmax(0, 0.8fr)' }, lcdHead({ title: h.title ?? `${labels.factionName} · 전투 연습`, sub }), [rules], [right]);
}

export interface PracticeResultHandlers {
  onAgain: () => void;
  onMenu: () => void;
}

export function practiceResultView(root: HTMLElement, faction: FactionConfig, enemy: EnemyDef, s: CombatState, h: PracticeResultHandlers): void {
  const labels = battleLabels(faction);
  const won = s.status === 'won';
  const fin = s.finisher;
  // 마무리 일격 이름 (GDD 20장 v5.4): 스킬 = 계열 약어·막기·회복(84장 4번), 콤보 = `콤보_계열`
  const finSkill = () => {
    const src = sourceOf(s.params, fin!.traitId);
    return skillBlockLabel(labels, fin!.family ?? src?.family, src?.role ?? 'attack') ?? (fin!.traitId && !isBasicBlockId(fin!.traitId) ? traitName(fin!.traitId, faction.id) : labels.skillBlock);
  };
  const finText = !fin
    ? '-'
    : fin.kind === 'skill'
      ? finSkill()
      : { 'basic-attack': '일반 공격', special: '필살(옛 기록)', void: labels.voidBlock, reflect: '반사', stored: '저장 필살(옛 기록)', combo: comboBlockLabel(labels, comboOf(s.params, fin.traitId)?.family), dot: '독', liberation: liberationBlockLabel(faction.id, fin.element), gear: '장비 발동', pet: '펫 공격', skill: '' }[fin.kind];
  const name = shownName(pickFaction(enemy.name, faction.id));

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
    { label: s.params.kit?.liberationName ?? labels.liberation.name, icon: 'i-special', mod: 'em', value: `${s.liberation.uses}회 사용 (해방 중 ${labels.chain} ${s.liberation.chains}회)` },
    { label: `${labels.voidBlock} (${labels.riskGauge} 상승)`, icon: 'i-void', value: val(`${s.voidUsed}회`, `(+${s.riskGained})`) },
    { label: '마무리 일격', icon: 'i-attack', value: finText },
  ];

  const seed = el('p', 'bha-faint bha-center bha-num bha-seedline');
  if (devText()) seed.append(`시드 ${s.seed} · `, icon('i-check', 'sm'), ' 기록이 런 로그에 저장됐다'); // 시드·런 로그 = 테스트 모드만 (GDD 176장 21)
  else seed.append(icon('i-check', 'sm'), ' 기록을 남겼다');
  const dock = el('div', 'bha-dock');
  const two = el('div', 'bha-dock__row bha-dock__row--two');
  two.append(
    button({ label: '같은 상대와 다시', icon: 'i-loop', variant: 'primary', size: 'lg', onClick: h.onAgain }),
    asBack(button({ label: '연습 메뉴로', size: 'lg', onClick: h.onMenu })),
  );
  dock.append(two);
  splitApp(root, { cls: 'bha-resultpage', sticky: true }, null, [head, seed, dock], [panel({}, iconInfo(rows))]); // 수련장은 흡수가 없다 — 흡수 규칙 안내 줄 삭제 (C.457)
}
