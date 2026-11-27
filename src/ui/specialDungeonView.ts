// 특수던전 화면 (GDD 6-16 v6.017 → v6.246, C.427·C.564): 월드맵 장소(옛 탑 자리). 위 탭 [탑][요일던전][보스전], 처음 = 탑.
//  - 탑 탭 = 옛 도전의 탑 화면 그대로(towerView 에 머리만 바꿔 끼움)
//  - 요일던전(C.564, 옛 주간던전): 붕옥 재료 던전 3개는 열린 요일에만(닫힌 날 = 자물쇠 + '월·목에 열린다'), 골드·장비·장신구·장비 재료 던전은 매일(장비·장신구는 그 기능 해금 전 자물쇠). 횟수 = 하루 단위
//  - 요일던전·보스전 = 사용자 스케치(docs/design/user-art/special-dungeon-1112/layout-sketch.jpg, 세로 폰 그림을 가로로 읽음):
//    왼쪽 = 위아래로 끌어 넘기는 버튼 목록, 누르면 선택 강조 + 오른쪽 큰 칸에 그 던전/보스 그림 + 이름·★ 고르기·이번 주 남은 횟수·보상·[입장].
//    그림은 아직 없어 사냥터 배경·무대 장면으로 대신 — 장면 키는 종족 설정 specialDungeon.daily[던전].art · bossArt[칸 id](파일만 바꾸면 된다)
// 문구는 종족 설정, 화면은 종족 id 로 분기하지 않는다.
import { sceneBg } from '../data/art/backgrounds';
import { bossRushDisplayName } from '../data/bossRush';
import { foeEl } from './bha/battle';
import { HOGYOKU_MATERIAL_NAMES, HOGYOKU_TRACK_NAMES } from '../data/hogyoku';
import { difficultyLabels, difficultyText, specialDungeonLabels, towerLabels, type FactionConfig } from '../engine/faction';
import {
  bossKey, bossRushEntries, bossRushOpen, bossRushReward, bossRushStars, raidEntries, raidKey, raidOpen, raidReward, raidStars, DAILY_DUNGEONS, dailyFeature, dailyKey, dailyOpenText, dailyOpenToday, dailyReward, isDailyTicket, isHogyokuDungeon,
  nextDayAt, nextResetAt, selectableStars, ticketOf, ticketsLeft,
  type BossRushEntry, type RaidEntry, type DailyDungeonId, type SpecialMode, type SpecialTab, type TicketKind,
} from '../engine/specialDungeon';
import { BALANCE } from '../config/balance';
import { featureUnlocked, unlockWhenText } from '../engine/unlocks';
import { getMaterial } from '../data/materials';
import { GEAR_GRADE_NAMES, type GearGrade, type GearKind } from '../data/gear';
import { gearKindName } from '../inventory';
import { fixParticles } from '../engine/josa';
import { TOWER_FLOORS } from '../engine/tower';
import { recommendedDifficulty } from '../engine/difficulty';
import { HOGYOKU_TRACK_IDS, type HogyokuTrackId } from '../engine/transcend';
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
  /** practice = 연습(입장권 없이, 보상·기록 없음 — C.564) */
  onDaily: (id: DailyDungeonId, star: number, practice: boolean) => void;
  onBoss: (e: BossRushEntry, star: number, practice: boolean) => void;
  /** 토벌전 작전 (C.566) */
  onRaid: (e: RaidEntry, star: number, practice: boolean) => void;
}

/** 화면 안에서 고른 것 (탭을 오가도 유지 — 앱이 다시 그릴 때 그대로) */
const pick: { daily: number; boss: number; raid: number; star: Record<string, number> } = { daily: 0, boss: 0, raid: 0, star: {} };

