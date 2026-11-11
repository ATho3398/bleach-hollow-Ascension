// 게임 아이콘 이름(스프라이트 `i-*`) → 디자인 v2 도트 아이콘 이름 매핑 — 한 곳 (C.282, GDD 183장 3, PROMPT v2 4절)
// - 지금 화면의 icon('i-*') · v2Svg('i-*') 가 이 표로 v2 그림(`#v2-<이름>` 심볼)을 쓴다. 화면 코드는 고치지 않아도 새 아이콘이 나온다.
// - 새 화면 코드는 마스크 클래스 `.bha-i .bha-i-<이름>` 를 직접 써도 된다(v2Icon()). 이름 목록 = icons/v2-names.json (150개).
// - 전투 이펙트 그림(`i-fx-*`)·적 실루엣(`foe-*`)은 아이콘이 아니라서 매핑하지 않는다(옛 그림 그대로).
// - PROVISIONAL 은 v2 에 짝이 없어 가장 비슷한 것으로 임시 매핑한 것 — 어색하면 디자인 세션에 새 아이콘을 요청한다(확정 아님).
import V2_NAMES from './icons/v2-names.json';

export const V2_ICON_NAMES: readonly string[] = V2_NAMES;

/** 게임 i-* → v2 이름. 표에 없는 i-* 는 옛 스프라이트를 그대로 쓴다 */
export const V2_ICON: Readonly<Record<string, string>> = {
  // 블록·전투
  'i-attack': 'attack',
  'i-guard': 'shield',
  'i-heal': 'heal',
  'i-basic': 'sword', // 임시
  'i-special': 'star', // 임시 (해방·콤보)
  'i-void': 'blob', // 공허 블록 — 짝 없음, 임시
  'i-stored': 'box', // 임시
  'i-chain-1': 'stack', // 임시
  'i-chain-2': 'stack', // 임시
  'i-chain-3': 'stack', // 임시
  'i-sp': 'spirit',
  'i-seal': 'lock',
  'i-weak': 'target', // 임시 (약점)
  'i-cast': 'warning', // 임시 (강공격 예고)
  'i-pattern-fast': 'wing', // 임시
  'i-pattern-tough': 'armor', // 임시
  'i-pattern-heavy': 'fist', // 임시
  // 'i-timer' · 'i-settings' 는 옛 스프라이트(초시계·톱니바퀴, C.281 그림)로 되돌렸다 — GDD 241-A 5 (C.282 v2 모래시계·도트 톱니 롤백)
  'i-release': 'release',
  'i-target': 'target',
  'i-speed': 'wing', // 임시
  // 돌보기·상태
  'i-hunger': 'food',
  'i-cond': 'bolt',
  'i-stab': 'spirit', // 임시 (수련치 막대 — 영압 안정도는 C.391 삭제)
  'i-risk': 'madness', // 임시 (광기/호로화 — 종족 구분 없이 한 그림)
  'i-care-feed': 'food',
  'i-care-sleep': 'sleep',
  'i-care-pet': 'care',
  'i-evolve': 'rebirth', // 임시 (진화·환생 버튼)
  // 장소·시스템
  'i-dex': 'codex',
  'i-title': 'medal', // 임시
  'i-frame': 'fullscreen',
  'i-shelf': 'bookshelf',
  'i-help': 'help',
  'i-pause': 'pause',
  'i-play': 'play',
  'i-return': 'return',
  'i-nest': 'nest',
  'i-quit': 'flag',
  'i-practice': 'dummy',
  'i-swap-species': 'swap',
  'i-deck': 'tile',
  'i-slot': 'slot',
  'i-absorb': 'fang', // 임시 (흡수)
  // 타일
  'i-tile-prey': 'fang',
  'i-tile-elite': 'crown',
  'i-tile-env': 'cloud',
  'i-cloud': 'cloud', // 클라우드 세이브 로그인 버튼 (C.323)
  'i-key': 'key', // 이메일 로그인 버튼 (C.323)
  'i-tile-rest': 'campfire',
  'i-tile-combo': 'branch', // 임시
  // 계열
  'i-lin-a': 'lin-a',
  'i-lin-b': 'lin-b',
  'i-lin-c': 'lin-c',
  'i-lin-d': 'lin-d',
  'i-lin-e': 'lin-e',
  // 일반
  'i-rare': 'gem', // 임시 (희귀·보상)
  'i-lock': 'lock',
  'i-unknown': 'help', // 임시 (모름 = 물음표)
  'i-plus': 'plus',
  'i-minus': 'minus',
  'i-close': 'close',
  'i-check': 'check',
  'i-warn': 'warning',
  'i-info': 'info',
  'i-chevron-right': 'right',
  'i-chevron-down': 'down',
  'i-chevron-left': 'left',
  'i-swap': 'swap',
  'i-more': 'more',
  'i-grip': 'list', // 임시 (재료 손잡이)
  'i-loop': 'loop',
  'i-flag-win': 'trophy', // 임시 (승리)
  'i-broken': 'skull', // 임시 (패배·깨짐)
};

