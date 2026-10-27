// 원정 결과 (U-4, 기획서 2-1·9장): 종료 이유 4가지 → 귀환 계열 = 승리 톤, 패배 계열 = 패배 톤. 요약·시드·기록 저장 줄, [둥지로].
import { fullnessOf } from './bha/fullness';
import { BALANCE } from '../config/balance';
import { mutationName, synergyName, tileName } from '../data/tiles';
import { TRADE_CURRENCY_NAME } from '../data/economy';
import { traitName } from '../data/traits';
import type { ExpeditionState } from '../engine/expedition';
import { summarize } from '../engine/expedition';
import { groundName, type FactionConfig, type FoodId } from '../engine/faction';
import { GROUNDS } from '../data/grounds';
import { countFoods } from '../engine/food';
import { button, el, icon, panel } from './bha/dom';
import { splitApp } from './bha/split';
import { playCosmeticFx } from './bha/cosmeticFx';
import { endTone, iconInfo, val, type IconInfoRow } from './bha/expedition';
import { endReasonText } from './labels';
import { growthLines, type GrowthInput } from './bha/growthLogic';
import { chapterClearJade, chapterContent, getEpisode, STORY_CHAPTERS } from '../data/story';
import { bossName } from '../data/bosses';
import { BALANCE as B } from '../config/balance';
import { chapterLabel } from './storyView';
import { toward } from './bha/nestLogic';
import { expeditionEndVitals } from '../engine/nest';
import { difficultyGoldMultiplier } from '../engine/difficulty';

/** 스토리 화 결과 줄 (GDD 25-4·25-7): 클리어/실패, 화 보상(골드·먹이), 첫 클리어·장 클리어·보스 첫 처치 영옥 */
export function storyResultLines(exp: ExpeditionState, faction: FactionConfig): string[] {
  // 자유 원정 보스 (GDD 37장 4번): 이기면 골드(× 원정 골드 배율)·잔치 — 전리품 줄에도 들어 있다
  const fb = exp.freeBoss?.result;
  if (fb) {
    const BR = B.provisional.boss.reward;
    const gold = Math.round(BR.gold * difficultyGoldMultiplier(exp.difficulty, exp.streak));
    return [fb.won
      ? `자유 원정 보스 ${bossName(fb.bossId, faction.id)} 처치! ${TRADE_CURRENCY_NAME} +${gold} · ${faction.foodNames[BR.food as FoodId]} 1 · 보스 도감 처치 +1`
      : `자유 원정 보스 ${bossName(fb.bossId, faction.id)}에게 졌다 (마지막 바퀴 전리품을 잃었다)`];
  }
  const r = exp.storySettled;
  if (!r) return [];
  const ep = getEpisode(faction.id, r.chapterId, r.episodeId);
  const out = [`${chapterLabel(faction.id, r.chapterId)} · ${ep.title} — ${r.cleared ? '클리어!' : '실패. 다시 도전할 수 있다'}`];
  if (r.cleared) out.push(`화 보상 ${TRADE_CURRENCY_NAME} +${r.gold - (r.overflowGold ?? 0)} · ${faction.foodNames[r.food[0]]} ${r.food[1] > 0 ? `${r.food[1]}개` : r.overflowGold !== undefined ? `(보관 한도 초과 → ${TRADE_CURRENCY_NAME} +${r.overflowGold})` : '(보관 한도라 못 받음)'}${r.firstClear ? ` · 첫 클리어 영옥 +${B.provisional.story.firstClearJade}` : ''}`);
  if (r.bossFirstKill) out.push(`보스 ${bossName(r.bossFirstKill, faction.id)} 첫 처치! 칭호 · 영옥 +${B.provisional.boss.reward.firstJade}`);
  if (r.chapterCleared) out.push(`${chapterLabel(faction.id, r.chapterId)} 완료! 칭호 · 영옥 +${chapterClearJade(r.chapterId)}`);
  return out;
}

/** 결과 화면 머리의 무대 이름 (GDD 43장 3번, C.96): 스토리 = "n장 m화 · 화 이름", 자유 원정 = 그 사냥터 이름. 이름은 종족 설정·데이터에서 읽는다 */
export function stageTitle(exp: Pick<ExpeditionState, 'story' | 'factionId' | 'groundId'>, faction: Pick<FactionConfig, 'huntingGroundName' | 'huntingGrounds'>): string {
  const st = exp.story;
  const ch = st ? STORY_CHAPTERS.find((c) => c.id === st.chapterId) : undefined;
  if (st && ch) {
    const eps = chapterContent(exp.factionId, st.chapterId)?.episodes ?? [];
    const i = eps.findIndex((e) => e.id === st.episodeId);
    if (i >= 0) return `${ch.number}장 ${i + 1}화 · ${eps[i]!.title}`;
  }
  return groundName(faction, exp.groundId, Math.max(0, GROUNDS.findIndex((g) => g.id === exp.groundId)));
}

