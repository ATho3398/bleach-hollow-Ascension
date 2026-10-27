// 카드 배치 단계 (GDD 17-1): 원정을 시작하기 직전, 덱의 지형 타일을 12칸 길에 놓는다. 길 순서가 보이는 두 곳 중 하나(다른 하나는 바퀴 끝 팝업).
// 엔진 상태는 이 화면이 닫힐 때까지 저장하지 않는다 — 취소하면 이어하던 원정은 그대로 남는다.
import { beginPlanning, chooseDifficulty, chooseGround, finishPlanning, type ExpeditionState } from '../engine/expedition';
import { difficultyLabels, difficultyText, groundName, type FactionConfig } from '../engine/faction';
import { clampStreak, difficultyGoldMultiplier, difficultyRewardMultiplier, MAX_DIFFICULTY, recommendedDifficulty, streakEnemyFactor } from '../engine/difficulty';
import { GROUNDS, type GroundDef } from '../data/grounds';
import { elementName } from '../data/elements';
import { synergyName, tileName } from '../data/tiles';
import { button, el, icon, mountApp } from './bha/dom';
import { applyTilePreset, cellsOfPlan, type PresetResult, type TilePreset } from '../tilePresets';
import { roadPlanner } from './bha/road';
import { presetPanel } from './bha/tilePresets';
import { departTabs, type DepartTab } from './storyView';

export interface PlanViewHandlers {
  /** [출발]: 배치가 끝났다 (손은 이미 비웠다). 원정 시작 */
  onStart: (placed: number) => void;
  onHelp: () => void;
  /** [스토리]·[탑] 탭 (GDD 25-7·36장): 있으면 머리에 [자유 원정]/[스토리]/[탑] 탭을 보인다 */
  onTab?: (id: Exclude<DepartTab, 'free'>) => void;
  /** 연 원정 난이도 ★ 최대 (GDD 32-1, 세이브 difficulty.unlocked). 없으면 1 */
  unlockedDifficulty?: number;
  /** 연속 클리어 (GDD 32-1 10번, 세이브 difficulty.streak): 그 ★를 고르면 "★3 · 연속 4" 와 적·보상 가산을 보인다 */
  streak?: { star: number; count: number };
  /** 첫 진화 전 타일 잠김 (GDD 64장 1번): 배치 대신 "첫 진화 후 열림" 안내, 길은 빈 길 */
  tilesLocked?: boolean;
  /** 길에 놓을 수 있는 최대 칸 수 (GDD 85장 11번 8칸 + 상점 배치 칸). 없으면 제한 없음 */
  placeLimit?: number;
  /** 배치 프리셋 (GDD 85장 11번): 이 종족 프리셋 목록·저장. 없으면 프리셋 줄을 숨긴다 */
  presets?: {
    list: () => { index: number; preset: TilePreset }[];
    /** index 를 주면 덮어쓴다 */
    save: (cells: (string | null)[], name: string, index?: number) => PresetResult;
    rename: (index: number, name: string) => boolean;
    remove: (index: number) => boolean;
  };
}

/** 난이도 한 줄 설명: "★3 · 연속 4 · 권장: 적은 3단계(아쥬커스) 기준 +20% · 먹이·노력치 +70% · 골드 +38%" (데이터에서 조합, GDD 32-1 5·10·11번) */
export function difficultyInfo(faction: FactionConfig, star: number, tierIndex: number, streak = 0): string {
  const L = difficultyLabels(faction);
  const n = clampStreak(streak);
  const pct = (m: number) => `${m >= 1 ? '+' : ''}${Math.round((m - 1) * 100)}%`;
  const food = difficultyRewardMultiplier(star, n);
  const gold = difficultyGoldMultiplier(star, n);
  const enemy = streakEnemyFactor(n);
  const rec = star === recommendedDifficulty(tierIndex) ? ` · ${L.recommended}` : '';
  const head = `${difficultyText(faction, star)}${n > 0 ? ` · 연속 ${n}` : ''}${rec}`;
  const bonus = [food > 1 ? `먹이·노력치 ${pct(food)}` : '', gold > 1 ? `골드 ${pct(gold)}` : ''].filter(Boolean).join(' · ');
  return `${head}: 적은 ${star}단계(${faction.tierNames[star - 1] ?? ''}) 기준${enemy > 1 ? ` ${pct(enemy)}` : ''}${bonus ? ` · ${bonus}` : ''}`;
}

