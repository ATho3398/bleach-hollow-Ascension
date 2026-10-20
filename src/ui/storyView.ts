// 스토리 모드 화면 (GDD 25-4·25-7): 원정 출발 화면의 [스토리] 탭. 왼쪽 장 목록(잠긴 장은 열리는 단계) → 오른쪽 그 장의 화 목록(순서대로 열림, 클리어 표시, 목표·권장 단계, [도전]).
// 장·화 이름과 대사는 종족별 스토리 데이터, 화면은 종족 id 로 분기하지 않는다.
import { chapterContent, episodeKey, STORY_CHAPTERS, type StoryEpisode, type StoryObjective } from '../data/story';
import { groundName, type FactionConfig } from '../engine/faction';
import { GROUNDS } from '../data/grounds';
import { bossName } from '../data/bosses';
import { chapterOpen, episodeOpen, storyProgressOf, type SaveData } from '../game';
import type { ExpeditionState } from '../engine/expedition';
import { storyEpisodeOf } from '../engine/expedition';
import { button, el, icon, seg } from './bha/dom';
import { lcdPage, masterDetail, selectLast, type ListRow } from './bha/lcdpage';

export interface StoryViewHandlers {
  /** [자유 원정] 탭 */
  onFree: () => void;
  /** 열린 화 [도전] */
  onPick: (chapterId: string, episodeId: string) => void;
  onHelp: () => void;
}

/** 원정 출발 화면 머리의 [자유 원정] / [스토리] 탭 (GDD 25-7) */
export function departTabs(current: 'free' | 'story', onSelect: (id: 'free' | 'story') => void): HTMLElement {
  const t = seg([{ id: 'free', label: '자유 원정' }, { id: 'story', label: '스토리' }], current, (id) => {
    if (id !== current) onSelect(id as 'free' | 'story');
  }, { small: true });
  t.classList.add('bha-depart-tabs');
  t.setAttribute('aria-label', '원정 종류');
  return t;
}

/** 목표 문구 (GDD 25-7 표기): "일반 적 3마리 처치" · "2바퀴 버티기" · "강적 1마리 흡수" · "보스 처치" */
export function objectiveText(o: StoryObjective): string {
  const cls = (c: 'normal' | 'elite') => (c === 'elite' ? '강적' : '일반 적');
  if (o.type === 'defeat') return `${cls(o.enemyClass)} ${o.count}마리 처치`;
  if (o.type === 'absorb') return `${cls(o.enemyClass)} ${o.count}마리 흡수`;
  if (o.type === 'survive') return `${o.laps}바퀴 버티기`;
  return '보스 처치';
}

/** 목표 수 (진행도 분모) */
export function objectiveNeed(o: StoryObjective): number {
  return o.type === 'survive' ? o.laps : o.type === 'boss' ? 1 : o.count;
}

/** 원정 중 목표 한 줄: "목표 · 일반 적 3마리 처치 1/3" (스토리가 아니면 null) */
export function storyGoalLine(exp: ExpeditionState): string | null {
  const ep = storyEpisodeOf(exp);
  if (!ep || !exp.story) return null;
  return `목표 · ${objectiveText(ep.objective)} ${Math.min(exp.story.progress, objectiveNeed(ep.objective))}/${objectiveNeed(ep.objective)}`;
}

/** 장 이름: "1장 「굶주린 영혼」", 내용이 없으면 "2장 (준비 중)" */
export function chapterLabel(factionId: string, chapterId: string): string {
  const c = STORY_CHAPTERS.find((x) => x.id === chapterId)!;
  const content = chapterContent(factionId, chapterId);
  return content ? `${c.number}장 「${content.title}」` : `${c.number}장 (준비 중)`;
}

