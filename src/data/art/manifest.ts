// 그림 매니페스트 (GDD 16-1 7번): 화면은 그림 파일을 직접 쓰지 않고 키로 참조한다.
// 지금은 모든 항목이 비어 있어 코드로 만든 자리표시 도형(CSS)이 나온다. 최종 그림을 받으면 아래 항목에 파일을 적기만 하면 된다.
//
//   교체 방법: 파일을 `public/art/` 에 넣고 해당 키의 `src`(한 장) 또는 `frames`(제자리 2프레임)에 `art/파일이름.png` 를 적는다.
//   키를 새로 만들면 종족 설정(`src/data/factions/*.json` 의 `room`)에서 그 키를 가리키면 된다. 코드 수정 불필요.
//
// 키 규칙: scene.<이름> 방 배경 / char.<이름> 캐릭터(프레임) / prop.<이름> 방 안 물건

export interface ArtEntry {
  /** 한 장짜리 그림 경로 (public/ 기준, 예 "art/scene-hollow.png"). 비우면 자리표시 도형 */
  src?: string;
  /** 제자리 2프레임 (캐릭터 숨쉬기). 2장이면 번갈아 보인다. 비우면 자리표시 도형 */
  frames?: [string, string];
}

export const ART_MANIFEST: Readonly<Record<string, ArtEntry>> = {
  'scene.cave': {},
  'scene.room': {},
  'char.hollow': {},
  'char.shinigami': {},
  'prop.door': {},
  'prop.altar': {},
  'prop.book': {},
  'prop.chest': {},
  'prop.window': {},
  'prop.care': {},
};

/** 그림 키 → 실제 이미지 URL(없으면 null = 자리표시를 쓴다). base 는 배포 경로(Vite BASE_URL) */
export function artUrls(key: string, base = '/', manifest: Readonly<Record<string, ArtEntry>> = ART_MANIFEST): { src: string | null; frames: [string, string] | null } {
  const e = manifest[key];
  const join = (p: string) => (/^(https?:|data:)/.test(p) ? p : `${base.replace(/\/$/, '')}/${p.replace(/^\//, '')}`);
  return {
    src: e?.src ? join(e.src) : null,
    frames: e?.frames ? [join(e.frames[0]), join(e.frames[1])] : null,
  };
}