/** v2 에 짝이 없어 임시로 고른 것 (GDD 183장 3 목록 + 매핑하며 애매했던 것) — 보고·나중 교체용 */
export const V2_ICON_PROVISIONAL: readonly string[] = [
  'i-basic', 'i-special', 'i-void', 'i-stored', 'i-chain-1', 'i-chain-2', 'i-chain-3', 'i-weak', 'i-cast',
  'i-pattern-fast', 'i-pattern-tough', 'i-pattern-heavy', 'i-speed', 'i-stab', 'i-risk', 'i-evolve', 'i-title',
  'i-absorb', 'i-tile-combo', 'i-rare', 'i-unknown', 'i-grip', 'i-flag-win', 'i-broken',
];

/** 스프라이트 심볼 id: 매핑이 있으면 v2 심볼(`v2-<이름>`), 없으면(i-fx-*, foe-* 등) 원래 id */
export function spriteSymbol(id: string): string {
  const v2 = V2_ICON[id];
  return v2 ? `v2-${v2}` : id;
}

/** `<use>` 에 v2 심볼을 걸 때 원래 게임 이름을 data-i 로 남긴다 (C.302: 전투 화면은 옛 그림으로 되돌린다) */
export function setSpriteHref(use: Element, id: string): void {
  const sym = spriteSymbol(id);
  use.setAttribute('href', `#${sym}`);
  if (sym !== id) use.setAttribute('data-i', id);
}

/** C.302 (GDD 190장 2): 이 요소 안의 아이콘을 옛 스프라이트(C.281 그림)로 — 지금 있는 것 + 나중에 붙는 것. 전투 화면 전용. 해제 함수를 돌려준다 */
export function keepOldIcons(scope: HTMLElement): () => void {
  const fix = (n: ParentNode): void => {
    for (const u of n.querySelectorAll('use[data-i]')) {
      const id = u.getAttribute('data-i')!;
      if (u.getAttribute('href') !== `#${id}`) u.setAttribute('href', `#${id}`);
    }
  };
  fix(scope);
  if (typeof MutationObserver === 'undefined') return () => {};
  const mo = new MutationObserver((list) => {
    for (const m of list) {
      for (const a of m.addedNodes) {
        if (a.nodeType !== 1) continue;
        const e = a as Element;
        if (e.matches('use[data-i]')) fix(e.parentNode ?? e);
        else if (e.firstElementChild) fix(e);
      }
    }
  });
  mo.observe(scope, { childList: true, subtree: true });
  return () => mo.disconnect();
}

/** 새 화면용 마스크 아이콘 `<i class="bha-i bha-i-<이름>">` — 이름은 v2 이름 또는 게임 i-* 이름 */
export function v2Icon(name: string, size?: 'sm' | 'lg' | 'xl', cls = ''): HTMLElement {
  const n = V2_ICON[name] ?? name;
  const e = document.createElement('i');
  e.className = ['bha-i', `bha-i-${n}`, size ? `bha-i--${size}` : '', cls].filter(Boolean).join(' ');
  e.setAttribute('aria-hidden', 'true');
  return e;
}