export function resultView(root: HTMLElement, faction: FactionConfig, exp: ExpeditionState, stability: number, onHome: () => void, growth?: GrowthInput): void {
  const s = summarize(exp);
  const win = endTone(exp.endReason!) === 'win';
  const wins = exp.battles.filter((b) => b.won).length;
  const names = (ids: string[], f: (id: string) => string) => ids.map(f).join(', ');
  const countRow = (label: string, ic: string, ids: string[], f: (id: string) => string, unit: string, mod: 'good' | 'bad'): IconInfoRow => {
    const v = val(`${ids.length}${unit}`);
    if (ids.length > 0) v.append(el('br'), el('small', '', names(ids, f)));
    return { label, icon: ic, value: v, mod: ids.length > 0 ? mod : undefined };
  };

  // 얻은 먹이 (GDD 23-1 전리품): 종류별 개수, 상한(9)으로 못 넣은 것·패배로 잃은 것, 막힘 방지 간식
  function foodRow(): IconInfoRow {
    const fs = exp.foodSettled;
    const gained = fs?.gained ?? s.keptFood;
    const lost = fs?.lost ?? s.lostFood;
    const v = val(`${gained.length}개`);
    const list = (ids: FoodId[]) => countFoods(ids).map(([id, n]) => `${faction.foodNames[id]} ${n}`).join(', ');
    const notes: string[] = [];
    if (gained.length > 0) notes.push(list(gained));
    if ((fs?.overflow ?? 0) > 0) notes.push(fs!.overflowGold !== undefined ? `보관 한도 초과 → ${TRADE_CURRENCY_NAME} +${fs!.overflowGold}` : `보관 한도로 ${fs!.overflow}개 버림`);
    if (lost.length > 0) notes.push(`잃음 ${list(lost)}`);
    if ((fs?.fallback ?? 0) > 0) notes.push(`주변에서 겨우 먹을 것을 찾았다 (${faction.foodNames.snack} ${fs!.fallback})`);
    for (const n of notes) v.append(el('br'), el('small', '', n));
    return { label: '얻은 먹이', icon: 'i-care-feed', value: v, mod: gained.length > 0 || (fs?.fallback ?? 0) > 0 ? 'good' : lost.length > 0 ? 'bad' : undefined };
  }

  // 골드 (C.57, GDD 25-5): 번 것 − 상인에게 쓴 것, 패배로 잃은 것. 타일 변수 기록(시너지·변이·이벤트)은 한 줄로
  function goldRow(): IconInfoRow {
    const v = val(`${s.keptGold >= 0 ? '+' : ''}${s.keptGold}`, TRADE_CURRENCY_NAME);
    if (s.lostGold > 0) v.append(el('br'), el('small', '', `잃음 ${s.lostGold}`));
    const log = exp.variantLog;
    const notes: string[] = [];
    if (log && log.synergies.length > 0) {
      const n: Record<string, number> = {};
      for (const x of log.synergies) n[x.id] = (n[x.id] ?? 0) + 1;
      notes.push(`시너지 ${Object.entries(n).map(([id, k]) => `${synergyName(id, faction.id)}${k > 1 ? ` ×${k}` : ''}`).join(', ')}`);
    }
    if (log && log.mutations.length > 0) notes.push(`변이 ${log.mutations.map((m) => `${m.lap}바퀴 ${mutationName(m.id, faction.id)}`).join(', ')}`);
    if (log && log.events.length > 0) notes.push(`이벤트 ${log.events.length}번`);
    for (const n of notes) v.append(el('br'), el('small', '', n));
    return { label: TRADE_CURRENCY_NAME, icon: 'i-rare', value: v, mod: s.keptGold > 0 ? 'good' : s.lostGold > 0 ? 'bad' : undefined };
  }

  const head = el('header', `bha-result bha-result--${win ? 'win' : 'lose'}`);
  const mark = el('span', 'bha-result__mark');
  mark.append(icon(win ? 'i-return' : 'i-broken'));
  head.append(mark, el('span', 'bha-label', stageTitle(exp, faction)), el('h1', 'bha-result__title', win ? '귀환' : faction.defeatStateName), el('p', 'bha-result__reason', endReasonText(exp.endReason!, faction)));

  const home = expeditionEndVitals(exp);
  const rows: IconInfoRow[] = [
    { label: '도달 바퀴', icon: 'i-loop', value: val(`${s.laps}`, `/ 기본 ${BALANCE.expedition.defaultLaps}`) },
    { label: '치른 전투', icon: 'i-practice', value: val(`${exp.battles.length}회`, `(승 ${wins})`) },
    countRow('지킨 타일', 'i-deck', s.kept, (id) => tileName(id, faction.id), '장', 'good'),
    countRow('잃은 타일', 'i-deck', s.lost, (id) => tileName(id, faction.id), '장', 'bad'),
    countRow('얻은 특성', 'i-slot', s.keptTraits, (id) => traitName(id, faction.id), '개', 'good'),
    countRow('잃은 특성', 'i-slot', s.lostTraits, (id) => traitName(id, faction.id), '개', 'bad'),
    foodRow(),
    goldRow(),
    {
      label: `${faction.riskGaugeName} (최고 / 끝)`, icon: 'i-risk', mod: exp.breakthrough ? 'em' : undefined,
      value: val(`${Math.round(exp.riskPeak)} / ${Math.round(exp.risk)}`, exp.breakthrough ? `한계 돌파 · ${faction.frenzyName}` : undefined),
    },
    { label: faction.stabilityName, icon: 'i-stab', value: val(`${Math.round(stability)}`) },
    // 둥지로 가져가는 값 = 패배·폭주 감소를 뺀 뒤 (둥지 상태와 같은 값, C.68)
    { label: `남은 ${faction.fullnessName}`, icon: 'i-hunger', value: val(`${Math.round(fullnessOf(home.hunger))}`) },
    { label: '남은 컨디션', icon: 'i-cond', value: val(`${Math.round(home.condition)}`, Math.round(home.condition) < Math.round(exp.condition) ? `원정 끝 ${Math.round(exp.condition)}` : undefined) },
  ];
  const sum = panel({ title: '원정 요약' }, iconInfo(rows));

  const seed = el('p', 'bha-faint bha-center bha-num bha-seedline');
  seed.append(`시드 ${exp.seed} · `, icon('i-check', 'sm'), ' 기록이 런 로그에 저장됨');

  const dock = el('div', 'bha-dock');
  dock.append(button({ label: toward(faction.nestName), icon: 'i-nest', variant: 'primary', size: 'lg', block: true, onClick: onHome }));
  // 가로 LCD: 왼쪽 = 결과 제목·시드·[둥지로], 오른쪽 = 성장 요약 한두 줄 + 원정 요약 표 (왼쪽 열이 길어지면 스크롤이 생겨 오른쪽 맨 위에 둔다)
  const growthBox = growth ? el('div', 'bha-growth') : null;
  growthBox?.setAttribute('role', 'status');
  for (const line of growth ? growthLines(growth) : []) growthBox!.append(el('p', 'bha-growth__line', line));
  // 스토리 화 결과 (GDD 25-7): 성장 요약 위에
  const storyLines = storyResultLines(exp, faction);
  const storyBox = storyLines.length > 0 ? el('div', 'bha-growth bha-result__story') : null;
  storyBox?.setAttribute('role', 'status');
  for (const line of storyLines) storyBox!.append(el('p', 'bha-growth__line', line));
  const app = splitApp(root, { cls: 'bha-resultpage', sticky: true }, null, [head, seed, dock], [...(storyBox ? [storyBox] : []), ...(growthBox ? [growthBox] : []), sum]);
  if (win) playCosmeticFx('win', app); // 승리 연출 꾸밈 (GDD 25-11)
}

/** 원정 도중 귀환 결과 카드 한 줄 (C.170, GDD 100장 #32): "전투 3 · 포식 1 · 골드 +40 · 먹이 2 · 타일 1장". 행동 이름은 종족 설정(absorbActionName) */
export function abortSummaryLine(exp: ExpeditionState, faction: Pick<FactionConfig, 'absorbActionName'>): string {
  const sum = summarize(exp);
  return [
    `전투 ${exp.battles.length}`,
    `${faction.absorbActionName} ${exp.absorbRecords.filter((a) => a.absorbed).length}`,
    `${TRADE_CURRENCY_NAME} +${sum.keptGold}`,
    sum.keptFood.length > 0 ? `먹이 ${sum.keptFood.length}` : '',
    sum.kept.length > 0 ? `타일 ${sum.kept.length}장` : '',
  ].filter(Boolean).join(' · ');
}
