// 등급전 화면 (GDD 21장, C.49): 왼쪽 = 번호 사다리(No.1 → No.10 → 무번호), 오른쪽 = 지금 도전할 상대와 [도전] / 막힌 이유. 결과 화면은 rankResultView.
// 번호의 표시 이름은 종족 설정 rankNames·unrankedName 에서 읽는다 (엔진은 번호만, 종족 id 분기 없음). 번호 보유자는 자리 표시 데이터(provisional).
import { elementName } from '../data/elements';
import { RANK_COUNT, getHolder, type RankHolderDef } from '../data/ranks';
import { enemyPatternKind } from '../data/enemies';
import { pickFaction } from '../data/schema';
import { elapsedSeconds, type CombatState } from '../engine/combat';
import type { FactionConfig } from '../engine/faction';
import { holderAt, PLAYER_ID, rankOf, type ChallengeResult } from '../engine/rank';
import { rankChallenge, type SaveData } from '../game';
import { button, el, icon, notice, panel, provisionalTag, tag } from './bha/dom';
import { elementDot, paintElement } from './bha/element';
import { iconInfo, type IconInfoRow } from './bha/expedition';
import { toward } from './bha/nestLogic';
import { lcdHead, lcdPage } from './bha/lcdpage';
import { splitApp } from './bha/split';
import { PATTERN_LABEL } from './practiceView';
import { battleLabels } from './labels';
import { playCosmeticFx } from './bha/cosmeticFx';

/** 번호(1~10, null = 무번호)의 종족별 표시 이름 */
export function rankLabel(faction: FactionConfig, n: number | null): string {
  return n === null ? faction.unrankedName : (faction.rankNames[n - 1] ?? `No.${n}`);
}

/** 번호 보유자 한 줄 설명: 속성 · 분류 · 패턴 */
function holderMeta(h: RankHolderDef, faction: FactionConfig): string {
  const cat = battleLabels(faction).families.find((f) => f.category === h.category)?.abbr;
  return `${elementName(h.element, faction.id)}${cat ? ` · ${cat}` : ''} · ${PATTERN_LABEL[enemyPatternKind(h)]}`;
}

export interface RankHandlers {
  onChallenge: (holder: RankHolderDef) => void;
}

/** 도전 전 안내 (C.68): 무번호에서 지면 내려갈 칸이 없어 그대로다 (엔진 rank.ts 규칙과 같게) */
export function rankStakeText(faction: Pick<FactionConfig, 'unrankedName'>, target: string, me: number | null): string {
  return `이기면 ${target}을(를) 빼앗고 상대는 한 칸 내려간다. ${me === null ? `지면 ${faction.unrankedName} 그대로다.` : '지면 한 칸 내려간다.'}`;
}

/** 패배 문구 (C.68): 원래 무번호였으면 "한 칸 내려갔다" 대신 그대로라고 쓴다 */
export function rankLoseLine(faction: Pick<FactionConfig, 'unrankedName' | 'rankLoseText'>, res: Pick<ChallengeResult, 'before' | 'after'>): string {
  return res.before === null && res.after === null ? `패배… ${faction.unrankedName} 그대로다.` : faction.rankLoseText;
}