/** 특수던전 머리: 이름 + 위 탭 + 도움말. 탑 탭도 이 머리를 쓴다 */
export function specialHead(faction: FactionConfig, tab: SpecialTab, h: Pick<SpecialDungeonHandlers, 'onTab' | 'onHelp'>): HTMLElement {
  const L = specialDungeonLabels(faction);
  const head = el('header', 'bha-exp__head bha-depart-head bha-sdg__head');
  const tabs = seg([
    { id: 'tower', label: L.tabs.tower },
    { id: 'daily', label: L.tabs.daily },
    { id: 'boss', label: L.tabs.boss },
    { id: 'raid', label: L.tabs.raid },
  ], tab, (id) => h.onTab(id as SpecialTab), { small: true });
  tabs.classList.add('bha-sdg__tabs');
  tabs.dataset.sdgTabs = '';
  const help = button({ label: '도움말', icon: 'i-help', iconOnly: true, variant: 'ghost', size: 'small', onClick: h.onHelp });
  head.append(el('h2', 'bha-plan__title', L.name), tabs, selectLast(help));
  return head;
}

/** 요일던전 이름: 종족 설정, 없으면 '<트랙 이름> 던전' / 던전 id */
export function dailyName(faction: FactionConfig, id: DailyDungeonId): string {
  return specialDungeonLabels(faction).daily[id]?.name ?? (isHogyokuDungeon(id) ? `${HOGYOKU_TRACK_NAMES[id]} 던전` : id);
}

/** 요일던전 목록 작은 글씨: 무엇이 나오나 */
export function dailySub(faction: FactionConfig, id: DailyDungeonId): string {
  if (isHogyokuDungeon(id)) return HOGYOKU_MATERIAL_NAMES[id];
  return id === 'gold' ? '골드' : id === 'gear' ? '장비' : id === 'accessory' ? '장신구' : '장비 재료';
}

const DAILY_ICONS: Record<DailyDungeonId, string> = { soul: 'i-rare', shard: 'i-rare', essence: 'i-rare', gold: 'i-sp', gear: 'i-attack', accessory: 'i-special', gearMat: 'i-shelf' };

/** 요일던전 보상 한 줄 (★마다) */
export function dailyRewardText(faction: FactionConfig, id: DailyDungeonId, star: number): string {
  const r = dailyReward(id, star);
  const parts: string[] = [];
  if (r.hogyoku) parts.push(`${HOGYOKU_MATERIAL_NAMES[r.hogyoku.track]} ${r.hogyoku.amount}`);
  if (r.gear) parts.push(`${r.gear.kinds.length === 1 ? gearKindName(r.gear.kinds[0] as GearKind, faction) : '장비'} 1개(${difficultyText(faction, star)} · 등급 무작위)`);
  if (r.gearMats > 0) parts.push(`장비 재료 ${r.gearMats}개(무작위)`);
  if (r.gold > 0) parts.push(`골드 ${r.gold}`);
  return parts.join(' · ');
}

/** 토벌전 작전 이름 (C.566): 종족 설정 specialDungeon.raids, 없으면 id */
export function raidName(faction: FactionConfig, e: Pick<RaidEntry, 'id'>): string {
  return specialDungeonLabels(faction).raids[e.id]?.name ?? e.id;
}

/** 보스전 칸 이름 (C.565): 데이터 이름(두 종족 같은 이름) */
export function bossRushName(faction: FactionConfig, e: Pick<BossRushEntry, 'id'>): string {
  return shownName(bossRushDisplayName(e.id, faction.id));
}

/** 다음 초기화까지 "3일 4시간" (daily = 다음 날 바뀜까지) */
export function resetInText(nowMs: number, daily = false): string {
  const ms = Math.max(0, (daily ? nextDayAt(nowMs) : nextResetAt(nowMs)) - nowMs);
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
  enter: (star: number, practice: boolean) => void;
  /** 고를 수 있는 ★ (없으면 1 ~ 연 난이도) — 보스전 = 권장 이하 (C.565) */
  stars?: number[];
  /** 그림 칸에 실루엣 (그림 없는 보스, C.565) */
  silhouette?: boolean;
}

