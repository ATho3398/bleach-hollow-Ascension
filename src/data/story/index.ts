// 스토리 모드 데이터 (GDD 25-4·25-7). 장 목록(열림 단계·사냥터)은 두 종족 공유 chapters.json, 장의 내용(제목·화·고정 길·목표·대사)은 종족별 파일
// src/data/story/<종족>/ch<번호>.json. 엔진은 종족 id 로 분기하지 않는다 — 새 종족은 파일을 만들고 아래 목록에 한 줄만 더한다.
import { BALANCE } from '../../config/balance';
import { isBossId } from '../bosses';
import { isGroundId } from '../grounds';
import { deckTilesFor } from '../tiles';
import chaptersRaw from './chapters.json';
import hollowCh1 from './hollow/ch1.json';
import hollowCh2 from './hollow/ch2.json';
import hollowCh3 from './hollow/ch3.json';
import shinigamiCh1 from './shinigami/ch1.json';
import shinigamiCh2 from './shinigami/ch2.json';
import shinigamiCh3 from './shinigami/ch3.json';

/** 대사 한 줄: 이름표 + 글 (그림 없이, GDD 25-4) */
export interface StoryLine {
  speaker: string;
  text: string;
}

/** 화 목표 1개 (GDD 25-4): 적 처치(등급) n마리 · n바퀴 버티기 · 적 흡수(등급) n마리 · 보스 처치 */
export type StoryObjective =
  | { type: 'defeat'; enemyClass: 'normal' | 'elite'; count: number }
  | { type: 'survive'; laps: number }
  | { type: 'absorb'; enemyClass: 'normal' | 'elite'; count: number }
  | { type: 'boss' };

export interface StoryEpisode {
  id: string;
  title: string;
  objective: StoryObjective;
  /** 권장 단계 (1부터, 표시만) */
  recommendedTier: number;
  /** 이 화의 원정 난이도 ★ (GDD 32-1 7번, C.75): 화마다 고정. 적 기준 능력치·체력·보상 배율 */
  difficulty: number;
  /** 이 화의 최대 바퀴 (목표를 못 이루고 넘기면 실패) */
  maxLaps: number;
  /** 고정 길: 칸 번호(1~11) → 타일 id */
  road: Record<string, string>;
  /** 보스 화: 보스 id 와 나오는 칸 (1바퀴) */
  boss?: { id: string; cell: number };
  dialogue: {
    start: StoryLine[];
    /** 중간 대사: 적을 afterKills 마리 쓰러뜨린 뒤 한 번 */
    mid?: { afterKills: number; lines: StoryLine[] };
    end: StoryLine[];
  };
}

/** 장 (두 종족 공유): 번호·열리는 단계(tierIndex)·무대 사냥터 */
export interface StoryChapterDef {
  id: string;
  number: number;
  unlockTierIndex: number;
  groundId: string;
}

/** 종족별 장 내용 */
export interface StoryChapterContent {
  factionId: string;
  chapterId: string;
  title: string;
  episodes: StoryEpisode[];
  provisional?: boolean;
}

const EX = BALANCE.expedition;
/** ★ 최대 = 단계 수 (engine/difficulty 와 같은 정의, 데이터 쪽은 순환 참조를 피해 직접 읽는다) */
const MAX_DIFFICULTY = BALANCE.provisional.stats.tierTotals.length;

