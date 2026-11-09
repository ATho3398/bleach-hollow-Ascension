// 카드 배치 단계 (GDD 17-1): 원정을 시작하기 직전, 덱의 지형 타일을 12칸 길에 놓는다. 길 순서가 보이는 두 곳 중 하나(다른 하나는 바퀴 끝 팝업).
// 엔진 상태는 이 화면이 닫힐 때까지 저장하지 않는다 — 취소하면 이어하던 원정은 그대로 남는다.
import { beginPlanning, chooseDifficulty, chooseGround, finishPlanning, type ExpeditionState } from '../engine/expedition';
import { difficultyLabels, difficultyText, groundName, type FactionConfig } from '../engine/faction';
import { clampStreak, difficultyGoldMultiplier, difficultyRewardMultiplier, MAX_DIFFICULTY, recommendedDifficulty, streakEnemyFactor } from '../engine/difficulty';
import { GROUNDS, type GroundDef } from '../data/grounds';
import { elementName } from '../data/elements';
import { getTile, synergyName, tileName } from '../data/tiles';
import { tileCss } from './bha/expedition';
import { button, el, icon, mountApp } from './bha/dom';
import { applyTilePreset, cellsOfPlan, type PresetResult, type TilePreset } from '../tilePresets';
import { roadPlanner } from './bha/road';
import { presetPanel } from './bha/tilePresets';
import { departTabs, type DepartTab, type DepartTower } from './storyView';
import { infoTip, type InfoGroup } from './bha/infoTip';
import { confirmDialog } from './confirmDialog';
import { multPct, numLine } from '../data/help/textFormat';
import { BALANCE } from '../config/balance';

export interface PlanViewHandlers {
  /** [출발]: 배치가 끝났다 (손은 이미 비웠다). 원정 시작 */
  onStart: (placed: number) => void;
  onHelp: () => void;
  /** [스토리] 탭 (GDD 25-7): 있으면 머리에 [자유 원정]/[스토리] 탭을 보인다. 탑은 월드맵 장소 (139장 1) */
  onTab?: (id: Exclude<DepartTab, 'free'>) => void;
  /** 머리 탭의 탑 칸 (GDD 222장 9) */
  tower?: DepartTower;
  /** 연 원정 난이도 ★ 최대 (GDD 32-1, 세이브 difficulty.unlocked). 없으면 1 */
  unlockedDifficulty?: number;
  /** 연속 클리어 (GDD 32-1 10번, 세이브 difficulty.streak): 그 ★를 고르면 "★3 · 연속 4" 와 적·보상 가산을 보인다 */
  streak?: { star: number; count: number };
  /** 첫 진화 전 타일 잠김 (GDD 64장 1번): 배치 대신 "첫 진화 후 열림" 안내, 길은 빈 길 */
  tilesLocked?: boolean;
  /** 길에 놓을 수 있는 최대 칸 수 (GDD 85장 11번 8칸 + 상점 배치 칸). 없으면 제한 없음 */
  placeLimit?: number;
  /** 출발 체력 (GDD 193장 2, 0~1 — departHpOf): [출발] 띠 왼쪽 '체력 n%', 문턱 아래면 [출발] 때 확인 창. 없으면 숨김 */
  hpFraction?: number;
  /** 처음 열 탭 (없으면 [준비]). 타일 안내(tile-plan, GDD 213장)가 뜰 때는 [타일 배치] — 안내가 가리키는 가진 타일·길·프리셋 판이 그 탭에만 보인다 */
  startMode?: 'prep' | 'place';
  /** true 면 체력 확인 창을 띄우지 않는다 (빈사 — 홈에서 빈사 확인 창을 이미 거쳤다) */
  hpNoWarn?: boolean;
  /** 배치 프리셋 (GDD 85장 11번): 이 종족 프리셋 목록·저장. 없으면 프리셋 줄을 숨긴다 */
  presets?: {
    list: () => { index: number; preset: TilePreset }[];
    /** index 를 주면 덮어쓴다 */
    save: (cells: (string | null)[], name: string, index?: number) => PresetResult;
    rename: (index: number, name: string) => boolean;
    remove: (index: number) => boolean;
  };
}

