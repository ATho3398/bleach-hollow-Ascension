// 해방 수련 화면 (GDD 22-4·22-5): 둥지 방 수련장 → 수련 화면(수련치·수련권·4종목 카드) → 미니게임 한 판 → 결과.
// 규칙·시간은 engine/training 이 정하고, 화면은 상태를 그리기만 한다. 문구·종목 이름은 종족 설정 training 에서 읽는다 (종족 id 분기 없음).
// 조작은 한 손가락: 화면 버튼 / 칸 누르기, PC 는 방향키·스페이스(숫자 1~9 = 먹이사슬 칸).
import { fullnessDeltaText } from './bha/fullness';
import { fixParticles } from '../engine/josa';
import { BALANCE } from '../config/balance';
import type { FactionConfig } from '../engine/faction';
import {
  clashZone, createMiniGame, DODGE_PLAYER_X, DUEL_DIRS, gameRule, stepMiniGame, TRAINING_GAMES, trainingGate, trainingLevel, trainingRiskWarning,
  type DuelDir, type MiniGameInput, type MiniGameState, type TrainingGameId, type TrainingOutcome,
} from '../engine/training';
import type { SaveData } from '../game';
import { STAT_IDS, type StatId } from '../data/schema';
import { statName } from '../data/elements';
import { artUrls } from '../data/art/manifest';
import { button, el, icon, mountApp, panel, provisionalTag, tag } from './bha/dom';
import { enableDragScrollY } from './bha/dragScroll';
import type { Device } from './bha/device';
import { lcdHead, lcdPage } from './bha/lcdpage';
import { asBack } from './bha/screenBack';
import { evText } from './bha/nest';

/** 앞말 + 강조 조각 한 줄 (노력치 글자, GDD 160장 6) */
const labeled = (lead: string, strong: HTMLElement): HTMLElement => {
  const p = el('p');
  p.append(lead, strong);
  return p;
};

const TX = BALANCE.provisional.training;
const LB = BALANCE.provisional.liberation;

/** 제단(수련) 화면 진입 문구: 4단계(liberation.minTierIndex) 미만이면 "<4단계 이름>이(가) 되면 열린다" */
export function trainingLockedText(f: Pick<FactionConfig, 'tierNames' | 'training'>, what: string = f.training.title): string {
  const t4 = f.tierNames[LB.minTierIndex] ?? `${LB.minTierIndex + 1}단계`;
  return fixParticles(`${t4}${hasBatchim(t4) ? '이' : '가'} 되면 ${what}이(가) 열린다.`);
}

function hasBatchim(word: string): boolean {
  const c = word.charCodeAt(word.length - 1);
  return c >= 0xac00 && c <= 0xd7a3 && (c - 0xac00) % 28 !== 0;
}

/** "이름 +n / 이름 −n" (C.68: 컨디션만 하이픈 "-10" 으로 나와 배부름 "−15" 와 기호가 달랐다) */
export function signedText(name: string, delta: number): string {
  const d = Math.round(delta);
  return `${name} ${d < 0 ? '−' : '+'}${Math.abs(d)}`;
}

/** 한 판의 보상·비용 한 줄씩 (22-4 표) */
export function gameRuleLines(f: Pick<FactionConfig, 'riskGaugeName' | 'fullnessName'>, factionId: string, game: TrainingGameId): { reward: string; cost: string } {
  const r = gameRule(game);
  const evText = Object.entries(r.ev).filter(([k]) => (STAT_IDS as readonly string[]).includes(k)).map(([k, v]) => `${statName(k as StatId, factionId)} 노력치 +${v}`);
  const reward = [`수련치 +${r.points}`, ...evText, ...(r.winHunger ? [fullnessDeltaText(f.fullnessName, r.winHunger)] : [])].join(' · ');
  const cost = [r.condition ? signedText('컨디션', r.condition) : '', r.hunger ? fullnessDeltaText(f.fullnessName, r.hunger) : '', r.risk ? `${f.riskGaugeName} +${r.risk}` : ''].filter(Boolean).join(' · ') || '없음';
  return { reward, cost };
}

