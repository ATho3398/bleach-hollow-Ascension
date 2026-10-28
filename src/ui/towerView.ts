// 도전의 탑 화면 (GDD 36장 3번, C.85): 원정 출발 화면의 [탑] 탭. 왼쪽 = 지금 층·최고 층·다음 층(적 이름·종류·★·보상 미리 보기·[도전]),
// 오른쪽 = 층 목록(지나온 층은 보이기만, 다시 하기 없음). 결과 화면도 여기. 문구는 종족 설정 tower, 화면은 종족 id 로 분기하지 않는다.
import { bossName } from '../data/bosses';
import { pickFaction } from '../data/schema';
import { TITLES, titleName } from '../data/titles';
import { elapsedSeconds, type CombatState } from '../engine/combat';
import { difficultyText, towerFloorText, towerLabels, type FactionConfig } from '../engine/faction';
import { nextTowerFloor, TOWER_FLOORS, towerFloor, towerOpen, type TowerFloor, type TowerReward } from '../engine/tower';
import type { SaveData, TowerOutcome } from '../game';
import { button, el, icon, panel, tag } from './bha/dom';
import { elementLocalRect } from './bha/viewport';
import { iconInfo, type IconInfoRow } from './bha/expedition';
import { lcdPage, selectLast } from './bha/lcdpage';
import { splitApp } from './bha/split';
import { battleLabels } from './labels';
import { departTabs, type DepartTab } from './storyView';
import { playCosmeticFx } from './bha/cosmeticFx';
import { shownName } from './displayName';

export interface TowerViewHandlers {
  onTab: (id: DepartTab) => void;
  onChallenge: (f: TowerFloor) => void;
  onHelp: () => void;
}

/** 층의 적 이름: 꼭대기 = 종족 설정 finalBossName, 보스 = 보스 이름, 아니면 적 이름 */
export function towerEnemyName(faction: FactionConfig, f: TowerFloor): string {
  if (f.final) return shownName(towerLabels(faction).finalBossName);
  if (f.bossId) return shownName(bossName(f.bossId, faction.id));
  return shownName(pickFaction(f.enemy.name, faction.id));
}

export const TOWER_KIND_LABEL: Record<TowerFloor['kind'], string> = { normal: '일반', elite: '강적', boss: '보스' };

/** 보상 한 줄: "골드 30 · 든든한 먹이 1 · 영옥 3 · 칭호 「탑 30층 돌파」" */
export function towerRewardText(faction: FactionConfig, r: TowerReward): string {
  const parts = [`골드 ${r.gold}`];
  if (r.food) parts.push(`${faction.foodNames[r.food]} 1`);
  if (r.jade > 0) parts.push(`영옥 ${r.jade}`);
  const t = r.titleId ? TITLES.find((x) => x.id === r.titleId) : undefined;
  if (t) parts.push(`칭호 「${titleName(t, faction.id)}」`);
  return parts.join(' · ');
}

export function towerView(root: HTMLElement, faction: FactionConfig, save: SaveData, h: TowerViewHandlers): void {
  const L = towerLabels(faction);
  const best = save.tower.best;
  const open = towerOpen(save.runLog, faction.id, best);
  const next = nextTowerFloor(best);

  const help = button({ label: '도움말', icon: 'i-help', iconOnly: true, variant: 'ghost', size: 'small', onClick: h.onHelp });
  const head = el('header', 'bha-exp__head bha-depart-head');
  head.append(departTabs('tower', h.onTab), el('p', 'bha-depart-head__sub', `${L.name} · ${L.desc}`), selectLast(help));

  // 왼쪽: 지금 층·최고 층 + 다음 층 카드
  const left: HTMLElement[] = [];
  const status = el('div', 'bha-tower__status');
  status.append(
    el('b', 'bha-tower__name', L.name),
    el('span', 'bha-faint', `최고 ${best > 0 ? towerFloorText(faction, best) : '없음'} · ${TOWER_FLOORS}층까지`),
  );
  left.push(status);
  if (!open) {
    const lock = el('div', 'bha-tower__card is-locked');
    lock.dataset.tower = 'locked';
    lock.append(icon('i-lock'), el('b', '', '잠김'), el('p', 'bha-faint', L.locked));
    left.push(lock);
  } else if (next === null) {
    const top = el('div', 'bha-tower__card is-cleared');
    top.dataset.tower = 'top';
    top.append(icon('i-title'), el('b', '', `${L.name} 정상`), el('p', 'bha-faint', `${TOWER_FLOORS}층을 모두 올랐다.`));
    left.push(top);
  } else {
    const f = towerFloor(next);
    const card = el('div', `bha-tower__card${f.kind === 'boss' ? ' is-boss' : ''}`);
    card.dataset.tower = 'next';
    const title = el('div', 'bha-tower__floor');
    title.append(el('span', 'bha-label', `다음 · ${towerFloorText(faction, f.floor)}`), el('b', 'bha-tower__foe', towerEnemyName(faction, f)));
    const meta = el('div', 'bha-row');
    meta.append(tag(TOWER_KIND_LABEL[f.kind], f.kind === 'normal' ? 'normal' : 'elite'), el('span', 'bha-num', difficultyText(faction, f.star)));
    if (f.floorMult > 1) meta.append(el('span', 'bha-faint bha-num', `적 +${Math.round((f.floorMult - 1) * 100)}%`));
    const reward = el('p', 'bha-tower__reward');
    reward.append(icon('i-rare'), `첫 클리어 · ${towerRewardText(faction, f.reward)}`);
    const go = button({ label: '도전', icon: 'i-play', variant: 'primary', size: 'lg', onClick: () => h.onChallenge(f) });
    go.dataset.go = 'tower';
    card.append(title, meta, reward, el('p', 'bha-faint', `체력 가득으로 시작하고, 져도 잃는 것이 없다. ${faction.absorbActionName}은(는) 없다.`), go);
    left.push(card);
  }

  // 오른쪽: 층 목록 (위가 높은 층). 지나온 층 = ✓ 보이기만, 다음 층 = 표시, 그 위 = 잠김
  const list = el('ol', 'bha-tower__list');
  list.setAttribute('aria-label', '층 목록');
  for (let n = TOWER_FLOORS; n >= 1; n--) {
    const f = towerFloor(n);
    const done = n <= best;
    const isNext = open && n === next;
    const row = el('li', `bha-tower__row${done ? ' is-cleared' : ''}${isNext ? ' is-next' : ''}${f.kind === 'boss' ? ' is-boss' : ''}`);
    row.dataset.floor = String(n);
    row.append(
      icon(done ? 'i-check' : isNext ? 'i-flag-win' : f.kind === 'boss' ? 'i-attack' : 'i-lock'),
      el('span', 'bha-tower__rowfloor bha-num', towerFloorText(faction, n)),
      el('span', 'bha-tower__rowname', f.kind === 'normal' && !done && !isNext ? '' : towerEnemyName(faction, f)),
      el('small', 'bha-faint bha-num', f.kind === 'normal' ? difficultyText(faction, f.star) : `${TOWER_KIND_LABEL[f.kind]} · ${difficultyText(faction, f.star)}`),
    );
    list.append(row);
  }
  const { app } = lcdPage(root, { cls: 'bha-tower', cols: '2fr 3fr' }, head, left, [list]);
  app.dataset.screen = 'tower';
  // 다음 층이 보이게 목록을 그 자리로 (페이지 전체가 움직이지 않게 스크롤 칸만)
  requestAnimationFrame(() => {
    const row = list.querySelector<HTMLElement>('.is-next');
    if (!row) return;
    for (let box: HTMLElement | null = list; box && box !== app; box = box.parentElement) {
      if (box.scrollHeight > box.clientHeight + 1) {
        box.scrollTop = Math.max(0, elementLocalRect(row).top - elementLocalRect(box).top + box.scrollTop - box.clientHeight / 2); // 기기 안 좌표 (C.183: 세로 회전 출력)
        break;
      }
    }
  });
}

