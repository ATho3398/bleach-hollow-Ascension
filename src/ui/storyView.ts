// 스토리 모드 화면 (GDD 25-4·25-7): 원정 출발 화면의 [스토리] 탭. 왼쪽 장 목록(잠긴 장은 열리는 단계) → 오른쪽 그 장의 화 목록(순서대로 열림, 클리어 표시, 목표·권장 단계, [도전]).
// 장·화 이름과 대사는 종족별 스토리 데이터, 화면은 종족 id 로 분기하지 않는다.
import { chapterContent, episodeKey, STORY_CHAPTERS, type StoryEpisode, type StoryObjective } from '../data/story';
import { difficultyText, groundName, type FactionConfig } from '../engine/faction';
import { GROUNDS } from '../data/grounds';
import { bossName } from '../data/bosses';
import { getFaction } from '../data/factions';
import { chapterOpen, episodeOpen, storyProgressOf, type SaveData } from '../game';
import type { ExpeditionState } from '../engine/expedition';
import { storyEpisodeOf } from '../engine/expedition';
import { button, el, icon } from './bha/dom';
import { lcdPage, masterDetail, selectLast, type ListRow } from './bha/lcdpage';
import { v2Icon } from './bha/iconMap';

/** 그림 칸 (183장, PROMPT 4절 스토리): 잠기면 그림만 흐리게 + 그 칸 안 오른쪽 아래 자물쇠 */
function chapterArt(iconName: string, locked: boolean): HTMLElement {
  const art = el('span', `bha-art bha-art--frame bha-story-art${locked ? ' is-locked' : ''}`);
  art.append(v2Icon(iconName));
  if (locked) {
    const lock = el('span', 'bha-lock');
    lock.append(v2Icon('lock'));
    art.append(lock);
  }
  return art;
}

/** 잠긴 것의 [도전]: 흐리게 자리 유지, 누르면 이유 한 줄 (PROMPT 5절 4) */
function lockedGo(reason: string): HTMLButtonElement {
  const b = button({ label: '도전', icon: 'i-play', size: 'small', onClick: () => {
    const row = b.parentElement;
    if (!row || row.querySelector('.bha-pop')) return;
    const pop = el('p', 'bha-pop bha-story-why', reason);
    row.append(pop);
    window.setTimeout(() => pop.remove(), 2000);
  } });
  b.classList.add('is-disabled');
  b.setAttribute('aria-disabled', 'true');
  b.dataset.locked = '';
  return b;
}

export interface StoryViewHandlers {
  /** [자유 원정] 탭 */
  onTab: (id: DepartTab) => void;
  /** 열린 화 [도전] */
  onPick: (chapterId: string, episodeId: string) => void;
  onHelp: () => void;
  /** 머리 탭의 탑 칸 (GDD 222장 9) */
  tower?: DepartTower;
}

export type DepartTab = 'free' | 'story' | 'tower';

/** 머리 탭의 탑 칸 (GDD 222장 9): 이름 + 잠겼으면 이유 한 줄(자물쇠) */
export interface DepartTower {
  name: string;
  /** 잠긴 이유 (null = 열림) */
  locked: string | null;
}

/**
 * 모험 준비 머리 탭 [자유 모험][스토리][탑] (GDD 222장 9 — 옛 '자유 모험 ▾' 펼침 목록 대신, 스토리 입구가 숨지 않게).
 * 잠긴 탑은 자물쇠 + aria-disabled — 눌러도 탭은 바뀌지 않고 onSelect('tower') 로 이유 알림만(부르는 쪽). 지금 탭을 다시 누르면 아무 일도 없다
 */
