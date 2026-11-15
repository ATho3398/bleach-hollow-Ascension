// 특수던전 화면 (GDD 6-16 v6.017, C.427): 월드맵 장소(옛 탑 자리). 위 탭 [탑][주간던전][보스전], 처음 = 탑.
//  - 탑 탭 = 옛 도전의 탑 화면 그대로(towerView 에 머리만 바꿔 끼움)
//  - 주간던전·보스전 = 사용자 스케치(docs/design/user-art/special-dungeon-1112/layout-sketch.jpg, 세로 폰 그림을 가로로 읽음):
//    왼쪽 = 위아래로 끌어 넘기는 버튼 목록, 누르면 선택 강조 + 오른쪽 큰 칸에 그 던전/보스 그림 + 이름·★ 고르기·이번 주 남은 횟수·보상·[입장].
//    그림은 아직 없어 사냥터 배경·무대 장면으로 대신 — 장면 키는 종족 설정 specialDungeon.weekly[트랙].art · bossArt[칸 id](파일만 바꾸면 된다)
// 문구는 종족 설정, 화면은 종족 id 로 분기하지 않는다.
import { sceneBg } from '../data/art/backgrounds';
import { bossName } from '../data/bosses';
import { HOGYOKU_MATERIAL_NAMES, HOGYOKU_TRACK_NAMES } from '../data/hogyoku';
import { difficultyLabels, difficultyText, specialDungeonLabels, towerLabels, type FactionConfig } from '../engine/faction';
import {
  bossKey, bossRushEntries, bossRushOpen, bossRushReward, entriesLeft, entryLimit, nextResetAt, selectableStars, weeklyKey, weeklyReward, WEEKLY_DUNGEONS,
  type BossRushEntry, type SpecialTab,
} from '../engine/specialDungeon';
import { TOWER_FLOORS } from '../engine/tower';
import { recommendedDifficulty } from '../engine/difficulty';
import type { HogyokuTrackId } from '../engine/transcend';
import type { SaveData } from '../game';
import { button, el, icon, seg } from './bha/dom';
import { enableDragScrollY } from './bha/dragScroll';
import { lcdPage, selectLast } from './bha/lcdpage';
import { sceneBgEl } from './bha/sceneBg';
import { shownName } from './displayName';
import { elapsedSeconds, type CombatState } from '../engine/combat';
import type { SpecialOutcome } from '../game';
import { iconInfo, type IconInfoRow } from './bha/expedition';
import { splitApp } from './bha/split';
import { panel } from './bha/dom';
import { asBack } from './bha/screenBack';
import { playCosmeticFx } from './bha/cosmeticFx';
import { battleLabels } from './labels';

const ART_BASE = (import.meta as { env?: { BASE_URL?: string } }).env?.BASE_URL ?? '/';

export interface SpecialDungeonHandlers {
  onTab: (tab: SpecialTab) => void;
  onHelp: () => void;
  onWeekly: (track: HogyokuTrackId, star: number) => void;
  onBoss: (e: BossRushEntry, star: number) => void;
}

/** 화면 안에서 고른 것 (탭을 오가도 유지 — 앱이 다시 그릴 때 그대로) */
const pick: { weekly: number; boss: number; star: Record<string, number> } = { weekly: 0, boss: 0, star: {} };

/** 특수던전 머리: 이름 + 위 탭 + 도움말. 탑 탭도 이 머리를 쓴다 */
export function specialHead(faction: FactionConfig, tab: SpecialTab, h: Pick<SpecialDungeonHandlers, 'onTab' | 'onHelp'>): HTMLElement {
  const L = specialDungeonLabels(faction);
  const head = el('header', 'bha-exp__head bha-depart-head bha-sdg__head');
  const tabs = seg([
    { id: 'tower', label: L.tabs.tower },
    { id: 'weekly', label: L.tabs.weekly },
    { id: 'boss', label: L.tabs.boss },
  ], tab, (id) => h.onTab(id as SpecialTab), { small: true });
  tabs.classList.add('bha-sdg__tabs');
  tabs.dataset.sdgTabs = '';
  const help = button({ label: '도움말', icon: 'i-help', iconOnly: true, variant: 'ghost', size: 'small', onClick: h.onHelp });
  head.append(el('h2', 'bha-plan__title', L.name), tabs, selectLast(help));
  return head;
}

