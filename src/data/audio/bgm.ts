// 배경 음악 파일 조회 (GDD 24-4, 그림 파일 규칙 17-6 과 같은 방식): `public/audio/bgm/` 안 파일 목록은 빌드 시 vite.config.ts 가 모아
// `__BGM_FILES__` 로 넣어 준다. 목록에 있는 파일만 요청하므로 파일이 없으면 무음이고 오류·404 요청이 없다. 음원은 사용자가 나중에 넣는다.
//
// 파일명 규칙: <트랙 키>.mp3 또는 <트랙 키>.ogg (둘 다 있으면 mp3)

declare const __BGM_FILES__: readonly string[] | undefined;

/** 트랙 키 (GDD 24-4): 둥지·원정 걷기·일반 전투·강적·보스·등급전·스토리 대화 */
export const BGM_TRACKS = ['nest', 'expedition', 'battle', 'elite', 'boss', 'rank', 'story'] as const;
export type BgmTrack = (typeof BGM_TRACKS)[number];

/** 지금 빌드에 들어 있는 `public/audio/bgm/` 파일 이름 목록 (폴더가 없으면 빈 목록) */
export const BGM_FILES: readonly string[] = typeof __BGM_FILES__ !== 'undefined' ? __BGM_FILES__ : [];

/** 인식하는 확장자, 앞쪽이 우선 */
export const BGM_EXTS = ['mp3', 'ogg'] as const;

/** 트랙 키에 맞는 파일 (`audio/bgm/파일이름`, public 기준). 없으면 null = 무음 */
export function findBgmFile(track: BgmTrack, files: readonly string[] = BGM_FILES): string | null {
  for (const ext of BGM_EXTS) {
    const name = `${track}.${ext}`;
    if (files.includes(name)) return `audio/bgm/${name}`;
  }
  return null;
}
