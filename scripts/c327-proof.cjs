// C.327 proof (코딩235): 이름 정하기 입력 칸 테두리 한 겹 — 바깥 박스(.bha-ident__field)만 테두리, 입력 요소는 테두리·배경·outline·빛 없음.
// 모드: pc = 844×390 마우스 / ph = 796×384 터치. 두 종족 × (오류 · 초점) = 8장, 1배, docs/captures/c327/. 실행: node scripts/c327-proof.cjs
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const { startServer } = require('./c276-proof.cjs');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'docs/captures/c327');
const MODES = [
  { id: 'pc', ctx: { viewport: { width: 844, height: 390 }, deviceScaleFactor: 1 } },
  { id: 'ph', ctx: { viewport: { width: 796, height: 384 }, deviceScaleFactor: 1, hasTouch: true, isMobile: true } },
];

/** 입력 요소·박스의 테두리 그림 상태 */
const look = (page) => page.evaluate(() => {
  const i = document.querySelector('[data-ident="name"]');
  const f = i.closest('.bha-ident__field');
  const ci = getComputedStyle(i);
  const cf = getComputedStyle(f);
  const ri = i.getBoundingClientRect();
  const rf = f.getBoundingClientRect();
  return {
    sel: i.classList.contains('bha-sel'), focused: document.activeElement === i, bad: f.classList.contains('is-bad'),
    input: { outline: ci.outlineStyle === 'none' || ci.outlineWidth === '0px' ? 'none' : `${ci.outlineWidth} ${ci.outlineStyle}`, shadow: ci.boxShadow, border: ci.borderTopWidth, bg: ci.backgroundColor },
    field: cf.boxShadow,
    inside: ri.left >= rf.left - 0.5 && ri.right <= rf.right + 0.5 && ri.top >= rf.top - 0.5 && ri.bottom <= rf.bottom + 0.5,
  };
});

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const srv = await startServer();
  const browser = await chromium.launch();
  const proof = { runs: [], errors: [], shots: [] };
  try {
    for (const m of MODES) {
      for (const fi of [0, 1]) {
        const ctx = await browser.newContext(m.ctx);
        const page = await ctx.newPage();
        page.on('pageerror', (e) => proof.errors.push(`${m.id}-${fi}: ${e.message}`));
        const tag = `${m.id}-${fi}`;
        await page.goto(srv.url);
        await page.evaluate(() => localStorage.clear());
        await page.goto(srv.url);
        await page.waitForTimeout(1200);
        await page.getByRole('button', { name: '새로 시작' }).click();
        await page.waitForTimeout(300);
        await page.locator('.bha-slot').first().click();
        await page.getByRole('button', { name: '확인' }).click();
        await page.waitForTimeout(300);
        await page.locator('.bha-species__card').nth(fi).click();
        await page.waitForTimeout(300);
        await page.getByRole('button', { name: '시작', exact: true }).click();
        await page.waitForTimeout(400);
        const run = { mode: m.id, faction: fi === 0 ? 'hollow' : 'shinigami' };
        const i = page.locator('[data-ident="name"]');
        await i.fill('');
        await i.pressSequentially('권 영', { delay: 10 });
        await page.waitForTimeout(150);
        run.error = await look(page);
        await page.screenshot({ path: path.join(OUT, `${tag}-name-error.png`) });
        proof.shots.push(`${tag}-name-error.png`);
        await i.fill('');
        await i.pressSequentially(fi === 0 ? '권영' : 'Rukia', { delay: 10 });
        await page.waitForTimeout(150);
        run.focus = await look(page);
        await page.screenshot({ path: path.join(OUT, `${tag}-name-focus.png`) });
        proof.shots.push(`${tag}-name-focus.png`);
        proof.runs.push(run);
        await ctx.close();
      }
    }
  } catch (e) {
    proof.errors.push(String(e && e.stack || e));
  } finally {
    await browser.close();
    srv.stop();
  }
  fs.writeFileSync(path.join(OUT, 'proof.json'), JSON.stringify(proof, null, 1));
  const bad = proof.runs.flatMap((r) => ['error', 'focus'].flatMap((k) => {
    const s = r[k];
    const out = [];
    if (s.input.outline !== 'none') out.push('입력 요소 outline');
    if (s.input.shadow !== 'none') out.push('입력 요소 빛/테두리');
    if (s.input.border !== '0px') out.push('입력 요소 border');
    if (!/rgba\(0, 0, 0, 0\)|transparent/.test(s.input.bg)) out.push(`입력 요소 배경 ${s.input.bg}`);
    if (!s.inside) out.push('입력 요소가 박스 밖');
    if (k === 'error' && !s.bad) out.push('오류인데 박스 is-bad 아님');
    if (k === 'focus' && s.bad) out.push('정상인데 박스 is-bad');
    return out.map((o) => `${r.mode}/${r.faction}/${k}: ${o}`);
  }));
  console.log(JSON.stringify({ errors: proof.errors, bad, shots: proof.shots.length, sample: proof.runs[0] }, null, 1));
})();
