// 편집기 화면 확인(사용자 2026-11-14 "앞으로 뭐 추가하거나 툴에 모션 추가하고 하면, 툴 망가지는거 없나 체크해"): node scripts/rig/tools/editor-shot.cjs <.rig-pages 절대경로> <외형 id> <out.png> [너비] — 올리기 전에 바뀐 인형마다 찍어 본다
const { chromium } = require('playwright');
(async () => { const b = await chromium.launch(); const [D, look, out, w] = process.argv.slice(2);
  const p = await b.newPage({ viewport: { width: Number(w || 1000), height: 1000 } }); const errs = []; p.on('pageerror', (e) => errs.push(e.message)); p.on('console', (m) => m.type() === 'error' && errs.push(m.text()));
  await p.goto('file://' + D + '/rig-editor.html'); await p.waitForTimeout(1200);
  await p.evaluate((l) => { const e = document.querySelector(`[data-look="${l}"]`); const g = e.closest('[data-group]'); if (g) { const t = document.querySelector(`[data-tab="${g.dataset.group}"]`); t && t.click(); } e.click(); }, look); await p.waitForTimeout(1500);
  await p.screenshot({ path: out, fullPage: true }); console.log('errors', errs); await b.close(); })();