export interface TrainingHandlers {
  onPlay: (game: TrainingGameId) => void;
  // 옛 onSwitch(머리 제목 토글로 훈련 인형, C.137·C.163)는 수련장 목록 화면(GDD 8-9 v6.205, C.542)으로 대체 — 뒤로 = 목록
  // 옛 onAscend(이 화면 오른쪽 아란칼화·구상화 칸, C.220)는 수련장 카드 화면의 아란칼화 카드로 옮겼다 (GDD 8-9 v6.242, C.561)
}

// 옛 TICKET_HOW(수련권 칸 '얻는 법' 한 줄)·수련권 칸은 오른쪽 위 수련권 칩(GDD 14-4 v6.242, C.561)으로 합쳤다. 얻는 법은 수련권이 없을 때 잠금 글

/** 수련장 화면 id (옛 C.542 목록 두 항목). C.561 부터 카드 화면(trainingHallView HallCardId)이 쓴다 */
export type TrainingScreenId = 'train' | 'practice';

// 옛 trainingTitle(머리 제목 토글 '수련장 · 훈련 인형' ↔ 수련, C.163·C.394)은 수련장 목록 화면(trainingHallView, GDD 8-9 v6.205 C.542)으로 대체.
// C.561: 수련장 = 카드 3장(trainingHallView) → 본능 수련 카드 = 이 종목 목록 화면

const ART_BASE = (import.meta as { env?: { BASE_URL?: string } }).env?.BASE_URL ?? '/';

/** 종목 그림: 제 그림(training.game.<종목>)이 없으면 방 수련장 물건 그림 (GDD 8-9 v6.242 '종목 그림') */
export function trainingGameArt(game: TrainingGameId): string | null {
  return artUrls(`training.game.${game}`, ART_BASE).src ?? artUrls('prop.altar', ART_BASE).src;
}

/** 목록에서 고른 종목 (한 판 하고 돌아와도 그대로) */
const listPick: { game: TrainingGameId } = { game: TRAINING_GAMES[0]! };

/** 수련을 시작할 수 없는 까닭 한 줄 (열렸으면 null): 4단계 전 · 수련권 없음 · 컨디션 부족 */
export function trainingGateText(faction: FactionConfig, gate: ReturnType<typeof trainingGate>): string | null {
  if (gate.ok) return null;
  if (gate.reason === 'tier') return trainingLockedText(faction);
  if (gate.reason === 'tickets') return '수련권이 없다. 모험·탑에서 강적·보스를 쓰러뜨리면 가끔 얻는다.';
  return `컨디션이 ${TX.minCondition} 미만이라 수련할 수 없다. ${faction.nestActions.sleep}(으)로 회복한다.`;
}

/** 본능 수련 화면 (GDD 8-9 v6.242, C.561 — 사용자 "본능수련 누르면 그 때 좌측에 본능수련 리스트, 우측에 해당 수련 이미지랑 정보, 각 수련치 이런거 적으면 되잖니"):
 *  특수던전식(bha-sdg) — 왼쪽 = 종목 4개(이름 + 작은 글자 수련치 n/60), 오른쪽 = 종목 그림 + 설명 + 보상·비용 + 단계 + 수련치 + [시작].
 *  수련권은 오른쪽 위 칩(app.ts 공용). 옛 '왼쪽 수련치·수련권 칸 + 오른쪽 4종목 카드(누르면 상세 창) + 아란칼화 칸' 대체.
 *  기기: ▲▼ = 목록, ✓ = 고르기, 고른 행에 ✓ 한 번 더 = 하이라이트가 [시작]으로 (수련장 C.542 와 같은 규칙) */
