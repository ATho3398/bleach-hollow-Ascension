import { chromium } from 'playwright';
const [D, look, which, ...ts] = process.argv.slice(2); const times = ts.map(Number);
const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 640, height: 700 } });
const errs = []; p.on('pageerror', (e) => errs.push(e.message));
await p.clock.install();
await p.goto('file://' + D + '/paperdoll-test.html#manual=1&look=' + look); await p.clock.runFor(50);
await p.evaluate((m) => window.__dolls.forEach((d) => d.play(m)), which);
let now = 0; const st = await p.$('#stage');
for (const t of times) { await p.evaluate((dt) => window.__dolls.forEach((d) => { for (let x = dt; x > 0; x -= 16) d.advance(Math.min(16, x)); }), t - now); now = t; await st.screenshot({ path: `${D}/caps/${look}-${which}-${t}.png` }); }
console.log('errors', errs);
await b.close();