export function departTabs(current: DepartTab, onSelect: (id: DepartTab) => void, tower?: DepartTower): HTMLElement {
  const root = el('div', 'bha-seg bha-seg--sm bha-depart-tabs');
  root.setAttribute('role', 'tablist');
  root.setAttribute('aria-label', '모험 종류');
  const items: { id: DepartTab; label: string; lock?: string | null }[] = [
    { id: 'free', label: '자유 모험' },
    { id: 'story', label: '스토리' },
    ...(tower ? [{ id: 'tower' as const, label: tower.name, lock: tower.locked }] : []),
  ];
  for (const it of items) {
    const b = el('button', 'bha-seg__item');
    b.type = 'button';
    b.setAttribute('role', 'tab');
    b.dataset.id = it.id;
    b.dataset.tab = it.id;
    b.setAttribute('aria-selected', String(it.id === current));
    if (it.lock) {
      b.append(icon('i-lock', 'sm'));
      b.setAttribute('aria-disabled', 'true');
      b.title = it.lock;
      b.setAttribute('aria-description', it.lock);
    }
    b.append(it.label);
    b.onclick = () => {
      if (it.id !== current) onSelect(it.id);
    };
    root.append(b);
  }
  return root;
}

/** 목표 문구 (GDD 25-7 표기): "일반 적 3마리 처치" · "2바퀴 버티기" · "강적 1마리 포식" · "보스 처치". 흡수 행동 이름은 종족 설정 absorbActionName (C.172) */
export function objectiveText(o: StoryObjective, faction: FactionConfig): string {
  const cls = (c: 'normal' | 'elite') => (c === 'elite' ? '강적' : '일반 적');
  if (o.type === 'defeat') return `${cls(o.enemyClass)} ${o.count}마리 처치`;
  if (o.type === 'absorb') return `${cls(o.enemyClass)} ${o.count}마리 ${faction.absorbActionName}`;
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
  return `목표 · ${objectiveText(ep.objective, getFaction(exp.factionId))} ${Math.min(exp.story.progress, objectiveNeed(ep.objective))}/${objectiveNeed(ep.objective)}`;
}

/** 장 이름: "1장 「굶주린 영혼」", 내용이 없으면 "2장 (준비 중)" */
export function chapterLabel(factionId: string, chapterId: string): string {
  const c = STORY_CHAPTERS.find((x) => x.id === chapterId)!;
  const content = chapterContent(factionId, chapterId);
  return content ? `${c.number}장 「${content.title}」` : `${c.number}장 (준비 중)`;
}

function chapterText(name: string, line: string): HTMLElement {
  const t = el('span', 'bha-story-row__txt');
  t.append(el('span', 'bha-mdrow__name', name), el('small', 'bha-mdrow__state', line));
  return t;
}

