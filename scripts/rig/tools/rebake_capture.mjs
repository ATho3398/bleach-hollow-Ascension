// 다시 도트화 시험 1단계(사용자 2026-11-19 "12프레임정도로 해서 해볼 수 있음???"): 종이인형 한 동작을 n 장으로 뽑아 조각별 행렬·그림·불꽃 층을 JSON 으로 — node scripts/rig/tools/rebake_capture.mjs <.rig-pages 절대경로> <외형> <동작> <실제 ms> <장수> <out.json> → python3 scripts/rig/tools/rebake.py <json> naive|rot|smooth <out.gif> <장당 ms>
import { chromium } from 'playwright';
import fs from 'node:fs';
const [D, look, which, dur, n, out] = process.argv.slice(2);
const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 900, height: 900 } });
await p.clock.install(); await p.goto('file://' + D + '/paperdoll-test.html#manual=1&look=' + look); await p.clock.runFor(50);
const adv = (ms) => p.evaluate((dt) => window.__dolls.forEach((d) => { for (let x = dt; x > 0; x -= 8) d.advance(Math.min(8, x)); }), ms);
await p.evaluate(() => window.__dolls.forEach((d) => d.setLoop('idle'))); await adv(4000);
await p.evaluate((m) => window.__dolls.forEach((d) => (m === 'move' || m === 'idle' || m === 'dying' || m === 'downIdle') ? d.setLoop(m) : d.play(m)), which);
const srcs = {}; const frames = [];
for (let i = 0; i < Number(n); i++) {
  const f = await p.evaluate(() => {
    const el = window.__dolls[0].el, k = 4, out = { layers: [], canvases: [] };
    [...el.children].forEach((e, order) => {
      if (e.tagName === 'IMG' && e.dataset.slot && e.style.display !== 'none') {
        const v = /matrix\(([^)]+)\)/.exec(e.style.transform)?.[1]?.split(',').map(Number);
        if (v) out.layers.push({ slot: e.dataset.slot, src: e.src, m: [v[0], v[1], v[2], v[3], v[4] / k, v[5] / k], z: Number(e.style.zIndex) || 0, order });
      } else if (e.tagName === 'CANVAS' && !e.hidden) {
        out.canvases.push({ z: Number(e.style.zIndex) || 0, order, left: parseFloat(e.style.left) / k, top: parseFloat(e.style.top) / k, w: e.width, h: e.height, png: e.toDataURL() });
      }
    });
    return out;
  });
  for (const l of f.layers) { if (!(l.src in srcs)) srcs[l.src] = `p${Object.keys(srcs).length}`; l.src = srcs[l.src]; }
  frames.push(f);
  await adv(Number(dur) / Number(n));
}
fs.writeFileSync(out, JSON.stringify({ srcs: Object.fromEntries(Object.entries(srcs).map(([u, id]) => [id, u])), frames }));
await b.close(); console.log('ok', frames.length);