export function trainingView(dev: Device, faction: FactionConfig, save: SaveData, title: string, hd: TrainingHandlers): void {
  const t = save.training;
  const n = save.nest;
  const gate = trainingGate(t, save.evolution.tierIndex, n.condition);
  const lockText = trainingGateText(faction, gate);
  const pts = Math.min(t.points, TX.pointsToComplete);
  const ptsText = `수련치 ${pts}/${TX.pointsToComplete}`;
  let sel = Math.max(0, TRAINING_GAMES.indexOf(listPick.game));

  // 왼쪽: 위아래로 끌어 넘기는 종목 목록 (특수던전 bha-sdg__list 그대로)
  const list = el('div', 'bha-sdg__list');
  list.setAttribute('role', 'listbox');
  list.setAttribute('aria-label', faction.training.title);
  list.dataset.trainList = '';
  enableDragScrollY(list);
  const stage = el('div', 'bha-sdg__stage');
  stage.dataset.trainStage = '';
  let go: HTMLButtonElement | null = null;

  const items = TRAINING_GAMES.map((g, i) => {
    const cfg = faction.training.games[g];
    const b = el('button', 'bha-sdg__item');
    b.type = 'button';
    b.setAttribute('role', 'option');
    b.dataset.game = g;
    const name = el('span', 'bha-sdg__itemname');
    name.append(el('b', '', cfg.name), el('small', 'bha-faint', ptsText));
    b.append(icon(gate.ok ? 'i-practice' : 'i-lock'), name);
    b.onclick = () => {
      if (i !== sel) return show(i);
      if (go && !go.disabled) go.dispatchEvent(new CustomEvent('bha-goto', { bubbles: true }));
    };
    list.append(b);
    return b;
  });

  // 오른쪽: 그림 칸(이름) + 설명 + 보상·비용 + 단계·수련치 + [시작]
  function show(i: number): void {
    sel = i;
    const g = TRAINING_GAMES[i]!;
    listPick.game = g;
    const cfg = faction.training.games[g];
    const lines = gameRuleLines(faction, faction.id, g);
    const level = trainingLevel(t, g);
    items.forEach((b, j) => {
      b.classList.toggle('is-selected', j === i);
      b.setAttribute('aria-selected', String(j === i));
    });
    const art = el('div', 'bha-sdg__art');
    const src = trainingGameArt(g);
    art.dataset.art = src ?? '';
    if (src) {
      const img = el('img', 'bha-thall__img') as HTMLImageElement;
      img.src = src;
      img.alt = '';
      art.append(img);
    } else {
      const mark = icon('i-practice');
      mark.classList.add('bha-thall__icon');
      art.append(mark);
    }
    const cap = el('div', 'bha-sdg__cap');
    cap.append(el('span', 'bha-label', faction.training.title), el('b', 'bha-sdg__title', cfg.name));
    art.append(cap);
    if (lockText) {
      const lock = el('div', 'bha-sdg__lock');
      lock.dataset.trainLock = '';
      lock.append(icon('i-lock'), el('span', '', lockText));
      art.append(lock);
    }
    const info = el('div', 'bha-sdg__info');
    const desc = el('p', '', cfg.desc);
    desc.dataset.trainDesc = '';
    const reward = el('p', 'bha-sdg__reward');
    reward.append(el('b', '', '승리 '), lines.reward);
    const cost = el('p', 'bha-sdg__left');
    cost.append(el('b', '', '비용 '), lines.cost, el('span', 'bha-faint', ` · 패배해도 수련치 +${TX.lossPoints}`));
    const stat = el('p', 'bha-sdg__left');
    stat.dataset.trainStat = '';
    stat.append(el('span', 'bha-chip', `${level}단계`), ` ${ptsText}`);
    if (t.completed) stat.append(' ', tag('수련 완료', 'kind'));
    const extra: HTMLElement[] = [];
    if (gate.ok && trainingRiskWarning(n.risk)) extra.push(el('p', 'bha-faint', `${faction.riskGaugeName}이(가) 한계 근처다 (${Math.round(n.risk)}). ${faction.riskGaugeName}이(가) 오르는 종목은 조심해야 한다.`));
    go = button({ label: '시작', icon: 'i-play', variant: 'primary', size: 'lg', disabled: !gate.ok, onClick: () => hd.onPlay(g) });
    go.dataset.go = g;
    const row = el('div', 'bha-sdg__go bha-thall__go');
    row.append(go);
    info.append(desc, reward, cost, stat, ...extra, row);
    stage.replaceChildren(art, info);
  }
  show(sel);

  const head = el('header', 'bha-exp__head bha-depart-head bha-sdg__head');
  head.append(el('h2', 'bha-plan__title', faction.training.title), provisionalTag());
  head.dataset.title = title;
  const { app } = lcdPage(dev.view, { cls: 'bha-tower bha-sdg bha-thall bha-train-list', cols: '1fr 2.2fr' }, head, [list], [stage]);
  app.dataset.screen = 'training-list';
}

