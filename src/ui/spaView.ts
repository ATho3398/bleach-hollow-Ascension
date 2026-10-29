// 온천 화면 (GDD 123장 4, C.198): 장터(C.201, GDD 127장 2) 안 [온천]으로 들어오는 따로 된 공간. 들어와 있는 동안 1분에 체력 +10%·배부름 −10 (앱을 꺼도 유지),
// 체력 상한(빈사면 10%)이나 배부름 0 이면 저절로 방으로. 뒤로·[방으로 돌아가기] = 나오기.
// C.201 (GDD 128장 6): 화면 전체가 온천 장면, 캐릭터가 걸어 들어와 탕에 앉는다, [방으로 돌아가기]·ⓘ(쉬는 중 설명) = 왼쪽 위 작게, 체력·배부름 = 방처럼 머리 위 상태 창.
// 배경 그림 키 scene.spa·온천 모션은 사용자 그림 대기 — 없으면 임시 배경(탕 도형)과 CSS 임시 연출(몸 아래쪽을 물이 가림). 이름은 종족 설정 market.props.spa.
import { BALANCE } from '../config/balance';
import { artUrls } from '../data/art/manifest';
import type { FactionConfig } from '../engine/faction';
import { fullnessOfNest, previewHomeHp, type SpaEnd } from '../engine/nest';
import { artSkinOf, type SaveData } from '../game';
import { homeMaxHp } from '../home';
import { hpNumbers } from './bha/battle';
import { button, el, icon, mountApp } from './bha/dom';
import { infoTip } from './bha/infoTip';
import { characterButton, roomCharArt } from './bha/room';
import { marketOf, roomOf } from '../engine/faction';

const BASE = import.meta.env.BASE_URL;
/** 막대 다시 그리기·저절로 나오기 확인 간격 */
const SPA_TICK_MS = 1000;
/** 걸어 들어오는 시간 (spa.css bha-spa-walkin 과 맞출 것) */
const SPA_WALK_MS = 2200;
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
  const name = marketOf(faction).props.spa;
  const SP = BALANCE.provisional.nest.homeHp.spa;
  const n = save.nest;
  const maxHp = homeMaxHp(save);

  // ── 장면 = 화면 전체 (GDD 128장 6): 배경 그림(scene.spa)이 없으면 임시 탕 + 김 ──
  const scene = el('div', 'bha-spa__scene');
  const bg = artUrls('scene.spa', BASE).src;
  if (bg) {
    const img = el('img', 'bha-spa__bg') as HTMLImageElement;
    img.src = bg;
    img.alt = '';
    scene.append(img);
    scene.classList.add('has-art');
  }
  // 캐릭터 + 머리 위 상태 창: 오른쪽에서 걸어 들어와(그림은 왼쪽을 본다) 탕 안에 들어가 앉는다 — 온천 모션 그림은 사용자 대기, 지금은 CSS 임시 연출
  const art = roomCharArt(room, faction.id, save.evolution.tierIndex, artSkinOf(save));
  const char = characterButton(art, '캐릭터');
  char.disabled = true; // 보기만 (기기 선택 대상 아님)
  char.setAttribute('aria-hidden', 'true'); // 걸어 들어오는 장식 — 조작 요소가 아니다 (상태는 머리 위 상태 창이 읽힌다)
  char.classList.add('bha-spa__char');
  if (n.collapsed) char.classList.add('is-collapsed');
  const status = el('div', 'bha-room__status bha-spa__status');
  status.setAttribute('role', 'status');
  const actor = el('div', 'bha-spa__actor is-entering');
  actor.append(status, char);
  scene.append(el('div', 'bha-spa__water'), actor, el('div', 'bha-spa__front'), el('div', 'bha-spa__steam'));
  const seat = () => actor.classList.replace('is-entering', 'is-seated');
  actor.addEventListener('animationend', (e) => { if ((e as AnimationEvent).animationName === 'bha-spa-walkin') seat(); });
  window.setTimeout(seat, SPA_WALK_MS + 400); // 연출이 꺼진 환경 안전 장치

  // 머리 위 상태 창 (방 상태 칩과 같은 모양): 체력 '현재 / 최대' · 배부름
  const gauge = (kind: string, ic: string, pct: number, text: string, danger: boolean) => {
    const row = el('span', `bha-room__gauge bha-room__gauge--${kind}${danger ? ' is-danger' : ''}`);
    const fill = el('span', 'bha-room__gaugefill');
    fill.style.width = `${Math.max(0, Math.min(100, pct))}%`;
    const track = el('span', 'bha-room__gaugetrack');
    track.append(fill);
    row.append(icon(ic), track, el('span', 'bha-room__gaugenum bha-num', text));
    return row;
  };
  const paint = (fraction: number, fullness: number) => {
    const { now, max } = hpNumbers(fraction * maxHp, maxHp);
    status.setAttribute('aria-label', `체력 ${now} / ${max}, ${faction.fullnessName} ${Math.round(fullness)}`);
    status.replaceChildren(
      gauge('hp', 'i-heal', fraction * 100, `${now} / ${max}`, fraction < 0.3),
      gauge('hunger', 'i-hunger', fullness, String(Math.round(fullness)), fullness <= 20),
    );
  };
  paint(previewHomeHp(n, Date.now()).fraction, fullnessOfNest(n));

  // ── 왼쪽 위: [방으로 돌아가기] 작게 + ⓘ 쉬는 중 설명 ──
  const backBtn = button({ label: '방으로 돌아가기', icon: 'i-return', size: 'small', onClick: hd.onBack });
  const dyingPct = Math.round(BALANCE.provisional.nest.care.dying.hpFraction * 100);
  const infoBtn = infoTip('쉬는 중', () => ({
    lead: `${name}에서 쉬는 중이다.`,
    groups: [
      { title: '쉬는 동안', lines: [`1분에 체력 +${Math.round(SP.hpPerMinute * 100)}%, ${faction.fullnessName} −${SP.fullnessPerMinute}`, '앱을 꺼도 계속 쉰다'] },
      { title: '저절로 나올 때', lines: [`체력이 다 차거나 ${faction.fullnessName}이 0 이 되면 방으로 돌아간다`] },
      ...(n.collapsed ? [{ title: '빈사', lines: [`체력은 ${dyingPct}% 까지만 찬다`, '치료제로 풀어야 더 찬다'] }] : []),
    ],
  }));
  const hud = el('div', 'bha-spa__hud');
  hud.append(backBtn, infoBtn, el('span', 'bha-spa__name', name));
  scene.append(hud);

  const app = mountApp(root, { cls: 'bha-spa' }, scene);
  backBtn.focus({ preventScroll: true });

  // 시간이 흐르는 동안 상태 창을 다시 그리고, 저절로 나올 때가 되면 부르는 쪽에 알린다 (한 번만)
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