/** 주간던전 이름: 종족 설정, 없으면 '<트랙 이름> 던전' */
export function weeklyName(faction: FactionConfig, track: HogyokuTrackId): string {
  return specialDungeonLabels(faction).weekly[track]?.name ?? `${HOGYOKU_TRACK_NAMES[track]} 던전`;
}

/** 보스전 칸 이름: 탑의 주인 = 종족 설정 tower.finalBossName */
export function bossRushName(faction: FactionConfig, e: BossRushEntry): string {
  return shownName(e.owner ? towerLabels(faction).finalBossName : bossName(e.bossId, faction.id));
}

/** 다음 초기화까지 "3일 4시간" */
export function resetInText(nowMs: number): string {
  const ms = Math.max(0, nextResetAt(nowMs) - nowMs);
  const d = Math.floor(ms / 86_400_000);
  const h = Math.floor((ms % 86_400_000) / 3_600_000);
  return d > 0 ? `${d}일 ${h}시간` : h > 0 ? `${h}시간` : `${Math.max(1, Math.ceil(ms / 60_000))}분`;
}

interface Card {
  key: string;
  name: string;
  sub: string;
  icon: string;
  art: string | undefined;
  open: boolean;
  lockText: string;
  reward: string;
  rule: string;
  enter: (star: number) => void;
}