// ── 한 판 ──

export interface PlayHandlers {
  /** 한 판이 끝나고 [결과] 를 누르면 (won) */
  onDone: (won: boolean) => void;
}

const DIR_LABEL: Record<DuelDir, string> = { up: '위', mid: '정면', down: '아래' };
const DIR_ICON: Record<DuelDir, string> = { up: 'i-chevron-right', mid: 'i-chevron-right', down: 'i-chevron-right' };

/** 미니게임 한 판 (실시간). 끝나면 결과 줄과 [계속] 버튼 */
export function trainingPlayView(root: HTMLElement, faction: FactionConfig, game: TrainingGameId, level: number, seed: number, hd: PlayHandlers): { state: MiniGameState } {
  const cfg = faction.training.games[game];
  const s = createMiniGame(game, level, seed);
  const queue: MiniGameInput[] = [];
  let started = false;
  // "준비…" 동안 누른 것은 버린다 (C.68: 쌓였다가 시작 순간 한꺼번에 들어가 첫 판이 실패로 셌다)
  const push = (inp: MiniGameInput) => {
    if (s.status === 'playing' && started) queue.push(inp);
  };

  const head = el('header', 'bha-train__playhead');
  const hudLeft = el('div', 'bha-train__hud');
  const hudRight = el('div', 'bha-train__hud bha-train__hud--right');
  head.append(el('h1', 'bha-train__title', `${cfg.name} · ${level}단계`), hudLeft, hudRight);
  const field = el('div', `bha-train__field bha-train__field--${game}`);
  const help = el('p', 'bha-train__help', cfg.desc);
  const controls = el('div', 'bha-train__controls');
  const app = mountApp(root, { fixed: true, cls: `bha-train-play bha-train-play--${game}` }, head, field, help, controls);

  // ── 종목별 장면 ──
  let draw: () => void;
  if (s.kind === 'duel') {
    const foe = el('div', 'bha-train__foe');
    foe.append(el('span', 'bha-train__foename', faction.training.foe));
    const arrows = DUEL_DIRS.map((d) => {
      const a = el('div', `bha-train__lane bha-train__lane--${d}`);
      a.append(el('span', 'bha-train__lanemark', DIR_LABEL[d]));
      return a;
    });
    const lanes = el('div', 'bha-train__lanes');
    lanes.append(...arrows);
    field.append(lanes, foe);
    const btns = DUEL_DIRS.map((d) => {
      const b = button({ label: DIR_LABEL[d], icon: DIR_ICON[d], size: 'lg', onClick: () => push({ kind: 'duel', dir: d }) });
      b.classList.add('bha-train__btn', `bha-train__btn--${d}`);
      return b;
    });
    controls.append(...btns);
    draw = () => {
      if (s.kind !== 'duel') return;
      arrows.forEach((a, i) => {
        const d = DUEL_DIRS[i]!;
        a.classList.toggle('is-tele', s.phase === 'tele' && s.dir === d);
        a.classList.toggle('is-strike', s.phase === 'window' && s.dir === d);
        a.classList.toggle('is-hit', !!s.last && s.t - s.last.at < 0.45 && s.last.dir === d && s.last.ok);
        a.classList.toggle('is-miss', !!s.last && s.t - s.last.at < 0.45 && s.last.dir === d && !s.last.ok);
      });
      hudLeft.replaceChildren(el('span', 'bha-chip bha-chip--guard', `받아치기 ${s.hits}/${TX.duel.hits}`));
      hudRight.replaceChildren(el('span', 'bha-chip bha-chip--danger', `놓침 ${s.misses}/${TX.duel.misses}`));
    };
  } else if (s.kind === 'dodge') {
    const lanes = el('div', 'bha-train__lanes bha-train__lanes--two');
    const laneEls = [0, 1].map(() => el('div', 'bha-train__lane'));
    lanes.append(...laneEls);
    const me = el('div', 'bha-train__me');
    me.style.left = `${DODGE_PLAYER_X * 100}%`;
    field.append(lanes, me);
    const shotEls = new Map<number, HTMLElement>();
    const up = button({ label: '위로', size: 'lg', onClick: () => push({ kind: 'dodge', move: 'up' }) });
    const down = button({ label: '아래로', size: 'lg', onClick: () => push({ kind: 'dodge', move: 'down' }) });
    up.classList.add('bha-train__btn');
    down.classList.add('bha-train__btn');
    controls.append(up, down);
    draw = () => {
      if (s.kind !== 'dodge') return;
      me.style.top = s.lane === 0 ? '25%' : '75%';
      me.classList.toggle('is-hurt', !!s.last && s.t - s.last.at < 0.4);
      const live = new Set<number>();
      for (const shot of s.shots) {
        live.add(shot.id);
        let node = shotEls.get(shot.id);
        if (!node) {
          node = el('div', 'bha-train__shot', faction.training.games.dodge.shot ?? '');
          shotEls.set(shot.id, node);
          field.append(node);
        }
        node.style.left = `${shot.x * 100}%`;
        node.style.top = shot.lane === 0 ? '25%' : '75%';
        node.classList.toggle('is-hit', shot.hit);
      }
      for (const [id, node] of shotEls) if (!live.has(id)) (node.remove(), shotEls.delete(id));
      hudLeft.replaceChildren(el('span', 'bha-chip', `남은 시간 ${Math.max(0, Math.ceil(TX.dodge.seconds - s.t))}초`));
      hudRight.replaceChildren(el('span', 'bha-chip bha-chip--danger', `맞음 ${s.hits}/${TX.dodge.hitsToLose}`));
    };
  } else if (s.kind === 'clash') {
    const bar = el('div', 'bha-train__bar');
    const z = clashZone(level);
    const zone = el('i', 'bha-train__zone');
    zone.style.left = `${z.lo * 100}%`;
    zone.style.width = `${(z.hi - z.lo) * 100}%`;
    const mark = el('i', 'bha-train__mark');
    bar.append(zone, mark);
    const rounds = el('div', 'bha-train__rounds');
    field.append(bar, rounds);
    const hit = button({ label: '맞대기!', size: 'lg', variant: 'primary', onClick: () => push({ kind: 'clash' }) });
    hit.classList.add('bha-train__btn', 'bha-train__btn--wide');
    controls.append(hit);
    draw = () => {
      if (s.kind !== 'clash') return;
      mark.style.left = `${s.pos * 100}%`;
      bar.classList.toggle('is-pause', s.t < s.pauseUntil);
      bar.classList.toggle('is-ok', !!s.last && s.t - s.last.at < 0.5 && s.last.ok);
      bar.classList.toggle('is-miss', !!s.last && s.t - s.last.at < 0.5 && !s.last.ok);
      rounds.replaceChildren(...Array.from({ length: TX.clash.rounds }, (_, i) => el('i', i < s.successes ? 'is-ok' : i < s.successes + s.fails ? 'is-miss' : '')));
      hudLeft.replaceChildren(el('span', 'bha-chip bha-chip--guard', `성공 ${s.successes}/${TX.clash.toWin}`));
      hudRight.replaceChildren(el('span', 'bha-chip', `${Math.min(TX.clash.rounds, s.round + 1)}번째 / ${TX.clash.rounds}`));
    };
  } else {
    const grid = el('div', 'bha-train__grid');
    const cells = Array.from({ length: TX.chain.cells }, (_, i) => {
      const c = el('button', 'bha-train__cell');
      c.type = 'button';
      c.setAttribute('aria-label', `${i + 1}번 칸`);
      c.onclick = () => push({ kind: 'chain', cell: i });
      return c;
    });
    grid.append(...cells);
    field.append(grid);
    const words = faction.training.games.chain;
    controls.append(el('span', 'bha-faint', `${words.prey} +${TX.chain.preyScore} · ${words.predator} ${TX.chain.predatorScore}`));
    draw = () => {
      if (s.kind !== 'chain') return;
      cells.forEach((c, i) => {
        const x = s.cells[i];
        const kind = x?.kind ?? '';
        if (c.dataset.kind !== kind) {
          c.dataset.kind = kind;
          c.textContent = x ? (x.kind === 'prey' ? words.prey ?? '' : words.predator ?? '') : '';
        }
        c.classList.toggle('is-flash', !!s.last && s.last.cell === i && s.t - s.last.at < 0.35);
      });
      hudLeft.replaceChildren(el('span', 'bha-chip bha-chip--guard', `점수 ${s.score}/${TX.chain.target}`));
      hudRight.replaceChildren(el('span', 'bha-chip', `남은 시간 ${Math.max(0, Math.ceil(TX.chain.seconds - s.t))}초`));
    };
  }

  // ── PC 키: 방향키·스페이스·숫자 (기기 이동 키보다 먼저 받는다) ──
  const onKey = (e: KeyboardEvent) => {
    if (!app.isConnected) return void window.removeEventListener('keydown', onKey, true);
    if (s.status !== 'playing' || e.repeat) return;
    let inp: MiniGameInput | null = null;
    if (s.kind === 'duel') inp = e.key === 'ArrowUp' ? { kind: 'duel', dir: 'up' } : e.key === 'ArrowDown' ? { kind: 'duel', dir: 'down' } : e.key === 'ArrowRight' || e.key === ' ' ? { kind: 'duel', dir: 'mid' } : null;
    else if (s.kind === 'dodge') inp = e.key === 'ArrowUp' ? { kind: 'dodge', move: 'up' } : e.key === 'ArrowDown' ? { kind: 'dodge', move: 'down' } : e.key === ' ' ? { kind: 'dodge', move: 'toggle' } : null;
    else if (s.kind === 'clash') inp = e.key === ' ' || e.key === 'Enter' ? { kind: 'clash' } : null;
    else if (/^Digit[1-9]$/.test(e.code)) inp = { kind: 'chain', cell: Number(e.code.slice(5)) - 1 };
    if (!inp) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    push(inp);
  };
  window.addEventListener('keydown', onKey, true);

  // ── 실시간 루프 ──
  let last = performance.now();
  const countdown = el('div', 'bha-train__countdown', '준비…');
  field.append(countdown);
  window.setTimeout(() => {
    started = true;
    countdown.remove();
    last = performance.now();
  }, 1000);
  const finish = () => {
    window.removeEventListener('keydown', onKey, true);
    const won = s.status === 'won';
    const ov = el('div', `bha-train__end ${won ? 'is-win' : 'is-lose'}`);
    const go = asBack(button({ label: '결과 보기', variant: 'primary', size: 'lg', onClick: () => hd.onDone(won) }));
    ov.append(el('h2', 'bha-train__endtitle', won ? '승리' : '패배'), go);
    // 끝나면 조작 버튼을 끈다 (C.68: 그대로 살아 있어 기기 확인 키 선택이 [결과 보기] 로 안 옮겨 갔다)
    for (const b of app.querySelectorAll('button')) b.disabled = true;
    field.append(ov);
    go.focus();
  };
  const frame = (now: number) => {
    if (!app.isConnected) return void window.removeEventListener('keydown', onKey, true);
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    if (started && s.status === 'playing') {
      // 입력은 한 프레임에 하나씩(같은 프레임 두 번 누름도 순서대로)
      const inp = queue.shift() ?? null;
      stepMiniGame(s, dt, inp);
    }
    draw();
    if (s.status !== 'playing') return finish();
    requestAnimationFrame(frame);
  };
  draw();
  requestAnimationFrame(frame);
  return { state: s };
}