export function parseChapterContent(r: unknown): StoryChapterContent {
  const c = (r ?? {}) as Partial<StoryChapterContent>;
  const errors: string[] = [];
  const where = `${String(c.factionId ?? '?')}/${String(c.chapterId ?? '?')}`;
  if (typeof c.factionId !== 'string' || typeof c.chapterId !== 'string' || typeof c.title !== 'string') errors.push('factionId·chapterId·title');
  const eps = Array.isArray(c.episodes) ? c.episodes : [];
  if (eps.length < 3 || eps.length > 5) errors.push('episodes: 3~5화 (GDD 25-4)');
  const usable = new Set(typeof c.factionId === 'string' ? deckTilesFor(c.factionId).map((t) => t.id) : []);
  const lineOk = (l: unknown) => typeof (l as StoryLine)?.speaker === 'string' && typeof (l as StoryLine)?.text === 'string' && (l as StoryLine).text.length > 0;
  eps.forEach((e, i) => {
    const at = `${i + 1}화(${String(e?.id)})`;
    if (typeof e?.id !== 'string' || typeof e.title !== 'string') errors.push(`${at}: id·title`);
    const o = e?.objective as Record<string, unknown> | undefined;
    const pos = (v: unknown) => typeof v === 'number' && Number.isInteger(v) && v > 0;
    if (!o || !(['defeat', 'survive', 'absorb', 'boss'] as unknown[]).includes(o.type)) errors.push(`${at}: objective.type`);
    else if ((o.type === 'defeat' || o.type === 'absorb') && (!pos(o.count) || (o.enemyClass !== 'normal' && o.enemyClass !== 'elite'))) errors.push(`${at}: objective enemyClass·count`);
    else if (o.type === 'survive' && (!pos(o.laps) || (o.laps as number) > (e.maxLaps ?? 0))) errors.push(`${at}: objective.laps (maxLaps 이하)`);
    else if (o.type === 'boss' && !e.boss) errors.push(`${at}: 보스 목표면 boss 필요`);
    if (!pos(e?.maxLaps) || e.maxLaps > EX.maxLaps) errors.push(`${at}: maxLaps 1~${EX.maxLaps}`);
    if (!pos(e?.recommendedTier)) errors.push(`${at}: recommendedTier`);
    if (!pos(e?.difficulty) || (e.difficulty as number) > MAX_DIFFICULTY) errors.push(`${at}: difficulty 1~${MAX_DIFFICULTY}`);
    for (const [cell, id] of Object.entries(e?.road ?? {})) {
      const n = Number(cell);
      if (!Number.isInteger(n) || n < 1 || n >= EX.loopTiles) errors.push(`${at}: road 칸 ${cell}`);
      if (!usable.has(id)) errors.push(`${at}: road 타일 ${id} 를 이 종족이 쓰지 않는다`);
    }
    if (e?.boss) {
      if (!isBossId(e.boss.id)) errors.push(`${at}: 없는 보스 ${e.boss.id}`);
      if (!Number.isInteger(e.boss.cell) || e.boss.cell < 1 || e.boss.cell >= EX.loopTiles || e.road?.[String(e.boss.cell)]) errors.push(`${at}: boss.cell 은 길 위 빈 칸`);
    }
    const d = e?.dialogue;
    if (!d || !Array.isArray(d.start) || !Array.isArray(d.end) || d.start.length === 0 || d.end.length === 0 || ![...d.start, ...d.end].every(lineOk)) errors.push(`${at}: dialogue start·end`);
    if (d?.mid && (!pos(d.mid.afterKills) || !Array.isArray(d.mid.lines) || !d.mid.lines.every(lineOk))) errors.push(`${at}: dialogue.mid`);
  });
  if (errors.length > 0) throw new Error(`스토리 데이터 오류 (${where}): ${errors.join(', ')}`);
  return c as StoryChapterContent;
}

export const STORY_CHAPTERS: readonly StoryChapterDef[] = (chaptersRaw as { chapters: StoryChapterDef[] }).chapters.map((c) => {
  if (!isGroundId(c.groundId)) throw new Error(`스토리 장 데이터 오류 (${c.id}): 없는 사냥터 ${c.groundId}`);
  return c;
});

/** 종족별 장 내용 목록. 새 종족·새 장은 파일을 만들고 한 줄 더한다 */
export const STORY_CONTENT: readonly StoryChapterContent[] = [hollowCh1, hollowCh2, hollowCh3, shinigamiCh1, shinigamiCh2, shinigamiCh3].map(parseChapterContent);

/** 이 종족의 장 내용. 아직 없으면(2·3장 자리) null = 준비 중 */
export function chapterContent(factionId: string, chapterId: string): StoryChapterContent | null {
  return STORY_CONTENT.find((c) => c.factionId === factionId && c.chapterId === chapterId) ?? null;
}

export function getChapter(chapterId: string): StoryChapterDef {
  const c = STORY_CHAPTERS.find((x) => x.id === chapterId);
  if (!c) throw new Error(`알 수 없는 장: ${chapterId}`);
  return c;
}

export function getEpisode(factionId: string, chapterId: string, episodeId: string): StoryEpisode {
  const e = chapterContent(factionId, chapterId)?.episodes.find((x) => x.id === episodeId);
  if (!e) throw new Error(`알 수 없는 화: ${factionId} ${chapterId}/${episodeId}`);
  return e;
}

/** 사냥터의 장 보스 (GDD 37장, C.86): 그 사냥터를 무대로 하는 장의 마지막 화 보스 id. 그 종족의 장 내용이 아직 없거나 마지막 화에 보스가 없으면 null.
 *  엔진은 보스 id 를 모른다 — 장 데이터가 생기면 그 사냥터에 자동으로 연결된다 */
export function groundBossId(factionId: string, groundId: string): string | null {
  for (const ch of STORY_CHAPTERS) {
    if (ch.groundId !== groundId) continue;
    const eps = chapterContent(factionId, ch.id)?.episodes ?? [];
    const boss = eps[eps.length - 1]?.boss?.id;
    if (boss) return boss;
  }
  return null;
}

/** 세이브·런 로그 키: "ch1/ep2" */
export function episodeKey(chapterId: string, episodeId: string): string {
  return `${chapterId}/${episodeId}`;
}

/** 장 첫 완료 영옥: 기본 + 그 장의 추가분 (GDD 35장: 3장 = 스킨 자리 영옥 10) */
export function chapterClearJade(chapterId: string): number {
  const SX = BALANCE.provisional.story;
  return SX.chapterJade + (SX.chapterBonusJade[chapterId] ?? 0);
}