export interface TowerResultHandlers {
  /** 다음 층 바로 도전 (이겼고 다음 층이 있을 때) */
  onNext: (() => void) | null;
  onAgain: () => void;
  onBack: () => void;
}

export function towerResultView(root: HTMLElement, faction: FactionConfig, f: TowerFloor, s: CombatState, res: TowerOutcome, h: TowerResultHandlers): void {
  const labels = battleLabels(faction);
  const L = towerLabels(faction);
  const won = res.won;
  const name = towerEnemyName(faction, f);
  const head = el('header', `bha-result bha-result--${won ? 'win' : 'lose'}`);
  const mark = el('span', 'bha-result__mark');
  mark.append(icon(won ? 'i-flag-win' : 'i-broken'));
  head.append(
    mark,
    el('span', 'bha-label', `${L.name} · ${towerFloorText(faction, f.floor)} · ${name}`),
    el('h1', 'bha-result__title', won ? (f.final ? `${L.name} 정상` : '돌파') : labels.defeatState),
    el('p', 'bha-result__reason', won ? `${name}을(를) 쓰러뜨렸다.` : s.lossReason === 'timeout' ? '시간 제한을 넘겼다. 그 층에서 다시 도전할 수 있다.' : '체력이 다했다. 그 층에서 다시 도전할 수 있다.'),
  );
  const rows: IconInfoRow[] = [
    { label: '층', icon: 'i-flag-win', value: `${towerFloorText(faction, f.floor)} · ${TOWER_KIND_LABEL[f.kind]} · ${difficultyText(faction, f.star)}` },
    { label: '전투 시간', icon: 'i-timer', value: `${elapsedSeconds(s).toFixed(1)}초` },
  ];
  if (res.firstClear) rows.push({ label: '첫 클리어 보상', icon: 'i-rare', mod: 'good', value: towerRewardText(faction, f.reward) });
  else if (won) rows.push({ label: '보상', icon: 'i-rare', value: '이미 받은 층' });
  rows.push({ label: '다음', icon: 'i-play', value: res.next === null ? '정상에 올랐다' : towerFloorText(faction, res.next) });
  const dock = el('div', 'bha-dock');
  if (h.onNext) dock.append(button({ label: `${towerFloorText(faction, res.next!)} 도전`, icon: 'i-play', variant: 'primary', size: 'lg', onClick: h.onNext }));
  else if (!won) dock.append(button({ label: '다시 도전', icon: 'i-loop', variant: 'primary', size: 'lg', onClick: h.onAgain }));
  dock.append(button({ label: L.name, icon: 'i-return', size: h.onNext || !won ? undefined : 'lg', variant: h.onNext || !won ? undefined : 'primary', onClick: h.onBack }));
  const app = splitApp(root, { cls: 'bha-resultpage', sticky: true }, null, [head, dock], [panel({}, iconInfo(rows))]);
  app.dataset.screen = 'tower-result';
  if (won) playCosmeticFx('win', app);
}
