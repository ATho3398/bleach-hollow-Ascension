// 그림 파일 조회 (GDD 17-6): `public/art/` 안 파일 목록은 빌드 시 vite.config.ts 가 수집해 `__ART_FILES__` 로 넣어 준다.
// 화면은 이 목록에 있는 파일만 요청하므로 런타임 404 요청이 없고 오프라인에서도 같다. 순수 함수만 두어 테스트로 확인한다.
//
// 폴더 안 프레임(GDD 26장)은 `폴더/동작-번호.png` 이름으로 같은 목록에 들어 있다(anim.ts).
//
// 파일명 규칙: 키의 마침표를 하이픈으로 바꾼 뒤 .webp 또는 .png (둘 다 있으면 webp)
//   enemy.<적id> → enemy-<적id>.png / char.<종족>.<단계번호> → char-<종족>-<단계번호>.png / scene.* · prop.* 도 같다

declare const __ART_FILES__: readonly string[] | undefined;
declare const __ART_ANIMS__: Readonly<Record<string, unknown>> | undefined;

/** 지금 빌드에 들어 있는 `public/art/` 파일 이름 목록 (폴더가 없으면 빈 목록) */
export const ART_FILES: readonly string[] = typeof __ART_FILES__ !== 'undefined' ? __ART_FILES__ : [];

/** 프레임 애니 폴더(`public/art/<그림 키>/`)의 선택 파일 anim.json 내용 — 폴더 이름 → 값 (GDD 26-4). 모양 검사는 anim.ts 가 한다 */
export const ART_ANIMS: Readonly<Record<string, unknown>> = typeof __ART_ANIMS__ !== 'undefined' ? __ART_ANIMS__ : {};

/** 인식하는 확장자, 앞쪽이 우선 */
export const ART_EXTS = ['webp', 'png'] as const;

/** 그림 키 → 파일 이름 기본형(확장자 없음) */
export function artStem(key: string): string {
  return key.replace(/\./g, '-');
}

/** 키에 맞는 파일을 목록에서 찾는다. 있으면 `art/파일이름`(public 기준), 없으면 null */
export function findArtFile(key: string, files: readonly string[] = ART_FILES): string | null {
  const stem = artStem(key);
  for (const ext of ART_EXTS) {
    const name = `${stem}.${ext}`;
    if (files.includes(name)) return `art/${name}`;
  }
  return null;
}

/** 적 그림 키 */
export function enemyArtKey(enemyId: string): string {
  return `enemy.${enemyId}`;
}

/** 캐릭터 그림 키를 우선순위대로: 단계별(1부터) → 종족 공통. 종족 id 는 키 조립에만 쓴다 */
export function charArtKeys(factionId: string, tierIndex: number): string[] {
  return [`char.${factionId}.${tierIndex + 1}`, `char.${factionId}`];
}

/** 필요한 파일 이름 목록(확장자 .png 기준) — `npm run art:list` 와 문서가 쓴다 */
export function artFileName(key: string): string {
  return `${artStem(key)}.png`;
}