export function specialDungeonView(root: HTMLElement, faction: FactionConfig, save: SaveData, tab: Exclude<SpecialTab, 'tower'>, h: SpecialDungeonHandlers, nowMs: number = Date.now()): void {
  const L = specialDungeonLabels(faction);
  const st = save.shared.special;
  const cards: Card[] = tab === 'weekly'
    ? WEEKLY_DUNGEONS.map((t) => ({
      key: weeklyKey(t), name: weeklyName(faction, t), sub: `${HOGYOKU_TRACK_NAMES[t]} 재료`, icon: 'i-rare', art: L.weekly[t]?.art ?? faction.arenaBg, open: true, lockText: '',
      reward: '', rule: '전투 3판 연속(일반 · 일반 · 강적) · 체력은 이어 간다 · 지면 실패',
      enter: (star) => h.onWeekly(t, star),
    }))
    : bossRushEntries().map((e) => ({
      key: bossKey(e.id), name: bossRushName(faction, e), sub: e.owner ? `${towerLabels(faction).name} 꼭대기` : '스토리 보스', icon: 'i-attack', art: L.bossArt[e.id] ?? faction.arenaBg,
      open: bossRushOpen(e, save.bossDex, save.tower.best, TOWER_FLOORS),
      lockText: e.owner ? `${towerLabels(faction).name} ${TOWER_FLOORS}층을 깨면 열린다` : '스토리에서 이 보스를 이기면 열린다',
      reward: '', rule: '보스 한 판 · 제한 시간 안에 쓰러뜨려야 한다 · 첫 처치 보상·칭호·보스 특성은 스토리에서만',
      enter: (star) => h.onBoss(e, star),
    }));
  const sel = Math.min(cards.length - 1, Math.max(0, pick[tab]));
  const stars = selectableStars(save.difficulty.unlocked);
  const rec = Math.min(stars.length, recommendedDifficulty(save.evolution.tierIndex));

  // 왼쪽: 위아래로 끌어 넘기는 버튼 목록
  const list = el('div', 'bha-sdg__list');
  list.setAttribute('role', 'listbox');
  list.setAttribute('aria-label', tab === 'weekly' ? L.tabs.weekly : L.tabs.boss);
  list.dataset.sdgList = tab;
  enableDragScrollY(list);
  const items = cards.map((c, i) => {
    const b = el('button', `bha-sdg__item${c.open ? '' : ' is-locked'}`);
    b.type = 'button';
    b.setAttribute('role', 'option');
    b.dataset.key = c.key;
    const left = entriesLeft(st, c.key, nowMs);
    const name = el('span', 'bha-sdg__itemname');
    name.append(el('b', '', c.name), el('small', 'bha-faint', c.open ? c.sub : '잠김'));
    b.append(icon(c.open ? c.icon : 'i-lock'), name, el('span', `bha-sdg__count bha-num${left <= 0 ? ' is-empty' : ''}`, `${left}/${entryLimit(c.key)}`));
    b.onclick = () => show(i);
    list.append(b);
    return b;
  });

  // 오른쪽: 큰 그림 칸 + 이름·★·남은 횟수·보상·[입장]
  const stage = el('div', 'bha-sdg__stage');
  stage.dataset.sdgStage = tab;

  function show(i: number): void {
    pick[tab] = i;
    const c = cards[i]!;
    items.forEach((b, j) => {
      b.classList.toggle('is-selected', j === i);
      b.setAttribute('aria-selected', String(j === i));
    });
    const star = Math.min(stars.length, pick.star[c.key] ?? rec);
    const left = entriesLeft(st, c.key, nowMs);
    const art = el('div', 'bha-sdg__art');
    art.dataset.art = c.art ?? '';
    const bg = sceneBg(c.art, ART_BASE);
    if (bg) art.append(sceneBgEl(bg, false));
    const cap = el('div', 'bha-sdg__cap');
    cap.append(el('span', 'bha-label', c.sub), el('b', 'bha-sdg__title', c.name));
    art.append(cap);
    if (!c.open) {
      const lock = el('div', 'bha-sdg__lock');
      lock.append(icon('i-lock'), el('span', '', c.lockText));
      art.append(lock);
    }
    const info = el('div', 'bha-sdg__info');
    const starSeg = seg(stars.map((n) => ({ id: String(n), label: `${difficultyText(faction, n)}${n === rec ? ` ${difficultyLabels(faction).recommended}` : ''}` })), String(star), (id) => { pick.star[c.key] = Number(id); show(i); }, { small: true });
    starSeg.classList.add('bha-sdg__stars');
    const rw = tab === 'weekly' ? weeklyReward(WEEKLY_DUNGEONS[i]!, star) : null;
    const br = tab === 'boss' ? bossRushReward(star) : null;
    const rewardText = rw ? `${HOGYOKU_MATERIAL_NAMES[rw.track]} ${rw.material} · 골드 ${rw.gold}` : `${WEEKLY_DUNGEONS.map((t) => `${HOGYOKU_MATERIAL_NAMES[t]} ${br!.each}`).join(' · ')} · 골드 ${br!.gold}`;
    const reward = el('p', 'bha-sdg__reward');
    reward.append(icon('i-rare'), `승리 보상 · ${rewardText}`);
    const count = el('p', 'bha-sdg__left bha-faint');
    count.append(icon('i-timer'), `이번 주 남은 횟수 ${left}/${entryLimit(c.key)} · ${resetInText(nowMs)} 뒤 초기화(월요일 05:00)`);
    const go = button({ label: left > 0 ? '입장' : '이번 주 끝', icon: 'i-play', variant: 'primary', size: 'lg', disabled: !c.open || left <= 0, onClick: () => c.enter(star) });
    go.dataset.go = tab;
    const row = el('div', 'bha-sdg__go');
    row.append(starSeg, go);
    info.append(el('p', 'bha-sdg__rule bha-faint', c.rule), reward, count, row);
    stage.replaceChildren(art, info);
  }
  show(sel);

  const head = specialHead(faction, tab, h);
  const { app } = lcdPage(root, { cls: 'bha-tower bha-sdg', cols: '1fr 2.2fr' }, head, [list], [stage]);
  app.dataset.screen = `special-${tab}`;
  // 고른 버튼이 목록 안에 보이게 (스크롤 칸만)
  requestAnimationFrame(() => {
    const b = items[sel];
    if (b && list.scrollHeight > list.clientHeight) list.scrollTop = Math.max(0, b.offsetTop - list.clientHeight / 2);
  });
}

