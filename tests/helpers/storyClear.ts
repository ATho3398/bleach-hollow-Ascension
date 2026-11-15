// 스토리 전부 클리어 표시 (GDD 243장 1): 붕옥 등장·두 번째 트랙 개방 조건을 테스트에서 채운다
import { STORY_CHAPTERS } from '../../src/data/story';
import { newStoryProgress, type SaveData } from '../../src/game';

export function clearStory(s: Pick<SaveData, 'story' | 'factionId'>, factionId: string = s.factionId): void {
  const p = (s.story[factionId] ??= newStoryProgress());
  p.chapters = STORY_CHAPTERS.map((c) => c.id);
}