export function storyView(root: HTMLElement, faction: FactionConfig, save: SaveData, h: StoryViewHandlers): void {
  const prog = storyProgressOf(save);
  const tier = save.evolution.tierIndex;

  const episodeRow = (chId: string, ep: StoryEpisode, i: number, chLock: string | null): HTMLElement => {
    const why = chLock ?? '앞 화를 깨면 열린다'; // 장이 잠겼으면 장이 열리는 조건
    const open = episodeOpen(save, chId, ep.id);
    const done = prog.cleared[episodeKey(chId, ep.id)];
    const row = el('div', `bha-story-ep${open ? '' : ' is-locked'}${done ? ' is-cleared' : ''}`);
    row.dataset.episode = ep.id;
    const mark = chapterArt(done ? 'check' : 'scroll', !open);
    mark.classList.add('bha-story-ep__mark');
    // 글자 칸 = 펼침 버튼 (권장 단계·난이도·보스 한 줄을 연다 — 기기 ▲▼·키보드로도 고른다)
    const txt = el('button', 'bha-story-ep__text') as HTMLButtonElement;
    txt.type = 'button';
    txt.setAttribute('aria-expanded', 'false');
    const name = el('b', 'bha-story-ep__name', `${i + 1}화 ${ep.title}`);
    // 목록 줄은 목표만 (GDD 189장 엑셀 13 — 폰에서 '목표 · … · 권…' 말줄임). 권장 단계·난이도·보스는 그 화를 눌러 고르면 아래 한 줄로 펼친다
    const goal = el('small', 'bha-story-ep__goal', `목표 · ${objectiveText(ep.objective, faction)}`);
    const meta = el('small', 'bha-story-ep__meta', `권장 ${ep.recommendedTier}단계 · ${difficultyText(faction, ep.difficulty)}${ep.boss ? ` · 보스 ${bossName(ep.boss.id, faction.id)}` : ''}`);
    txt.append(name, goal, meta);
    txt.onclick = () => {
      const on = !row.classList.contains('is-open');
      row.parentElement?.querySelectorAll('.bha-story-ep.is-open').forEach((r) => {
        r.classList.remove('is-open');
        r.querySelector('.bha-story-ep__text')?.setAttribute('aria-expanded', 'false');
      });
      row.classList.toggle('is-open', on);
      txt.setAttribute('aria-expanded', String(on));
    };
    if (!open) txt.append(el('small', 'bha-story-ep__cond', `열리는 조건: ${why}`));
    const state = el('span', 'bha-story-ep__state', done ? `클리어${done.clears > 1 ? ` ×${done.clears}` : ''}` : '');
    row.append(mark, txt, state);
    if (open) {
      const go = button({ label: done ? '다시' : '도전', icon: 'i-play', variant: done ? undefined : 'primary', size: 'small', onClick: () => h.onPick(chId, ep.id) });
      go.dataset.go = ep.id;
      row.append(go);
    } else row.append(lockedGo(why));
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
      // 장 줄 (183장, PROMPT 4절): 그림 칸(잠기면 흐림 + 자물쇠) · 이름 / 둘째 줄 진행 또는 '열리는 조건: …'
      content: [chapterArt(cleared ? 'check' : 'scroll', !open), chapterText(chapterLabel(faction.id, c.id), open ? (cleared ? '완료' : `${content!.episodes.filter((e) => prog.cleared[episodeKey(c.id, e.id)]).length}/${content!.episodes.length}화`) : `열리는 조건: ${lockShort}`)],
      detail: () => {
        const head = el('div', 'bha-story-ch');
        head.append(el('h2', 'bha-story-ch__title', chapterLabel(faction.id, c.id)), el('p', 'bha-faint', `무대 · ${groundName(faction, c.groundId, Math.max(0, gIdx))}${open ? '' : ` · ${lockText}`}`));
        if (!content) return [head, el('p', 'bha-faint', '이 장은 아직 준비 중이다.')];
        const list = el('div', 'bha-story-eps');
        list.append(...content.episodes.map((ep, i) => episodeRow(c.id, ep, i, open ? null : lockText)));
        return [head, list];
      },
    };
  });
  const md = masterDetail(rows, Math.max(0, STORY_CHAPTERS.findIndex((c) => chapterOpen(save, c.id) && !prog.chapters.includes(c.id))), '장 목록');

  const help = button({ label: '도움말', icon: 'i-help', iconOnly: true, variant: 'ghost', size: 'small', onClick: h.onHelp });
  // 머리 (C.63, GDD 28장 8번): [자유 원정]/[스토리] 탭을 출발 화면(planView)과 같은 자리(머리 맨 왼쪽)에 둔다 — 탭을 바꿔도 탭이 움직이지 않게
  const head = el('header', 'bha-exp__head bha-depart-head');
  head.append(departTabs('story', h.onTab, h.tower), el('p', 'bha-depart-head__sub', '정해진 길 · 목표 1개 · 대화. 화를 깨면 다음 화가 열린다'), selectLast(help));
  const { app } = lcdPage(root, { cls: 'bha-story', cols: '2fr 3fr' }, head, [md.list], [md.detail]);
  app.dataset.screen = 'story';
  app.classList.add('bha-v2'); // v2 그림 칸·자물쇠·이유 한 줄(.bha-art · .bha-lock · .bha-pop)
}