/** 테스트·캡처용: 화면 선택 초기화 */
export function resetSpecialPick(): void {
  pick.weekly = 0;
  pick.boss = 0;
  pick.star = {};
}

export interface SpecialRunView {
  mode: 'weekly' | 'boss';
  target: string;
  name: string;
  star: number;
  total: number;
  battles: CombatState[];
}

/** 받은 보상 한 줄 */
export function specialRewardText(res: SpecialOutcome): string {
  const parts = Object.entries(res.materials).filter(([, n]) => (n ?? 0) > 0).map(([t, n]) => `${HOGYOKU_MATERIAL_NAMES[t as HogyokuTrackId]} +${n}`);
  if (res.gold > 0) parts.push(`골드 +${res.gold}`);
  return parts.join(' · ') || '없음';
}

/** 주간던전·보스전 결과: 판마다 결과·받은 보상·이번 주 남은 횟수 → [특수던전] */
export function specialResultView(root: HTMLElement, faction: FactionConfig, save: SaveData, run: SpecialRunView, res: SpecialOutcome, h: { onBack: () => void }, nowMs: number = Date.now()): void {
  const L = specialDungeonLabels(faction);
  const won = res.won;
  const last = run.battles[run.battles.length - 1];
  const head = el('header', `bha-result bha-result--${won ? 'win' : 'lose'}`);
  const mark = el('span', 'bha-result__mark');
  mark.append(icon(won ? 'i-flag-win' : 'i-broken'));
  const reason = won ? (run.mode === 'weekly' ? `${run.total}판을 모두 이겼다.` : `${run.name}을(를) 쓰러뜨렸다.`)
    : run.battles.length < run.total && last?.status === 'won' ? '도중에 나왔다. 입장 횟수는 돌려받지 못한다.'
    : last?.lossReason === 'timeout' ? '시간 제한을 넘겼다. 입장 횟수는 돌려받지 못한다.' : '체력이 다했다. 입장 횟수는 돌려받지 못한다.';
  head.append(
    mark,
    el('span', 'bha-label', `${L.name} · ${run.mode === 'weekly' ? L.tabs.weekly : L.tabs.boss} · ${run.name} · ${difficultyText(faction, run.star)}`),
    el('h1', 'bha-result__title', won ? '클리어' : battleLabels(faction).defeatState),
    el('p', 'bha-result__reason', reason),
  );
  const rows: IconInfoRow[] = run.battles.map((b, i) => ({
    label: run.total > 1 ? `${i + 1}판` : '전투', icon: b.status === 'won' ? 'i-check' : 'i-broken', mod: b.status === 'won' ? 'good' : undefined,
    value: `${b.status === 'won' ? '승리' : '패배'} · ${elapsedSeconds(b).toFixed(1)}초 · 시작 체력 ${Math.round(b.params.playerStartHpFraction * 100)}%`,
  }));
  rows.push({ label: '보상', icon: 'i-rare', mod: won ? 'good' : undefined, value: won ? specialRewardText(res) : '없음 (다 이겨야 받는다)' });
  const key = run.mode === 'weekly' ? weeklyKey(run.target as HogyokuTrackId) : bossKey(run.target);
  rows.push({ label: '이번 주', icon: 'i-timer', value: `남은 횟수 ${entriesLeft(save.shared.special, key, nowMs)}/${entryLimit(key)}` });
  const dock = el('div', 'bha-dock');
  dock.append(asBack(button({ label: L.name, icon: 'i-return', size: 'lg', variant: 'primary', onClick: h.onBack })));
  const app = splitApp(root, { cls: 'bha-resultpage', sticky: true }, null, [head, dock], [panel({}, iconInfo(rows))]);
  app.dataset.screen = 'special-result';
  if (won) playCosmeticFx('win', app);
}