/** 한 판 결과: 승패·얻은 수련치·노력치·비용, 수련 완료면 완료 연출 */
export function trainingResultView(dev: Device, faction: FactionConfig, save: SaveData, out: TrainingOutcome, hd: { onBack: () => void; onAgain: (() => void) | null }): void {
  const cfg = faction.training.games[out.game];
  const t = save.training;
  const rows = el('div', 'bha-stack');
  const evStr = Object.entries(out.ev).filter(([, v]) => (v ?? 0) > 0).map(([k, v]) => `${statName(k as StatId, faction.id)} +${v}`).join(' · ');
  rows.append(
    el('p', '', `수련치 +${out.points} (지금 ${Math.min(t.points, TX.pointsToComplete)} / ${TX.pointsToComplete})`),
    ...(evStr ? [labeled('노력치 ', evText(evStr))] : out.won ? [el('p', 'bha-faint', '노력치는 이미 이 단계 상한이다')] : []),
    // 줄어든 수치·리스크 비용만 글로 (GDD 201장 2·5). 회복(먹이사슬 배부름 등)은 아래 상태창 차오름으로 보여 준다
    ...(() => {
      const down = [out.condition < 0 ? signedText('컨디션', out.condition) : '', out.hunger > 0 ? fullnessDeltaText(faction.fullnessName, out.hunger) : '', out.risk ? `${faction.riskGaugeName} +${Math.round(out.risk)}` : ''].filter(Boolean).join(' · ');
      const rose = out.condition > 0 || out.hunger < 0;
      return down ? [el('p', 'bha-faint', down)] : rose ? [] : [el('p', 'bha-faint', `${faction.nestName} 수치 변화 없음`)];
    })(),
    // 옛 '남은 수련권 n' 줄은 오른쪽 위 수련권 칩으로 (GDD 14-4 v6.242, C.561)
  );
  const left = [panel({ title: `${cfg.name} · ${out.level}단계 ${out.won ? '승리' : '패배'}`, aside: out.won ? tag('승리', 'kind') : undefined }, rows)];
  const right: HTMLElement[] = [];
  if (out.completedNow) {
    const done = panel({ title: '수련 완료', mod: 'accent' });
    done.dataset.training = 'complete';
    done.append(el('p', 'bha-train__complete', faction.training.completeText), el('p', 'bha-faint', `칭호 해금 · 튜토리얼 목표 달성. ${faction.liberation.name} 능력치 ×${LB.uniqueStatMultiplier} → ×${LB.trainedStatMultiplier}.`));
    right.push(done);
  }
  const actions = el('div', 'bha-grid2');
  if (hd.onAgain) actions.append(button({ label: '한 판 더', icon: 'i-play', onClick: hd.onAgain }));
  actions.append(asBack(button({ label: '수련 화면으로', variant: 'primary', icon: 'i-return', onClick: hd.onBack })));
  right.push(actions);
  lcdPage(dev.view, { cls: 'bha-train-page bha-train-result' }, lcdHead({ title: faction.training.title }), left, right);
  // 옛 상태창 차오름(statusFillFx — 이름·배부름·컨디션·리스크·체력 막대 카드, GDD 201장 3·4 · 208장 3)은 화면 위에 떠서 버튼·목록을 가려 없앴다
  // (GDD 8-9 v6.242, C.561 — 사용자 "상태 창이 버튼이랑 ui 가리는게 맞아? 저거 없애고"). 바뀐 값은 왼쪽 결과 글(비용 줄)에 그대로 있다
}
