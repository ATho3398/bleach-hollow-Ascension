// 온천 화면 (GDD 123장 4, C.198): 방 물건 [온천]으로 들어오는 따로 된 공간. 들어와 있는 동안 1분에 체력 +10%·배부름 −10 (앱을 꺼도 유지),
// 체력 상한(빈사면 10%)이나 배부름 0 이면 저절로 방으로. 뒤로·[방으로 돌아가기] = 나오기.
// 배경 그림 키 scene.spa·온천 모션은 사용자 그림 대기 — 없으면 임시 배경(탕 도형)과 앉은 임시 연출(몸 아래쪽을 물이 가림). 이름은 종족 설정 room.props.spa.
import { BALANCE } from '../config/balance';
import { artUrls } from '../data/art/manifest';
import type { FactionConfig } from '../engine/faction';
import { fullnessOfNest, previewHomeHp, type SpaEnd } from '../engine/nest';
import { artSkinOf, type SaveData } from '../game';
import { homeMaxHp } from '../home';
import { hpNumbers } from './bha/battle';
import { button, el, meter, notice } from './bha/dom';
import { lcdHead, lcdPage } from './bha/lcdpage';
import { characterButton, roomCharArt } from './bha/room';
import { locoOf } from './bha/loco';
import { roomOf } from '../engine/faction';

const BASE = import.meta.env.BASE_URL;
/** 막대 다시 그리기·저절로 나오기 확인 간격 */
const SPA_TICK_MS = 1000;
let spaTimer = 0;

export interface SpaHandlers {
  /** [방으로 돌아가기] — 뒤로와 같다(나오기는 화면 스택 beforeBack 이 한다) */
  onBack: () => void;
  /** 시간이 흘러 저절로 나올 때가 됐다 (체력 상한·배부름 0): 부르는 쪽이 tickIdle 로 실제 반영·기록하고 방으로 */
  onAutoLeave: (e: SpaEnd) => void;
}

/** 온천에서 나온 까닭 한 줄 (알림 띠·튜토리얼이 같이 쓴다) */
export function spaEndText(e: Pick<SpaEnd, 'reason' | 'hpTo'>, fullnessName: string): string {
  if (e.reason === 'full') return `체력이 다 찼다 (${Math.round(e.hpTo * 100)}%). 방으로 돌아왔다.`;
  if (e.reason === 'hungry') return `${fullnessName}이 바닥나 방으로 돌아왔다.`;
  return '방으로 돌아왔다.';
}

export function spaView(root: HTMLElement, faction: FactionConfig, save: SaveData, hd: SpaHandlers): void {
  const room = roomOf(faction, save.wear.talk);
  const name = room.props.spa;
  const SP = BALANCE.provisional.nest.homeHp.spa;
  const n = save.nest;
  const maxHp = homeMaxHp(save);

  // ── 장면: 배경 그림(scene.spa)이 없으면 임시 탕 + 김. 캐릭터는 탕에 앉은 모습(아래쪽을 물이 가린다) ──
  const scene = el('div', 'bha-spa__scene');
  const bg = artUrls('scene.spa', BASE).src;
  if (bg) {
    const img = el('img', 'bha-spa__bg') as HTMLImageElement;
    img.src = bg;
    img.alt = '';
    scene.append(img);
    scene.classList.add('has-art');
  }
  const art = roomCharArt(room, faction.id, save.evolution.tierIndex, artSkinOf(save));
  const char = characterButton(art, '캐릭터', locoOf(faction, save.evolution.formId, art));
  char.disabled = true; // 보기만 (기기 선택 대상 아님)
  char.classList.add('bha-spa__char');
  if (n.collapsed) char.classList.add('is-collapsed');
  // 온천 즐기는 모션은 사용자 그림 대기 (GDD 123장 4) — 지금은 CSS 임시 연출(.bha-spa__char: 살짝 가라앉아 천천히 들썩임)
  scene.append(char, el('div', 'bha-spa__water'), el('div', 'bha-spa__steam'));

  // ── 오른쪽: 체력·배부름 막대 + 안내 ──
  const bars = el('div', 'bha-spa__bars');
  const paint = (fraction: number, fullness: number) => {
    const { now, max } = hpNumbers(fraction * maxHp, maxHp);
    bars.replaceChildren(
      meter({ kind: 'player', label: '체력', icon: 'i-heal', value: now, max, zoneLow: 0.3, danger: fraction < 0.3, valueText: `${now} / ${max}` }),
      meter({ kind: 'hunger', label: faction.fullnessName, icon: 'i-hunger', value: Math.round(fullness), max: 100, danger: fullness <= 20 }),
    );
  };
  paint(previewHomeHp(n, Date.now()).fraction, fullnessOfNest(n));
  const info = notice('info', `${name}에 있는 동안 1분에 체력 +${Math.round(SP.hpPerMinute * 100)}%, ${faction.fullnessName} −${SP.fullnessPerMinute}. 앱을 꺼도 계속 쉰다. 체력이 다 차거나 ${faction.fullnessName}이 0 이 되면 저절로 방으로 돌아간다.`, { title: '쉬는 중', icon: 'i-tile-rest' });
  const dying = n.collapsed ? notice('danger', `빈사 — 체력은 ${Math.round(BALANCE.provisional.nest.care.dying.hpFraction * 100)}% 까지만 찬다. 치료제로 풀어야 더 찬다.`, { title: '빈사', icon: 'i-broken' }) : null;
  const backBtn = button({ label: '방으로 돌아가기', icon: 'i-return', variant: 'primary', onClick: hd.onBack });
  const right = [bars, info, ...(dying ? [dying] : []), backBtn];
  const { app } = lcdPage(root, { cls: 'bha-spa', cols: 'minmax(0, 1.3fr) minmax(0, 1fr)' }, lcdHead({ title: name, sub: `체력 +${Math.round(SP.hpPerMinute * 100)}%/분 · ${faction.fullnessName} −${SP.fullnessPerMinute}/분` }), [scene], right);
  backBtn.focus({ preventScroll: true });

  // 시간이 흐르는 동안 막대를 다시 그리고, 저절로 나올 때가 되면 부르는 쪽에 알린다 (한 번만)
  window.clearInterval(spaTimer);
  let done = false;
  const tick = spaTimer = window.setInterval(() => {
    if (!app.isConnected || done) return window.clearInterval(tick);
    const p = previewHomeHp(n, Date.now());
    paint(p.fraction, p.fullness);
    if (p.spaEnded || !n.spa) {
      done = true;
      window.clearInterval(tick);
      // 앱의 1분 시계(tickIdle)가 먼저 나오게 했으면 미리 보기 결과가 없다 — 지금 값으로 까닭만 채운다
      const now = Date.now();
      hd.onAutoLeave(p.spaEnded ?? { at: now, minutes: 0, hpFrom: p.fraction, hpTo: p.fraction, fullnessFrom: p.fullness, fullnessTo: p.fullness, reason: p.fullness <= 1e-9 ? 'hungry' : 'full' });
    }
  }, SPA_TICK_MS);
}
