// 튜토리얼 목록 (GDD 23-3): 독 [더보기] → [튜토리얼]. 왼쪽 목표 목록(달성/미달성/준비 중), 오른쪽 고른 목표의 보상·달성 시각.
// 목표 문구는 종족 설정 자리표시자로 채우고, 판정·지급은 자동(game.ts claimTutorialGoals) — 여기서는 보기만 한다. 체험 전투(튜토리얼 다시 보기)도 여기서 연다.
import { TUTORIAL_GOALS, TUTORIAL_GOALS_PROVISIONAL, type TutorialGoalDef, type TutorialReward } from '../data/tutorials';
import { helpVars, renderHelpText } from '../data/help';
import { SOUL_CRYSTAL_NAME } from '../data/economy';
import type { FactionConfig, FoodId } from '../engine/faction';
import type { SaveData, TutorialGrant } from '../game';
import { button, h, icon, provisionalTag } from './bha/dom';
import { lcdHead, lcdPage, masterDetail, selectLast, type ListRow } from './bha/lcdpage';
import { showToast } from './bha/nest';
import { getOverlayHost } from './bha/overlayHost';
import { formatUnlockTime } from './titleDexView';

export function tutorialGoalText(def: TutorialGoalDef, faction: FactionConfig): string {
  return renderHelpText(def.text, helpVars(faction));
}

/** 보상 한 줄: "간식 3 · 영혼 결정 1" */
export function rewardText(reward: TutorialReward | { food: [FoodId, number][]; soulCrystals: number }, faction: FactionConfig): string {
  const food = Array.isArray(reward.food) ? reward.food : (Object.entries(reward.food ?? {}) as [FoodId, number][]);
  const parts = food.filter(([, n]) => n > 0).map(([id, n]) => `${faction.foodNames[id]} ${n}`);
  if ((reward.soulCrystals ?? 0) > 0) parts.push(`${SOUL_CRYSTAL_NAME} ${reward.soulCrystals}`);
  return parts.length > 0 ? parts.join(' · ') : '보관 한도가 차서 받지 못함';
}

export type GoalRowState = 'done' | 'open' | 'locked';

export function goalRowState(def: TutorialGoalDef, claimedAt: number | null): GoalRowState {
  return claimedAt !== null ? 'done' : def.available ? 'open' : 'locked';
}

const STATE_TEXT: Record<GoalRowState, string> = { done: '달성', open: '미달성', locked: '준비 중' };
const STATE_ICON: Record<GoalRowState, string> = { done: 'i-check', open: 'i-play', locked: 'i-lock' };

function goalRow(def: TutorialGoalDef, faction: FactionConfig, claimedAt: number | null): ListRow {
  const st = goalRowState(def, claimedAt);
  const name = tutorialGoalText(def, faction);
  return {
    label: `${name} ${STATE_TEXT[st]}`,
    cls: `bha-mdrow--${st === 'done' ? 'unlocked' : 'locked'}`,
    content: [icon(STATE_ICON[st]), h('span', 'bha-mdrow__name', name), h('small', 'bha-mdrow__state', STATE_TEXT[st])],
    detail: () => {
      const head = h('div', 'bha-mddetail__head');
      head.append(h('h2', 'bha-mddetail__title', name), h('span', st === 'done' ? 'bha-chip bha-chip--good' : 'bha-chip', STATE_TEXT[st]));
      const reward = h('p', 'bha-mddetail__body', `보상: ${rewardText(def.reward, faction)}`);
      const when = h('p', 'bha-faint', st === 'done' ? `받음 ${formatUnlockTime(claimedAt!)}` : st === 'locked' ? '이 기능이 아직 없다. 열리면 함께 켜진다.' : '이루면 바로 받는다.');
      return [head, reward, when];
    },
  };
}

export function tutorialGoalsView(root: HTMLElement, faction: FactionConfig, save: SaveData, onReplay: () => void): void {
  const claims = new Map((save.shared.tutorials[faction.id] ?? []).map((c) => [c.goalId, c.at]));
  const rows = TUTORIAL_GOALS.map((d) => goalRow(d, faction, claims.get(d.id) ?? null));
  const md = masterDetail(rows, 0, '튜토리얼 목표');
  const sub = h('span');
  sub.append(`${faction.name} 트랙 · 달성 `, h('b', '', String(TUTORIAL_GOALS.filter((d) => claims.has(d.id)).length)), ` / ${TUTORIAL_GOALS.length}`);
  if (TUTORIAL_GOALS_PROVISIONAL) sub.append(' ', provisionalTag('임시 보상'));
  const replay = button({ label: '튜토리얼 다시 보기', icon: 'i-play', size: 'small', onClick: onReplay });
  lcdPage(root, { cls: 'bha-titles-page bha-tutorials-page', cols: 'minmax(0, 1fr) minmax(0, 1fr)' }, lcdHead({ title: '튜토리얼', sub, aside: [selectLast(replay)] }), [md.list], [md.detail]);
}

/** 새로 받은 튜토리얼 보상 토스트 (GDD 23-3 "튜토리얼 달성: ○○ — 보상 ○○"). 한꺼번에 3개 이상이면(기존 세이브 일괄 지급) 한 장으로 묶는다 */
export function showTutorialToasts(grants: readonly TutorialGrant[], faction: FactionConfig): void {
  if (grants.length === 0) return;
  // 칭호 해금 토스트가 이미 떠 있으면 그 아래로 쌓는다
  const base = getOverlayHost().querySelectorAll('.bha-toast').length;
  if (grants.length <= 2) {
    // 가로 LCD 는 토스트 meta 줄을 숨기므로 보상은 머리 줄에 붙인다 ("튜토리얼 달성 — 보상 ○○" / 목표 이름)
    grants.forEach((g, i) => showToast({ eyebrow: `튜토리얼 달성 — 보상 ${rewardText(g, faction)}`, title: tutorialGoalText(g.goal, faction) }, base + i, 3200));
    return;
  }
  const food = new Map<FoodId, number>();
  let crystals = 0;
  for (const g of grants) {
    for (const [id, n] of g.food) food.set(id, (food.get(id) ?? 0) + n);
    crystals += g.soulCrystals;
  }
  showToast({ eyebrow: `튜토리얼 달성 — 보상 ${rewardText({ food: [...food.entries()], soulCrystals: crystals }, faction)}`, title: `이미 이룬 목표 ${grants.length}개` }, base, 3600);
}
