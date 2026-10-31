import { DRAFT_RIGS } from '../draft';
import { createPaperdoll } from '../../../src/ui/bha/paperdoll';
declare const ART_MAP: Record<string, string>;
const stage = document.getElementById('stage')!;
const LOOKS: [string, string][] = [
  ...['shinigami-base', 'shinigami-base-f', 'shinigami-student', 'shinigami-student-f', 'arrancar-base', 'arrancar-base-f', 'bare-base', 'female-base', 'digitigrade-test', 'cape-test', 'arrancar-f-release-test'].map((l) => ['humanoid', l] as [string, string]),
  ['beast', 'beast-test'],
  ['serpent', 'serpent-test'],
];
// 주소 뒤 #look=<외형> 이면 그 외형 하나만 크게(캡처·확인용)
const hp = new URLSearchParams(location.hash.slice(1));
const only = hp.get('look');
const dolls = LOOKS.filter(([, l]) => !only || l === only).map(([rid, look]) => {
  const d0 = DRAFT_RIGS[rid]!;
  const d = createPaperdoll({ rig: d0.rig, motions: d0.motions, motionSets: d0.sets, look, scale: only ? 4 : 3, base: '', autoplay: !hp.get('manual') });
  d.el.querySelectorAll('img').forEach((im) => { const k = im.getAttribute('src')!; if (ART_MAP[k]) im.src = ART_MAP[k]; });
  const cell = document.createElement('div'); cell.className = 'cell'; cell.append(d.el); stage.append(cell);
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