/** 입장권 채움 한 줄: "매일 05:00 에 2장까지 채움 · 17시간 뒤" */
export function ticketRefillText(kind: TicketKind, nowMs: number): string {
  const n = BALANCE.provisional.specialDungeon.tickets[kind].refill;
  return isDailyTicket(kind) ? `매일 05:00 에 ${n}장까지 채움 · ${resetInText(nowMs, true)} 뒤` : `월요일 05:00 에 ${n}장까지 채움 · ${resetInText(nowMs)} 뒤`;
}

export function specialDungeonView(root: HTMLElement, faction: FactionConfig, save: SaveData, tab: Exclude<SpecialTab, 'tower'>, h: SpecialDungeonHandlers, nowMs: number = Date.now()): void {
  const L = specialDungeonLabels(faction);
  const st = save.shared.special;
  const tk: TicketKind = ticketOf(tab);
  const tickets = ticketsLeft(save.tower.tickets, tk, nowMs);
  const cards: Card[] = tab === 'daily'
    ? DAILY_DUNGEONS.map((id) => {
      const feat = dailyFeature(id);
      const featOpen = !feat || featureUnlocked(save, feat);
      const today = dailyOpenToday(id, nowMs);
      return {
        key: dailyKey(id), name: dailyName(faction, id), sub: dailySub(faction, id), icon: DAILY_ICONS[id], art: L.daily[id]?.art ?? faction.arenaBg,
        open: featOpen && today,
        lockText: !featOpen && feat ? fixParticles(`${unlockWhenText(faction, feat)} 열린다`) : dailyOpenText(id),
        reward: '', rule: '전투 3판 연속(일반 · 일반 · 강적) · 체력은 이어 간다 · 지면 실패',
        enter: (star, practice) => h.onDaily(id, star, practice),
      };
    })
    : tab === 'raid' ? raidEntries().map((e) => ({
      key: raidKey(e.id), name: raidName(faction, e), sub: `끝 보스 ${bossRushName(faction, e.boss)}`, icon: 'i-flag-win', art: L.raids[e.id]?.art ?? faction.arenaBg,
      open: raidOpen(e, st.clears),
      lockText: fixParticles(`보스전에서 ${bossRushName(faction, e.boss)}을(를) 이기면 열린다`),
      reward: '', rule: `${L.raids[e.id]?.desc ? `${L.raids[e.id]!.desc} · ` : ''}모험 한 바퀴(12칸) · 일반·강적 칸이 정해져 있고 마지막 칸 = 보스 · 체력은 이어 간다 · 지면 실패`,
      enter: (star, practice) => h.onRaid(e, star, practice),
      stars: raidStars(e, save.difficulty.unlocked),
      silhouette: true,
    }))
    : bossRushEntries().map((e) => {
      const prev = e.index > 0 ? bossRushEntries()[e.index - 1] : undefined;
      return {
        key: bossKey(e.id), name: bossRushName(faction, e), sub: `권장 ${difficultyText(faction, e.def.star)}${e.def.scale > 1 ? ' 강화' : ''}`, icon: 'i-attack', art: L.bossArt[e.id] ?? faction.arenaBg,
        open: bossRushOpen(e, st.clears),
        lockText: prev ? fixParticles(`${bossRushName(faction, prev)}을(를) 이기면 열린다`) : '',
        reward: '', rule: '보스 한 판 · 제한 시간 안에 쓰러뜨려야 한다 · 고를 수 있는 ★ = 권장 이하',
        enter: (star, practice) => h.onBoss(e, star, practice),
        stars: bossRushStars(e, save.difficulty.unlocked),
        silhouette: true,
      };
    });
  const sel = Math.min(cards.length - 1, Math.max(0, pick[tab]));
  const stars = selectableStars(save.difficulty.unlocked);
  const rec = Math.min(stars.length, recommendedDifficulty(save.evolution.tierIndex));

  // 왼쪽: 위아래로 끌어 넘기는 버튼 목록
  const list = el('div', 'bha-sdg__list');
  list.setAttribute('role', 'listbox');
  list.setAttribute('aria-label', L.tabs[tab]);
  list.dataset.sdgList = tab;
  enableDragScrollY(list);
  const items = cards.map((c, i) => {
    const b = el('button', `bha-sdg__item${c.open ? '' : ' is-locked'}`);
    b.type = 'button';
    b.setAttribute('role', 'option');
    b.dataset.key = c.key;
    const best = st.best[c.key] ?? 0;
    const name = el('span', 'bha-sdg__itemname');
    name.append(el('b', '', c.name), el('small', 'bha-faint', c.open ? c.sub : c.lockText));
    // 오른쪽 작은 칸 = 이긴 최고 ★ (C.564: 던전마다 세던 남은 횟수 → 입장권으로 대체)
    b.append(icon(c.open ? c.icon : 'i-lock'), name, el('span', `bha-sdg__count bha-num${best <= 0 ? ' is-empty' : ''}`, best > 0 ? difficultyText(faction, best) : '—'));
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
    const cStars = c.stars ?? stars;
    const cRec = Math.min(cStars.length, rec);
    const star = Math.min(cStars.length, pick.star[c.key] ?? (c.stars ? cStars.length : rec));
    const art = el('div', 'bha-sdg__art');
    art.dataset.art = c.art ?? '';
    const bg = sceneBg(c.art, ART_BASE);
    if (bg) art.append(sceneBgEl(bg, false));
    if (c.silhouette) {
      const foe = el('div', 'bha-sdg__foe');
      foe.append(foeEl('foe-b', null));
      art.append(foe);
    }
    const cap = el('div', 'bha-sdg__cap');
    cap.append(el('span', 'bha-label', c.sub), el('b', 'bha-sdg__title', c.name));
    art.append(cap);
    if (!c.open) {
      const lock = el('div', 'bha-sdg__lock');
      lock.append(icon('i-lock'), el('span', '', c.lockText));
      art.append(lock);
    }
    const info = el('div', 'bha-sdg__info');
    const starSeg = seg(cStars.map((n) => ({ id: String(n), label: `${difficultyText(faction, n)}${n === (c.stars ? cStars.length : cRec) ? ` ${difficultyLabels(faction).recommended}` : ''}` })), String(star), (id) => { pick.star[c.key] = Number(id); show(i); }, { small: true });
    starSeg.classList.add('bha-sdg__stars');
    const br = tab === 'boss' ? bossRushReward(star) : tab === 'raid' ? raidReward(star) : null;
    const rewardText = tab === 'daily' ? dailyRewardText(faction, DAILY_DUNGEONS[i]!, star) : `${HOGYOKU_TRACK_IDS.map((t) => `${HOGYOKU_MATERIAL_NAMES[t]} ${br!.each}`).join(' · ')} · 골드 ${br!.gold}${tab === 'raid' ? ' · 장비 1개(등급 무작위)' : ''}`;
    const reward = el('p', 'bha-sdg__reward');
    reward.append(icon('i-rare'), `승리 보상 · ${rewardText}`);
    const count = el('p', 'bha-sdg__left bha-faint');
    count.append(icon('i-timer'), `${L.tickets[tk]} ${tickets}장 · 입장 1번 = 1장 · ${ticketRefillText(tk, nowMs)}`);
    const go = button({ label: !c.open ? '잠김' : tickets > 0 ? '입장' : '입장권 없음', icon: 'i-play', variant: 'primary', size: 'lg', disabled: !c.open || tickets <= 0, onClick: () => c.enter(star, false) });
    go.dataset.go = tab;
    // 연습 (C.564, GDD 6-16 v6.248): 입장권 없이 같은 적·같은 ★ — 보상·도감·열림 진행·기록 없음. 잠긴 던전은 연습도 잠김
    const practice = button({ label: '연습', icon: 'i-practice', variant: 'ghost', size: 'lg', disabled: !c.open, onClick: () => c.enter(star, true) });
    practice.dataset.practice = tab;
    practice.title = '입장권을 쓰지 않는다 · 보상·기록 없음';
    const row = el('div', 'bha-sdg__go');
    row.append(starSeg, practice, go);
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
  pick.daily = 0;
  pick.boss = 0;
  pick.raid = 0;
  pick.star = {};
}

export interface SpecialRunView {
  mode: SpecialMode;
  /** 연습 (C.564): 보상 없음 */
  practice?: boolean;
  target: string;
  name: string;
  star: number;
  total: number;
  battles: CombatState[];
}

/** 받은 보상 한 줄 */
export function specialRewardText(res: SpecialOutcome, faction: FactionConfig): string {
  const parts = Object.entries(res.materials).filter(([, n]) => (n ?? 0) > 0).map(([t, n]) => `${HOGYOKU_MATERIAL_NAMES[t as HogyokuTrackId]} +${n}`);
  for (const g of res.gear) parts.push(`${GEAR_GRADE_NAMES[g.grade as GearGrade]} ${gearKindName(g.kind as GearKind, faction)}${g.sold > 0 ? `(가방이 가득 — 골드 +${g.sold})` : ''}`);
  for (const [id, n] of Object.entries(res.items)) parts.push(`${getMaterial(id)?.name ?? id} +${n}`);
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
  const reason = won ? (run.total > 1 ? `${run.total}판을 모두 이겼다.` : `${run.name}을(를) 쓰러뜨렸다.`)
    : run.practice ? '연습이 끝났다. 잃은 것은 없다.'
    : run.battles.length < run.total && last?.status === 'won' ? '도중에 나왔다. 입장권은 돌려받지 못한다.'
    : last?.lossReason === 'timeout' ? '시간 제한을 넘겼다. 입장권은 돌려받지 못한다.' : last?.lossReason === 'executed' ? '처형을 막지 못했다. 입장권은 돌려받지 못한다.' : '체력이 다했다. 입장권은 돌려받지 못한다.';
  head.append(
    mark,
    el('span', 'bha-label', `${L.name} · ${L.tabs[run.mode]}${run.practice ? ' 연습' : ''} · ${run.name} · ${difficultyText(faction, run.star)}`),
    el('h1', 'bha-result__title', won ? '클리어' : battleLabels(faction).defeatState),
    el('p', 'bha-result__reason', reason),
  );
  const rows: IconInfoRow[] = run.battles.map((b, i) => ({
    label: run.total > 1 ? `${i + 1}판` : '전투', icon: b.status === 'won' ? 'i-check' : 'i-broken', mod: b.status === 'won' ? 'good' : undefined,
    value: `${b.status === 'won' ? '승리' : '패배'} · ${elapsedSeconds(b).toFixed(1)}초 · 시작 체력 ${Math.round(b.params.playerStartHpFraction * 100)}%`,
  }));
  rows.push({ label: '보상', icon: 'i-rare', mod: won && !run.practice ? 'good' : undefined, value: run.practice ? '없음 (연습)' : won ? specialRewardText(res, faction) : '없음 (다 이겨야 받는다)' });
  const tk = ticketOf(run.mode);
  rows.push({ label: '입장권', icon: 'i-timer', value: `${L.tickets[tk]} ${ticketsLeft(save.tower.tickets, tk, nowMs)}장` });
  const dock = el('div', 'bha-dock');
  dock.append(asBack(button({ label: L.name, icon: 'i-return', size: 'lg', variant: 'primary', onClick: h.onBack })));
  const app = splitApp(root, { cls: 'bha-resultpage', sticky: true }, null, [head, dock], [panel({}, iconInfo(rows))]);
  app.dataset.screen = 'special-result';
  if (won) playCosmeticFx('win', app);
}
