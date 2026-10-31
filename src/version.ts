// 버전 표시: 지금 플레이 중인 버전

import { BALANCE_VERSION } from './config/balance';

/** 패치 이름 = docs/dev-log.md 의 최신 소절 번호. 패치마다 갱신한다 (CLAUDE.md) */
export const PATCH_LABEL = 'C.241';
/** 단계 번호 = 기획서(docs/GDD.md) 13장 로드맵 표의 단계. PATCH_LABEL 과 같이 패치마다 갱신한다 */
export const STAGE_LABEL = 'S-23';

// 빌드 시점에 vite.config.ts 의 define 으로 채운다. 없으면(테스트 등) dev
declare const __BUILD_COMMIT__: string | undefined;
declare const __BUILD_DATE__: string | undefined;

export const BUILD_COMMIT: string = typeof __BUILD_COMMIT__ === 'string' ? __BUILD_COMMIT__ : 'dev';
export const BUILD_DATE: string = typeof __BUILD_DATE__ === 'string' ? __BUILD_DATE__ : 'dev';

/** 예: "0단계 · 버전 C.0 · 밸런스 1 · 2026-10-18 배포 (커밋 abc1234)" */
export function versionLabel(
  b: { patch?: string; stage?: string; commit?: string; date?: string } = {},
): string {
  const patch = b.patch ?? PATCH_LABEL;
  const stage = b.stage ?? STAGE_LABEL;
  const commit = b.commit ?? BUILD_COMMIT;
  const date = b.date ?? BUILD_DATE;
  const built = date === 'dev' ? 'dev 빌드' : `${date} 배포`;
  return `${stage} · 버전 ${patch} · 밸런스 ${BALANCE_VERSION} · ${built} (커밋 ${commit})`;
}