export function storyView(root: HTMLElement, faction: FactionConfig, save: SaveData, h: StoryViewHandlers): void {
  const prog = storyProgressOf(save);
  const tier = save.evolution.tierIndex;

  const episodeRow = (chId: string, ep: StoryEpisode, i: number): HTMLElement => {
    const open = episodeOpen(save, chId, ep.id);
    const done = prog.cleared[episodeKey(chId, ep.id)];
    const row = el('div', `bha-story-ep${open ? '' : ' is-locked'}${done ? ' is-cleared' : ''}`);
    row.dataset.episode = ep.id;
    const mark = el('span', 'bha-story-ep__mark');
    mark.append(icon(done ? 'i-check' : open ? 'i-flag-win' : 'i-lock'));
    const txt = el('div', 'bha-story-ep__text');
    const name = el('b', 'bha-story-ep__name', `${i + 1}화 ${ep.title}`);
    const goal = el('small', 'bha-story-ep__goal', `목표 · ${objectiveText(ep.objective)} · 권장 ${ep.recommendedTier}단계${ep.boss ? ` · 보스 ${bossName(ep.boss.id, faction.id)}` : ''}`);
    txt.append(name, goal);
    const state = el('span', 'bha-story-ep__state', done ? `클리어${done.clears > 1 ? ` ×${done.clears}` : ''}` : open ? '' : '앞 화를 깨면 열린다');
    row.append(mark, txt, state);
    if (open) {
      const go = button({ label: done ? '다시' : '도전', icon: 'i-play', variant: done ? undefined : 'primary', size: 'small', onClick: () => h.onPick(chId, ep.id) });
      go.dataset.go = ep.id;
      row.append(go);
    }
    return row;
  };

  const rows: ListRow[] = STORY_CHAPTERS.map((c) => {
    const content = chapterContent(faction.id, c.id);
    const open = chapterOpen(save, c.id);
    const cleared = prog.chapters.includes(c.id);
    const gIdx = GROUNDS.findIndex((g) => g.id === c.groundId);
    const lockText = tier < c.unlockTierIndex ? `${c.unlockTierIndex + 1}단계(${faction.tierNames[c.unlockTierIndex] ?? ''})에 열린다` : '준비 중';
    const lockShort = tier < c.unlockTierIndex ? `${c.unlockTierIndex + 1}단계에 열림` : '준비 중';
    return {
      label: chapterLabel(faction.id, c.id),
      cls: open ? (cleared ? 'bha-mdrow--unlocked' : undefined) : 'is-unknown',
      content: [icon(open ? (cleared ? 'i-check' : 'i-flag-win') : 'i-lock'), el('span', 'bha-mdrow__name', chapterLabel(faction.id, c.id)), el('span', 'bha-mdrow__state', open ? (cleared ? '완료' : `${content!.episodes.filter((e) => prog.cleared[episodeKey(c.id, e.id)]).length}/${content!.episodes.length}화`) : lockShort)],
      detail: () => {
        const head = el('div', 'bha-story-ch');
        head.append(el('h2', 'bha-story-ch__title', chapterLabel(faction.id, c.id)), el('p', 'bha-faint', `무대 · ${groundName(faction, c.groundId, Math.max(0, gIdx))}${open ? '' : ` · ${lockText}`}`));
        if (!content) return [head, el('p', 'bha-faint', '이 장은 아직 준비 중이다.')];
        const list = el('div', 'bha-story-eps');
        list.append(...content.episodes.map((ep, i) => episodeRow(c.id, ep, i)));
        return [head, list];
      },
    };
  });
  const md = masterDetail(rows, Math.max(0, STORY_CHAPTERS.findIndex((c) => chapterOpen(save, c.id) && !prog.chapters.includes(c.id))), '장 목록');

  const help = button({ label: '도움말', icon: 'i-help', iconOnly: true, variant: 'ghost', size: 'small', onClick: h.onHelp });
  // 머리 (C.63, GDD 28장 8번): [자유 원정]/[스토리] 탭을 출발 화면(planView)과 같은 자리(머리 맨 왼쪽)에 둔다 — 탭을 바꿔도 탭이 움직이지 않게
  const head = el('header', 'bha-exp__head bha-depart-head');
  head.append(departTabs('story', () => h.onFree()), el('p', 'bha-depart-head__sub', '정해진 길 · 목표 1개 · 대화. 화를 깨면 다음 화가 열린다'), selectLast(help));
  const { app } = lcdPage(root, { cls: 'bha-story', cols: '2fr 3fr' }, head, [md.list], [md.detail]);
  app.dataset.screen = 'story';
}