export function rankView(root: HTMLElement, faction: FactionConfig, save: SaveData, h: RankHandlers): void {
  const r = save.rank;
  const me = rankOf(r);
  const sub = el('span');
  sub.append('지금 ', el('b', '', rankLabel(faction, me)), ` · ${r.wins}승 ${r.losses}패 `, provisionalTag('상대 임시'));

  // ── 왼쪽: 사다리 ──
  const list = el('ol', 'bha-ranklist');
  list.setAttribute('aria-label', '등급표');
  for (let n = 1; n <= RANK_COUNT + 1; n++) {
    const id = n <= RANK_COUNT ? holderAt(r, n)! : r.ladder[RANK_COUNT]!;
    const mine = id === PLAYER_ID;
    const row = el('li', `bha-rankrow${mine ? ' is-me' : ''}`);
    const num = el('span', 'bha-rankrow__num bha-num', n <= RANK_COUNT ? String(n) : '-');
    const name = el('span', 'bha-rankrow__name', rankLabel(faction, n <= RANK_COUNT ? n : null));
    const who = el('span', 'bha-rankrow__who');
    if (mine) who.append(tag('나', 'kind'));
    else {
      const holder = getHolder(id);
      who.append(elementDot(holder.element, faction.id), pickFaction(holder.name, faction.id));
    }
    row.append(num, name, who);
    list.append(row);
  }

  // ── 오른쪽: 도전 ──
  const right: HTMLElement[] = [];
  const c = rankChallenge(save);
  if (c.ok) {
    const holder = getHolder(c.opponentId);
    const card = paintElement(el('div', 'bha-rankfoe'), holder.element);
    const mark = el('span', 'bha-foerow__mark');
    mark.append(elementDot(holder.element, faction.id));
    const body = el('div');
    const nm = el('span', 'bha-foerow__name', `${rankLabel(faction, c.targetRank)} · ${pickFaction(holder.name, faction.id)}`);
    body.append(nm, el('span', 'bha-foerow__meta', holderMeta(holder, faction)));
    card.append(mark, body);
    right.push(
      card,
      el('p', 'bha-faint', rankStakeText(faction, rankLabel(faction, c.targetRank), me)),
      // 버튼 = "<상대 번호>에 도전" (C.68: 사신 이름이 "석차 도전"이라 "석차 도전 도전"으로 겹쳤다)
      button({ label: `${rankLabel(faction, c.targetRank)}에 도전`, icon: 'i-attack', variant: 'primary', size: 'lg', onClick: () => h.onChallenge(holder) }),
    );
  } else if (c.reason === 'locked') {
    right.push(notice('info', `${faction.tierNames[4]}이(가) 되면 ${faction.rankBattleName}이(가) 열린다.`, { icon: 'i-lock', title: '아직 잠김' }));
  } else if (c.reason === 'top') {
    right.push(notice('good', `${rankLabel(faction, 1)} — 더 오를 곳이 없다.`, { icon: 'i-flag-win', title: '정상' }));
  } else {
    const holder = getHolder(c.opponentId!);
    right.push(notice('warn', `${pickFaction(holder.name, faction.id)}에게 졌다. 원정을 한 번 다녀온 뒤 다시 도전할 수 있다.`, { icon: 'i-timer', title: '재도전 대기' }));
  }
  if (r.history.everRanked) right.push(el('p', 'bha-faint', `최고 기록 ${rankLabel(faction, r.history.best)}`));

  lcdPage(root, { cls: 'bha-rankpage', cols: 'minmax(0, 1.1fr) minmax(0, 0.9fr)' }, lcdHead({ title: faction.rankBattleName, sub }), [list], right);
}

export interface RankResultHandlers {
  onBack: () => void;
}

export function rankResultView(root: HTMLElement, faction: FactionConfig, holder: RankHolderDef, s: CombatState, res: ChallengeResult, h: RankResultHandlers): void {
  const labels = battleLabels(faction);
  const won = res.won;
  const name = pickFaction(holder.name, faction.id);
  const head = el('header', `bha-result bha-result--${won ? 'win' : 'lose'}`);
  const mark = el('span', 'bha-result__mark');
  mark.append(icon(won ? 'i-flag-win' : 'i-broken'));
  head.append(
    mark,
    el('span', 'bha-label', `${faction.rankBattleName} · ${name}`),
    el('h1', 'bha-result__title', won ? '승리' : labels.defeatState),
    el('p', 'bha-result__reason', won ? faction.rankWinText.replace('{rank}', rankLabel(faction, res.after)) : rankLoseLine(faction, res)),
  );
  const rows: IconInfoRow[] = [
    { label: '내 등급', icon: 'i-title', mod: won ? 'good' : undefined, value: `${rankLabel(faction, res.before)} → ${rankLabel(faction, res.after)}` },
    { label: `${name}`, icon: 'i-attack', value: `${rankLabel(faction, res.opponentBefore)} → ${rankLabel(faction, res.opponentAfter)}` },
    { label: '전투 시간', icon: 'i-timer', value: `${elapsedSeconds(s).toFixed(1)}초` },
    { label: `${labels.chain}3 발동`, icon: 'i-chain-3', value: `${s.chain3Count}회` },
    { label: '강공격 막기', icon: 'i-guard', value: `${s.guardSuccesses}회` },
  ];
  if (!won) rows.push({ label: '재도전', icon: 'i-loop', value: '원정을 한 번 다녀온 뒤' });
  const dock = el('div', 'bha-dock');
  dock.append(button({ label: toward(faction.rankBattleName), icon: 'i-return', variant: 'primary', size: 'lg', onClick: h.onBack }));
  const app = splitApp(root, { cls: 'bha-resultpage', sticky: true }, null, [head, dock], [panel({}, iconInfo(rows))]);
  if (won) playCosmeticFx('win', app); // 승리 연출 꾸밈 (GDD 25-11): 등급 획득
}