/** 난이도 한 줄 설명 (GDD 193장 11): 숫자 대신 말 — "★3 · 연속 4번째 · 권장 — 적이 3단계(아쥬커스)보다 조금 세고 보상이 늘어난다".
 *  가산 % 는 설명 칸 ⓘ(difficultyDetail)로 (ui-review 관점 1, GDD 32-1 5·10·11번 값은 데이터에서) */
export function difficultyInfo(faction: FactionConfig, star: number, tierIndex: number, streak = 0): string {
  const L = difficultyLabels(faction);
  const n = clampStreak(streak);
  const more = difficultyRewardMultiplier(star, n) > 1 || difficultyGoldMultiplier(star, n) > 1;
  const enemy = streakEnemyFactor(n);
  const rec = star === recommendedDifficulty(tierIndex) ? ` · ${L.recommended}` : '';
  const head = `${difficultyText(faction, star)}${n > 0 ? ` · 연속 ${n}번째` : ''}${rec}`;
  const foe = `적이 ${star}단계(${faction.tierNames[star - 1] ?? ''})${enemy > 1 ? '보다 조금 세' : '만큼 세'}`;
  return `${head} — ${foe}${more ? '고 보상이 늘어난다' : '다'}`;
}

/** 난이도 ⓘ (GDD 193장 11): 한 줄 설명이 말로 줄인 가산 수치 (text-style 3절 수치 줄) */
export function difficultyDetail(faction: FactionConfig, star: number, streak = 0): InfoGroup {
  const n = clampStreak(streak);
  const food = difficultyRewardMultiplier(star, n);
  const gold = difficultyGoldMultiplier(star, n);
  const enemy = streakEnemyFactor(n);
  const lines = [numLine('적 기준', `${star}단계(${faction.tierNames[star - 1] ?? ''})`, enemy > 1 ? multPct(enemy) : '')];
  lines.push(numLine(`${faction.foodGroupName}·노력치`, food > 1 ? multPct(food) : '그대로'));
  lines.push(numLine('골드', gold > 1 ? multPct(gold) : '그대로'));
  if (n > 0) lines.push(numLine('연속', `${n}번째`));
  lines.push('같은 ★을 연속으로 깨면 적과 보상이 조금씩 는다');
  return { title: difficultyText(faction, star), lines };
}

/** 사냥터 적 강도를 말로 (GDD 193장 11): 체력·공격 배율 평균 */
function groundStrengthWords(g: GroundDef): string {
  const avg = (g.strength.hp + g.strength.attack) / 2;
  if (avg >= 1.2) return '적이 꽤 세다';
  if (avg > 1.02) return '적이 조금 세다';
  if (avg < 0.98) return '적이 조금 약하다';
  return '';
}

/** 사냥터 한 줄 설명: 종족 설정 설명 + 자주 나오는 속성 + 적 강도(말로, 숫자는 ⓘ) (데이터에서 조합, GDD 24-2 · 193장 11) */
export function groundInfo(faction: FactionConfig, g: GroundDef): string {
  const els = g.elements.map((id) => elementName(id, faction.id)).join('·');
  const desc = faction.huntingGrounds?.[g.id]?.desc;
  const st = groundStrengthWords(g);
  return `${desc ? `${desc} ` : ''}자주 나오는 속성 ${els}${st ? ` · ${st}` : ''}`;
}

/** 사냥터 ⓘ (GDD 193장 11): 적 체력·공격 % */
export function groundDetail(faction: FactionConfig, g: GroundDef): InfoGroup {
  const hp = Math.round(g.strength.hp * 100);
  const atk = Math.round(g.strength.attack * 100);
  return { title: groundName(faction, g.id, GROUNDS.indexOf(g)), lines: [numLine('적', `체력 ${hp}%`, `공격 ${atk}%`)] };
}

