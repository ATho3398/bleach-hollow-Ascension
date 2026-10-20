// 꾸밈 착용 표시 (GDD 25-9, C.60): 지금 트랙이 입은 꾸밈을 문서 루트에 data-cos-<분류>="<모양 키>" + 색 변수 --cos-<분류>[-부분] 로 건다.
// 모양은 cosmetics.css 가 내 캐릭터(방 .bha-char · 걷기 .bha-walker · 전투 .bha-hero)·블록 바·기기·이름표에 그린다. 색은 디자인 토큰(--bha-cos-*)을 참조만 한다.
import { getCosmetic, cosmeticToken, WEAR_CATEGORIES, type WearCategory } from '../../data/shop';
import type { WearState } from '../../game';

/** 분류마다 쓰는 토큰 부분 ('' = 토큰 하나) */
export const COSMETIC_PARTS: Readonly<Record<WearCategory, readonly string[]>> = {
  aura: [''], tint: [''], trail: [''], fx: ['', 'edge'], bar: ['bg', 'line'], shell: ['body', 'line', 'lcd'], plate: [''],
  enter: [''], evo: [''], absorb: [''], cut: ['bg', 'line'], win: [''], talk: [''], room: ['bg', 'wall', 'floor', 'line'], frame: [''],
};

const dataKey = (c: WearCategory): string => `cos${c[0]!.toUpperCase()}${c.slice(1)}`;
const varName = (c: WearCategory, part: string): string => `--cos-${c}${part ? `-${part}` : ''}`;

/** 루트에 꾸밈을 건다 (null = 모두 벗김: 시작 화면 등). 같은 값이면 그대로 */
export function applyCosmetics(wear: WearState | null | undefined, root: HTMLElement = document.documentElement): void {
  for (const c of WEAR_CATEGORIES) {
    const item = wear ? getCosmetic(wear[c]) : undefined;
    if (item && item.category === c) {
      root.dataset[dataKey(c)] = item.look;
      for (const part of COSMETIC_PARTS[c]) root.style.setProperty(varName(c, part), `var(${cosmeticToken(item, part)})`);
    } else {
      delete root.dataset[dataKey(c)];
      for (const part of COSMETIC_PARTS[c]) root.style.removeProperty(varName(c, part));
    }
  }
}
