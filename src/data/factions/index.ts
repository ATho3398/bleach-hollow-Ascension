// 종족 설정 목록. C.139 (GDD 88장 14): 이 폴더의 *.json 을 빌드 때 자동으로 모은다 — 새 종족은 json 파일 하나 + 테마 CSS(theme-<theme>.css) 하나.
// 목록 순서 = 파일 이름 순(맨 앞이 시작 화면 기본 테마). 필수 필드 누락·형식 오류는 parseFactionConfig 가, 종족 id 중복은 여기서 막는다.
import { parseFactionConfig, type FactionConfig } from '../../engine/faction';

const files = import.meta.glob<{ default: unknown }>('./*.json', { eager: true });

/** 파일 모음 → 종족 목록 (파일 이름 순, id 중복 금지) */
export function collectFactions(mods: Record<string, { default: unknown }>): FactionConfig[] {
  const list = Object.keys(mods)
    .sort()
    .map((path) => {
      try {
        return parseFactionConfig(mods[path]!.default);
      } catch (e) {
        throw new Error(`종족 설정 ${path}: ${(e as Error).message}`);
      }
    });
  const seen = new Set<string>();
  for (const f of list) {
    if (seen.has(f.id)) throw new Error(`종족 id 중복: ${f.id}`);
    seen.add(f.id);
  }
  if (list.length === 0) throw new Error('종족 설정이 하나도 없다');
  return list;
}

export const FACTIONS: readonly FactionConfig[] = collectFactions(files);

export function getFaction(id: string): FactionConfig {
  const f = FACTIONS.find((x) => x.id === id);
  if (!f) throw new Error(`알 수 없는 종족: ${id}`);
  return f;
}