/** 출발 체력 경고 문턱 (GDD 193장 2): 이 비율 아래로 [출발]을 누르면 확인 창 */
export function lowDepartHp(hpFraction: number | undefined): boolean {
  return hpFraction !== undefined && hpFraction < BALANCE.provisional.nest.care.departWarnHp;
}

export function planView(root: HTMLElement, faction: FactionConfig, exp: ExpeditionState, tierIndex: number, h: PlanViewHandlers): void {
  beginPlanning(exp, h.placeLimit);
  // 첫 진화 전 타일 잠김(GDD 64장 1번)이면 바둑판을 아예 만들지 않는다 (C.170, GDD 100장 #23: 한 줄 안내 + 바로 [출발])
  const planner = h.tilesLocked ? null : roadPlanner({ exp, tileName: (id) => tileName(id, faction.id), synergyName: (id) => synergyName(id, faction.id), onPlaced: () => paintCount() });

  const title = el('h2', 'bha-plan__title');
  title.append(icon('i-deck'), '길에 타일 놓기');

  // 리디자인 v2 (GDD 183장, S06·S07): 머리 44 = [자유 모험|스토리] · 빈 칸 · [준비|타일 배치] · 도움말 / 왼쪽 = 사냥터 줄 · 난이도 줄 · 설명(고정 높이, 안에서 스크롤 + '▼ 더 있음') · 길 미리보기 /
  // 오른쪽 = 배치 프리셋 판 / 아래 = [출발] 띠(.bha-dock). 타일 배치 탭 = 길(전체 폭 한 줄) + 가진 타일(4열, [출발] 위만 스크롤 + 더 있음)
  // 사냥터 고르기 (GDD 24-2): 열린 곳만 고를 수 있고, 잠긴 곳은 열리는 단계를 보인다
  const grounds = el('div', 'bha-plan__grounds bha-plan__row');
  grounds.setAttribute('role', 'group');
  grounds.setAttribute('aria-label', '사냥터');
  const gInfo = el('p', 'bha-plan__sub');
  const gBtns = GROUNDS.map((g, i) => {
    const open = tierIndex >= g.unlockTierIndex;
    const b = button({ label: groundName(faction, g.id, i), icon: open ? undefined : 'i-lock', size: 'small', disabled: !open, onClick: () => pick(g) });
    if (!open) b.title = `${g.unlockTierIndex + 1}단계(${faction.tierNames[g.unlockTierIndex] ?? ''})에 열린다`;
    b.dataset.ground = g.id;
    return b;
  });
  let curGround: GroundDef = GROUNDS[0]!;
  let curStar = 1;
  const pick = (g: GroundDef) => {
    curGround = g;
    chooseGround(exp, g.id);
    gBtns.forEach((b, i) => {
      const on = GROUNDS[i]!.id === g.id;
      b.classList.toggle('is-on', on);
      b.setAttribute('aria-pressed', String(on));
    });
    gInfo.textContent = `${groundName(faction, g.id, GROUNDS.indexOf(g))}: ${groundInfo(faction, g)}`;
    syncDescMore();
  };
  grounds.append(el('span', 'bha-plan__label', '사냥터'), ...gBtns);

  // 난이도 ★ 고르기 (GDD 32-1 4번): 열린 ★ 만 고를 수 있고(n단계에 처음 닿으면 ★n), 기본 = 내 단계(권장 표시), 잠긴 ★ 는 열리는 단계를 보인다
  const L = difficultyLabels(faction);
  const unlocked = Math.max(1, Math.min(MAX_DIFFICULTY, h.unlockedDifficulty ?? 1));
  const rec = recommendedDifficulty(tierIndex);
  const diff = el('div', 'bha-plan__grounds bha-plan__difficulty bha-plan__row');
  diff.setAttribute('role', 'group');
  diff.setAttribute('aria-label', L.name);
  const dInfo = el('p', 'bha-plan__sub');
  dInfo.dataset.difficultyInfo = '';
  const dBtns = Array.from({ length: MAX_DIFFICULTY }, (_, i) => {
    const star = i + 1;
    const open = star <= unlocked;
    const b = button({ label: difficultyText(faction, star), icon: open ? undefined : 'i-lock', size: 'small', disabled: !open, onClick: () => pickStar(star) });
    if (!open) b.title = L.locked.replace('{tier}', String(star));
    if (star === rec) b.append(' ', el('span', 'bha-badge bha-plan__rec', L.recommended));
    b.dataset.difficulty = String(star);
    return b;
  });
  const pickStar = (star: number) => {
    chooseDifficulty(exp, star, unlocked);
    curStar = exp.difficulty;
    dBtns.forEach((b, i) => {
      const on = i + 1 === star;
      b.classList.toggle('is-on', on);
      b.setAttribute('aria-pressed', String(on));
    });
    dInfo.textContent = difficultyInfo(faction, star, tierIndex, h.streak?.star === star ? h.streak.count : 0);
    syncDescMore();
  };
  diff.append(el('span', 'bha-plan__label', L.name), ...dBtns);

  // 설명 칸 (PROMPT 5절 2): 고정 높이 움푹한 면, 넘치면 안에서 스크롤 + 바닥 '▼ 더 있음'(끝까지 내리면 숨김) — 고를 때마다 글 길이가 달라도 아래 길·[출발]이 안 움직인다 (GDD 173장 2)
  const desc = el('div', 'bha-well bha-plan__desc');
  const descScroll = el('div', 'bha-plan__descscroll');
  descScroll.dataset.scList = '';
  const descMore = el('div', 'bha-more bha-plan__more');
  descMore.setAttribute('aria-hidden', 'true');
  descMore.append(icon('i-chevron-down'), '더 있음');
  function syncDescMore(): void {
    descMore.hidden = descScroll.scrollTop + descScroll.clientHeight >= descScroll.scrollHeight - 2;
  }
  descScroll.addEventListener('scroll', syncDescMore, { passive: true });
  if (typeof ResizeObserver !== 'undefined') new ResizeObserver(syncDescMore).observe(descScroll);
  descScroll.append(gInfo, dInfo);
  // 숫자(적 체력·공격 %, 난이도 가산 %)는 설명 칸 오른쪽 위 ⓘ 하나로 (GDD 193장 11) — 고른 사냥터·★ 를 열 때마다 읽는다
  const descInfo = infoTip('사냥터·난이도', () => ({
    lead: '고른 사냥터와 난이도의 수치다',
    groups: [groundDetail(faction, curGround), difficultyDetail(faction, curStar, h.streak?.star === curStar ? h.streak.count : 0)],
  }));
  descInfo.classList.add('bha-plan__descinfo');
  desc.append(descScroll, descMore, descInfo);

  pick(GROUNDS.find((g) => g.id === exp.groundId) ?? GROUNDS[0]!);
  pickStar(Math.min(unlocked, exp.difficulty));
  const help = button({ label: '도움말', icon: 'i-help', iconOnly: true, variant: 'ghost', size: 'small', onClick: h.onHelp });
  const head = el('div', `bha-head bha-exp__head${h.onTab ? ' bha-depart-head' : ''}`);
  // [자유 원정]/[스토리] 탭이 있으면 제목 자리를 대신한다 (머리 한 줄 높이를 지킨다)
  const onTab = h.onTab;
  const grow = el('span', 'bha-grow');
  head.append(onTab ? departTabs('free', (id) => { if (id !== 'free') onTab(id); }, h.tower) : title, grow, help);

  // 체력이 문턱 아래면 [출발] 전에 확인 창 (GDD 193장 2) — 기본 선택 = 그만
  const depart = () => h.onStart(finishPlanning(exp));
  const start = button({
    label: '출발', icon: 'i-play', variant: 'primary', size: 'lg', block: true,
    onClick: () => {
      if (h.hpNoWarn || !lowDepartHp(h.hpFraction)) return depart();
      confirmDialog({
        title: '체력이 낮다',
        body: `체력이 ${Math.round((h.hpFraction ?? 1) * 100)}%다. 지면 이번에 얻은 것을 잃는다. 그래도 나간다.`,
        yes: '출발', no: '그만', danger: true, onYes: depart,
      });
    },
  });
  start.dataset.sc = 'go';
  // [출발] = 화면 아래 고정 띠 (GDD 100장 #3·#22, v2 .bha-dock 56): 스크롤하지 않아도 늘 보인다. 왼쪽 = 출발 체력 n% (GDD 193장 2)
  const go = el('div', 'bha-dock bha-plan__go');
  if (h.hpFraction !== undefined) {
    const hpPct = Math.round(h.hpFraction * 100);
    const hpEl = el('span', `bha-plan__hp${h.hpNoWarn || lowDepartHp(h.hpFraction) ? ' is-low' : ''}`);
    hpEl.append(icon('i-heal'), '체력 ', el('b', 'bha-num', `${hpPct}%`));
    hpEl.dataset.departHp = String(hpPct);
    go.append(hpEl);
  }
  go.append(start);
  // 한 줄 안내 (GDD 100장 #25): 배치 요령 긴 문단은 ? 도움말(툴팁)로, 화면엔 "타일 고르기 → 빈 칸 누르기 · 놓은 타일 n/최대"
  // 준비 탭은 길 미리보기 오른쪽에 'n/최대' 만, 타일 배치 탭은 한 줄 전부
  const sub = el('p', 'bha-plan__sub bha-plan__line');
  const countEl = el('b', 'bha-num');
  // 준비 탭 길 요약 (GDD 189장, 사용자 11-05 "엄청 작은 네모 12개 2줄로, 색깔로만"): 출발 포함 12칸을 6개씩 2줄 작은 네모로,
  // 타일 종류 색만(글자·아이콘·+ 없음, 누를 수 없음 — 놓기는 [타일 배치] 탭) + 옆에 '놓은 타일 n/최대'
  const miniRow = el('div', 'bha-plan__minirow');
  const mini = el('div', 'bha-plan__mini');
  mini.setAttribute('role', 'img');
  const miniCells = exp.slots.map(() => el('i', 'bha-plan__minicell'));
  mini.append(...miniCells);
  const miniCount = el('b', 'bha-num');
  const miniText = el('span', 'bha-plan__minitext');
  miniText.append('놓은 타일 ', miniCount);
  miniRow.append(mini, miniText);
  const paintCount = () => {
    const placed = exp.slots.slice(1).filter((x) => x !== null).length;
    const cap = `${placed}/${h.placeLimit ?? '∞'}`;
    countEl.textContent = cap;
    miniCount.textContent = cap;
    exp.slots.forEach((id, i) => {
      miniCells[i]!.className = `bha-plan__minicell${i === 0 ? ' is-nest' : id ? ` is-${tileCss(getTile(id).kind)}` : ''}`;
    });
    mini.setAttribute('aria-label', `길 ${exp.slots.length}칸 · 놓은 타일 ${cap}`);
  };
  if (h.tilesLocked) {
    sub.append(icon('i-lock'), ' 타일 배치는 첫 진화 후에 열린다. 지금은 기본 길을 걷는다(빈 칸마다 떠돌이 적).');
    sub.dataset.tilesLocked = '';
  } else {
    // 두 탭 같은 말 '놓은 타일 n/최대' (GDD 193장 19) — 최대를 다 놓으면 남은 빈 칸은 흐려진다(road.ts is-full)
    sub.append(el('span', 'bha-plan__how', '타일 고르기 → 빈 칸 누르기 · 놓은 타일 '), countEl);
    sub.title = `가진 타일을 길 위 칸에 놓는다(최대 ${h.placeLimit ?? '∞'}칸, 놓은 타일이 보상으로 뽑힌다). 다 놓으면 남은 빈 칸은 흐려진다. 상점 배치 칸으로 최대가 는다. 안 놓은 칸에는 떠돌이 적이 나온다. 붙여 놓으면 시너지가 생긴다. 놓은 타일을 누른 뒤 빈 칸 = 이동, 다른 타일 = 교체, 같은 칸 = 손으로.`;
    paintCount();
  }
  // 배치 프리셋 (GDD 85장 11번, C.141): 이름 붙여 저장·불러오기·덮어쓰기·이름 바꾸기·삭제 (카드형)
  const presetEl = h.presets && !h.tilesLocked
    ? presetPanel({
      list: h.presets.list,
      save: (name, index) => h.presets!.save(cellsOfPlan(exp), name, index),
      rename: h.presets.rename,
      remove: h.presets.remove,
      load: (preset) => {
        const r = applyTilePreset(exp, preset);
        planner?.adopt();
        paintCount();
        return `불러옴 ${r.placed}칸${r.missing.length > 0 ? ` · 없음 ${r.missing.length}` : ''}`; // 짧게 (GDD 189장 12번)
      },
    }, (id) => tileName(id, faction.id), `최대 ${h.placeLimit ?? '∞'}칸`)
    : null;
  // 화면 탭 [준비] / [타일 배치] (GDD 179장, 사용자 2026-11-04 "b로 가자" — 옛 오른쪽 손패/프리셋 토글을 대신함):
  // 준비 = 사냥터·난이도·설명·길 요약·[출발]을 전체 폭으로, 타일 배치 = 길 · 가진 타일 · 배치 프리셋 판(오른쪽, GDD 193장 12 — 옛 준비 탭 오른쪽 1/3 에서 옮김). [출발]은 그대로. 탭은 머리 줄 오른쪽(도움말 왼쪽, v2 .bha-tabs)
  let setMode: ((k: 'prep' | 'place') => void) | null = null;
  if (planner && presetEl) {
    const hand = planner.el.querySelector<HTMLElement>('.bha-road__hand')!;
    presetEl.classList.add('bha-plan__side', 'bha-panel');
    const toggle = el('div', 'bha-tabs bha-plan__sidetabs bha-plan__modetabs');
    toggle.setAttribute('role', 'tablist');
    toggle.setAttribute('aria-label', '모험 준비 화면');
    const tabs = (['prep', 'place'] as const).map((k) => {
      const b = el('button', 'bha-tab');
      b.type = 'button';
      b.append(icon(k === 'prep' ? 'i-check' : 'i-deck'), k === 'prep' ? '준비' : '타일 배치');
      b.onclick = () => setMode?.(k);
      b.dataset.planSide = k;
      b.setAttribute('role', 'tab');
      return b;
    });
    setMode = (k) => {
      paintCount();
      hand.hidden = k !== 'place';
      presetEl.hidden = k !== 'place';
      toggle.closest('.bha-app')?.classList.toggle('is-place', k === 'place');
      tabs.forEach((b) => {
        const on = b.dataset.planSide === k;
        b.classList.toggle('is-on', on);
        b.setAttribute('aria-selected', String(on));
      });
    };
    toggle.append(...tabs);
    head.insertBefore(toggle, help);
    // 프리셋 칸은 배치판(planner.el) 안에 둔다: 끌어 놓기·선택 풀기가 배치판 범위를 본다
    planner.el.append(presetEl);
  }
  const main = mountApp(root, { fixed: true, cls: `bha-plan bha-v2${h.tilesLocked ? ' is-locked' : ''}` }, head, grounds, diff, desc, ...(planner ? [miniRow] : []), sub, ...(planner ? [planner.el] : []), ...(presetEl && !planner ? [presetEl] : []), go);
  main.dataset.screen = 'expedition-plan';
  setMode?.(h.startMode ?? 'prep');
  requestAnimationFrame(syncDescMore);
}
