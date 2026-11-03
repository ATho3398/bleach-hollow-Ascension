// pixelfx 이펙트 실험실 (C.249, 개발 전용 — `npm run dev` 에서 `?fxlab`). 배포 빌드에는 들어가지 않는다 (main.ts 의 import.meta.env.DEV 가드).
// `npm run fx` 로 public/fx/ 에 가져온 시트를 게임 그림(배경·캐릭터) 위에 실제 재생기(playPixelFx)로 돌려 본다.
// 전투 연출에 붙이는 일은 하지 않는다 — 어디에 쓸지는 기획서에서 정한 뒤.
import { loadPixelFx, loadPixelFxIndex, playPixelFx, sheetDurationMs, type PixelFxPlay, type PixelFxSheet } from './pixelFx';

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', text = ''): HTMLElementTagNameMap[K] {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text) n.textContent = text;
  return n;
}

export async function mountFxLab(host: HTMLElement): Promise<void> {
  host.style.cssText = 'position:fixed;inset:0;overflow:auto;background:var(--bha-bg-0);color:var(--bha-text-1);font-family:var(--bha-font-body)';
  const wrap = el('div');
  wrap.style.cssText = 'display:flex;flex-direction:column;gap:var(--bha-sp-3);padding:var(--bha-sp-4)';
  host.append(wrap);
  const ix = await loadPixelFxIndex();
  const head = el('div', 'bha-sec', `pixelfx 실험실 · ${ix.pixelfx.version} (${ix.pixelfx.commit.slice(0, 7)}) · ${ix.effects.length}개`);
  head.dataset.fxlab = 'head';
  wrap.append(head);
  if (!ix.effects.length) {
    wrap.append(el('div', 'bha-sm', '가져온 이펙트가 없습니다. 터미널에서 npm run fx'));
    return;
  }
  for (const e of ix.effects) {
    const s = await loadPixelFx(e.name);
    wrap.append(s ? card(s) : el('div', 'bha-sm', `${e.name}: 시트를 못 읽음`));
  }
}

/** 이펙트 하나: 게임 배경 위 캐릭터 둘(왼쪽이 치고 오른쪽이 맞는다), 맞는 쪽 가슴에 재생 */
function card(s: PixelFxSheet): HTMLElement {
  const box = el('div');
  box.dataset.fxlab = s.name;
  box.style.cssText = 'display:flex;flex-direction:column;gap:var(--bha-sp-2)';
  const ms = sheetDurationMs(s);
  const title = el('div', 'bha-sm bha-b', `${s.name}  ·  ${s.id}  ·  ${s.frame[0]}×${s.frame[1]} · ${s.frames}장 · ${ms}ms · ${s.loop ? '반복' : '한 번'}`);

  const stage = el('div');
  stage.dataset.stage = '';
  stage.style.cssText =
    'position:relative;width:480px;max-width:100%;height:220px;overflow:hidden;border-radius:var(--bha-r-md);' +
    'background:url("art/bg-seireitei-sky.webp") center top/cover, var(--bha-bg-2)';
  const ground = el('div');
  ground.style.cssText = 'position:absolute;left:0;right:0;bottom:0;height:70px;background:url("art/bg-seireitei-ground.webp") center/cover';
  const me = el('img');
  me.src = 'art/char-shinigami.png';
  me.style.cssText = 'position:absolute;left:70px;bottom:30px;width:150px;image-rendering:pixelated';
  const foe = el('img');
  foe.src = 'art/char-hollow.png';
  foe.style.cssText = 'position:absolute;left:270px;bottom:30px;width:150px;image-rendering:pixelated;transform:scaleX(-1)';
  stage.append(ground, me, foe);

  const status = el('div', 'bha-xs', '');
  status.dataset.status = '';
  let scale = 2;
  let cur: PixelFxPlay | null = null;
  let plays = 0;
  let ends = 0;
  // 캐릭터가 하는 동작(melee·moves — 기준점 = 발)은 치는 쪽 발에, 나머지는 맞는 쪽 가슴에
  const atFeet = /^(melee|moves)\//.test(s.id);
  const play = (): void => {
    cur?.stop();
    plays++;
    cur = playPixelFx(stage, s, {
      x: atFeet ? 150 : 330,
      y: atFeet ? 188 : 165,
      scale,
      onEnd: () => {
        ends++;
        status.textContent = `재생 ${plays} · 끝남 ${ends}`;
      },
    });
    status.textContent = `재생 ${plays} · 끝남 ${ends}`;
  };
  const btns = el('div');
  btns.style.cssText = 'display:flex;gap:var(--bha-sp-2);align-items:center';
  const again = el('button', 'bha-btn', '다시 재생');
  again.dataset.act = 'play';
  again.onclick = play;
  btns.append(again);
  for (const k of [1, 2, 3]) {
    const b = el('button', 'bha-btn', `×${k}`);
    b.onclick = () => {
      scale = k;
      play();
    };
    btns.append(b);
  }
  btns.append(status);
  box.append(title, stage, btns);
  // 한 번 재생 시트는 0.8초 쉬고 다시 — 계속 보며 비교할 수 있게
  if (!s.loop) setInterval(() => (cur?.done ?? true) && play(), ms + 800);
  queueMicrotask(play);
  return box;
}
