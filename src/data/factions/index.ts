// 종족 설정 목록. 새 종족은 json 파일을 만들고 여기에 한 줄만 더한다.
import { parseFactionConfig, type FactionConfig } from '../../engine/faction';
import hollow from './hollow.json';
import shinigami from './shinigami.json';

export const FACTIONS: readonly FactionConfig[] = [hollow, shinigami].map(parseFactionConfig);

export function getFaction(id: string): FactionConfig {
  const f = FACTIONS.find((x) => x.id === id);
  if (!f) throw new Error(`알 수 없는 종족: ${id}`);
  return f;
}