/** 사냥터 한 줄 설명: 종족 설정 설명 + 자주 나오는 속성 + 적 강도 (데이터에서 조합, GDD 24-2) */
export function groundInfo(faction: FactionConfig, g: GroundDef): string {
  const els = g.elements.map((id) => elementName(id, faction.id)).join('·');
  const hp = Math.round(g.strength.hp * 100);
  const atk = Math.round(g.strength.attack * 100);
  const desc = faction.huntingGrounds?.[g.id]?.desc;
  return `${desc ? `${desc} ` : ''}자주 나오는 속성 ${els}${hp !== 100 || atk !== 100 ? ` · 적 체력 ${hp}%·공격 ${atk}%` : ''}`;
}

export function planView(root: HTMLElement, faction: FactionConfig, exp: ExpeditionState, tierIndex: number, h: PlanViewHandlers): void {
  beginPlanning(exp, h.placeLimit);
  // 첫 진화 전 타일 잠김(GDD 64장 1번)이면 바둑판을 아예 만들지 않는다 (C.170, GDD 100장 #23: 한 줄 안내 + 바로 [출발])
  const planner = h.tilesLocked ? null : roadPlanner({ exp, tileName: (id) => tileName(id, faction.id), synergyName: (id) => synergyName(id, faction.id), onPlaced: () => paintCount() });

  const title = el('h2', 'bha-plan__title');
  title.append(icon('i-deck'), '길에 타일 놓기');

  // 사냥터 고르기 (GDD 24-2): 열린 곳만 고를 수 있고, 잠긴 곳은 열리는 단계를 보인다
  const grounds = el('div', 'bha-plan__grounds');
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
  const pick = (g: GroundDef) => {
    chooseGround(exp, g.id);
    gBtns.forEach((b, i) => {
      const on = GROUNDS[i]!.id === g.id;
      b.classList.toggle('is-on', on);
      b.setAttribute('aria-pressed', String(on));
    });
    gInfo.textContent = `${groundName(faction, g.id, GROUNDS.indexOf(g))}: ${groundInfo(faction, g)}`;
  };
  grounds.append(...gBtns);
  pick(GROUNDS.find((g) => g.id === exp.groundId) ?? GROUNDS[0]!);

  // 난이도 ★ 고르기 (GDD 32-1 4번): 열린 ★ 만 고를 수 있고(n단계에 처음 닿으면 ★n), 기본 = 내 단계(권장 표시), 잠긴 ★ 는 열리는 단계를 보인다
  const L = difficultyLabels(faction);
  const unlocked = Math.max(1, Math.min(MAX_DIFFICULTY, h.unlockedDifficulty ?? 1));
  const rec = recommendedDifficulty(tierIndex);
  const diff = el('div', 'bha-plan__grounds bha-plan__difficulty');
  diff.setAttribute('role', 'group');
  diff.setAttribute('aria-label', L.name);
  const dInfo = el('p', 'bha-plan__sub');
  dInfo.dataset.difficultyInfo = '';
  const dBtns = Array.from({ length: MAX_DIFFICULTY }, (_, i) => {
    const star = i + 1;
    const open = star <= unlocked;
    const b = button({ label: difficultyText(faction, star), icon: open ? undefined : 'i-lock', size: 'small', disabled: !open, onClick: () => pickStar(star) });
    if (!open) b.title = L.locked.replace('{tier}', String(star));
    if (star === rec) b.append(' ', el('span', 'bha-tag bha-tag--kind', L.recommended));
    b.dataset.difficulty = String(star);
    return b;
  });
  const pickStar = (star: number) => {
    chooseDifficulty(exp, star, unlocked);
    dBtns.forEach((b, i) => {
      const on = i + 1 === star;
      b.classList.toggle('is-on', on);
      b.setAttribute('aria-pressed', String(on));
    });
    dInfo.textContent = difficultyInfo(faction, star, tierIndex, h.streak?.star === star ? h.streak.count : 0);
  };
  diff.append(el('span', 'bha-plan__label', L.name), ...dBtns);
  pickStar(Math.min(unlocked, exp.difficulty));
  const help = button({ label: '도움말', icon: 'i-help', iconOnly: true, variant: 'ghost', size: 'small', onClick: h.onHelp });
  const head = el('div', `bha-exp__head${h.onTab ? ' bha-depart-head' : ''}`);
  // [자유 원정]/[스토리]/[탑] 탭이 있으면 제목 자리를 대신한다 (머리 한 줄 높이를 지킨다)
  const onTab = h.onTab;
  head.append(onTab ? departTabs('free', (id) => { if (id !== 'free') onTab(id); }) : title, grounds, help);

  const start = button({
    label: '출발', icon: 'i-play', variant: 'primary', block: true,
    onClick: () => h.onStart(finishPlanning(exp)),
  });
  start.dataset.sc = 'go';
  // [출발] = 화면 아래 고정 띠 (GDD 100장 #3·#22): 스크롤하지 않아도 늘 보인다
  const go = el('div', 'bha-plan__go');
  go.append(start);
  // 한 줄 안내 (GDD 100장 #25): 배치 요령 긴 문단은 ? 도움말(툴팁)로, 화면엔 "타일 고르기 → 빈 칸 누르기 · 놓은 칸 n/최대"
  const sub = el('p', 'bha-plan__sub bha-plan__line');
  const countEl = el('b', 'bha-num');
  const paintCount = () => {
    const placed = exp.slots.slice(1).filter((x) => x !== null).length;
    countEl.textContent = `${placed}/${h.placeLimit ?? '∞'}`;
  };
  if (h.tilesLocked) {
    sub.append(icon('i-lock'), ' 타일 배치는 첫 진화 후 — 지금은 기본 길을 걷는다(빈 칸마다 떠돌이 적)');
    sub.dataset.tilesLocked = '';
  } else {
    sub.append('타일 고르기 → 빈 칸 누르기 · 놓은 칸 ', countEl);
    sub.title = `가진 타일을 길 위 칸에 놓는다(최대 ${h.placeLimit ?? '∞'}칸, 놓은 타일이 보상으로 뽑힌다). 안 놓은 칸에는 떠돌이 적이 나온다. 붙여 놓으면 시너지가 생긴다. 놓은 타일을 누른 뒤 빈 칸 = 이동, 다른 타일 = 교체, 같은 칸 = 손으로.`;
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
        return `${preset.name} 불러옴: ${r.placed}칸${r.missing.length > 0 ? ` · 없는 타일 ${r.missing.length}장은 건너뜀` : ''}`;
      },
    }, (id) => tileName(id, faction.id), `최대 ${h.placeLimit ?? '∞'}칸`)
    : null;
  // 오른쪽 열 = 손패 / 프리셋 토글 (책장 제목 토글과 같은 seg 버튼, GDD 100장 #24): 스크롤은 오른쪽 목록 하나뿐
  if (planner && presetEl) {
    const hand = planner.el.querySelector<HTMLElement>('.bha-road__hand')!;
    presetEl.classList.add('bha-plan__side');
    const toggle = el('div', 'bha-plan__sidetabs');
    toggle.setAttribute('role', 'group');
    toggle.setAttribute('aria-label', '오른쪽 목록');
    const tabs = (['hand', 'presets'] as const).map((k) => {
      const b = button({ label: k === 'hand' ? '손패' : '프리셋', icon: k === 'hand' ? 'i-deck' : 'i-check', size: 'small', onClick: () => show(k) });
      b.dataset.planSide = k;
      return b;
    });
    const show = (k: 'hand' | 'presets') => {
      hand.hidden = k !== 'hand';
      presetEl.hidden = k !== 'presets';
      tabs.forEach((b) => {
        const on = b.dataset.planSide === k;
        b.classList.toggle('is-on', on);
        b.setAttribute('aria-pressed', String(on));
      });
    };
    toggle.append(...tabs);
    // 프리셋 칸·토글도 배치판(planner.el) 안에 둔다: 끌어 놓기·선택 풀기가 배치판 범위를 본다
    planner.el.append(toggle, presetEl);
    show('hand');
  }
  const main = mountApp(root, { fixed: true, cls: `bha-plan${h.tilesLocked ? ' is-locked' : ''}` }, head, gInfo, diff, dInfo, sub, ...(planner ? [planner.el] : []), ...(presetEl && !planner ? [presetEl] : []), go);
  main.dataset.screen = 'expedition-plan';
}
