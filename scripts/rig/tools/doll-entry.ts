import { DRAFT_RIGS } from '../draft';
import { createPaperdoll } from '../../../src/ui/bha/paperdoll';
import { createFlame, dollLayers } from '../flame';
declare const ART_MAP: Record<string, string>;
const stage = document.getElementById('stage')!;
const LOOKS: [string, string][] = [
  ...['shinigami-base', 'shinigami-base-f', 'shinigami-student', 'shinigami-student-f', 'shinigami-soul-f', 'shinigami-soul', 'arrancar-base', 'arrancar-base-f', 'bare-base', 'female-base', 'brute-base', 'onearm-base', 'spiky-base', 'speed-base', 'auto-test', 'gillian-base', 'cape-test'].map((l) => ['humanoid', l] as [string, string]),
  ['beast', 'beast-base'],
  ['serpent', 'serpent-base'],
  ['spider', 'spider-base'],
  ['wraith', 'wraith-base'],
  ['aizen', 'aizen-parts'],
  ['ichigo', 'ichigo-bloody'],
  ['mugetsu', 'ichigo-mugetsu'],
];
// 주소 뒤 #look=<외형> 이면 그 외형 하나만 크게(캡처·확인용)
const hp = new URLSearchParams(location.hash.slice(1));
const only = hp.get('look');
/** 같은 몸의 색 외형(GDD 115-A 85) — 둘 이상이면 그 칸 아래에 색 고르기 */
const colorsOf = (rid: string, look: string) => {
  const r = DRAFT_RIGS[rid]!.rig;
  const body = r.looks[look]?.body;
  const list = Object.entries(r.looks).filter(([, l]) => l.body === body && typeof l.color === 'string');
  return list.length > 1 ? list : [];
};
const mk = (rid: string, look: string) => {
  const d0 = DRAFT_RIGS[rid]!;
  const d = createPaperdoll({ rig: d0.rig, motions: d0.motions, motionSets: d0.sets, look, scale: only ? 4 : 3, base: '', autoplay: !hp.get('manual') });
  d.el.querySelectorAll('img').forEach((im) => { const k = im.getAttribute('src')!; if (ART_MAP[k]) im.src = ART_MAP[k]; });
  // 불꽃 층(GDD 115-A 135): 그 외형일 때만. 스스로 돌 때는 따로 rAF, 손으로 돌릴 때(캡처)는 advance 에 맞춰 흘린다
  if (d0.flame && d0.flame.look === look) {
    const k = only ? 4 : 3;
    const fl = createFlame(d0.flame, d0.rig.canvas);
    fl.place(k);
    d.el.append(fl.back, fl.front);
    const adv = d.advance.bind(d);
    d.advance = (dt: number) => { adv(dt); fl.step(dt, dollLayers(d.el, k)); };
    // 새 동작이 시작되면 그 전 불은 빨리 꺼뜨린다
    const play = d.play.bind(d), setLoop = d.setLoop.bind(d);
    d.play = (id, o) => { fl.quench(); return play(id, o); };
    let cur: string | null = null;
    d.setLoop = (id) => { if (id !== cur) fl.quench(); cur = id; setLoop(id); };
    if (!hp.get('manual')) {
      let last = 0;
      const tick = (now: number) => { if (d.el.isConnected || !last) { if (last) fl.step(now - last, dollLayers(d.el, k)); last = now; requestAnimationFrame(tick); } };
      requestAnimationFrame(tick);
    }
  }
  return d;
};
const dolls = LOOKS.filter(([rid, l]) => !only || l === only || colorsOf(rid, l).some(([id]) => id === only)).map(([rid, look0], i) => {
  const cs = colorsOf(rid, look0);
  let d = mk(rid, only && cs.some(([id]) => id === only) ? only : look0);
  const cell = document.createElement('div'); cell.className = 'cell'; cell.append(d.el); stage.append(cell);
  if (cs.length) {
    const sel = document.createElement('select');
    sel.setAttribute('aria-label', '색');
    for (const [id, l] of cs) sel.append(new Option(`색: ${l.color as string}`, id, false, id === (only || look0)));
    sel.onchange = () => {
      const nd = mk(rid, sel.value);
      d.el.replaceWith(nd.el);
      d = nd;
      dolls[i] = nd;
      nd.setLoop(loop);
    };
    cell.append(sel);
  }
  return d;
});
(window as unknown as { __dolls: typeof dolls }).__dolls = dolls; // 캡처용(시각을 정확히 맞춰 찍기)
let loop = 'idle';
document.querySelectorAll<HTMLButtonElement>('[data-m]').forEach((b) => b.addEventListener('click', () => {
  const m = b.dataset.m!;
  document.querySelectorAll('[data-m]').forEach((x) => x.classList.toggle('on', x === b));
  if (m === 'idle' || m === 'homeIdle' || m === 'move' || m === 'dying' || m === 'bath') { loop = m; dolls.forEach((d) => d.setLoop(m)); }
  else dolls.forEach((d) => d.play(m, { onEnd: () => document.querySelectorAll('[data-m]').forEach((x) => x.classList.toggle('on', (x as HTMLElement).dataset.m === loop)) }));
}));
