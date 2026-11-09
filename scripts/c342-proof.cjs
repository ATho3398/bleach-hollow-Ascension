// GDD 207장 proof: 노력치 상한 2차 상향 — 상태 화면 노력치 줄·막대 '{합} / 96 (이 단계 상한 · 능력치 하나 67)'.
// 조건: pc = 844×390 마우스(호로, 튜토리얼 18 + 흡수 몇 번 = 40) / ph = 796×384 터치(사신, 상한 가득 96). 1배, 2장. 실행: node scripts/c342-proof.cjs [출력 폴더]
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const { startServer } = require('./c276-proof.cjs');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.resolve(process.argv[2] || path.join(ROOT, 'docs/captures/c342'));
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const VIEW = {
  pc: { viewport: { width: 844, height: 390 }, deviceScaleFactor: 1 },
  ph: { viewport: { width: 796, height: 384 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true },
};

/** 테스트 모드(?test=1) 새 게임 — c334-proof 와 같은 순서 */
async function newGame(page, url, fi) {
  await page.goto(`${url}?test=1`);
  await page.evaluate(() => localStorage.clear());
  await page.goto(`${url}?test=1`);
  await wait(1200);
  await page.getByRole('button', { name: '새로 시작' }).click();
  await wait(300);
  await page.locator('.bha-slot').first().click();
  await wait(200);
  await page.getByRole('button', { name: '확인' }).click();
  await wait(300);
  await page.locator('.bha-species__card').nth(fi).click();
  await wait(300);
  await page.getByRole('button', { name: '시작', exact: true }).click();
  await wait(400);
  const input = page.locator('[data-ident="name"]');
  if (await input.count()) {
    await input.fill('시험');
    await page.locator('[data-ident="next"]').click();
    await wait(200);
    await page.locator('.bha-ident__gender').first().click();
    await page.locator('[data-ident="done"]').click();
  }
  await wait(2500);
}

/** 저장의 지금 트랙을 고친다 (c334-proof 와 같은 방식) */
async function patchSave(page, src) {
  await page.evaluate((code) => {
    const f = new Function('t', 'shared', code);
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      const raw = localStorage.getItem(k);
      if (!raw || !raw.includes('"runLog"')) continue;
      const data = JSON.parse(raw);
      const walk = (o) => {
        if (!o || typeof o !== 'object') return;
        if (o.nest && o.help && o.runLog) f(o, o.shared);
        for (const v of Object.values(o)) walk(v);
      };
      walk(data);
      localStorage.setItem(k, JSON.stringify(data));
    }
  }, src);
}

async function reopen(page, url) {
  await page.goto(`${url}?test=1`);
  await wait(1500);
  const cont = page.getByRole('button', { name: '이어하기' });
  if (await cont.count()) { await cont.first().click().catch(() => {}); await wait(600); }
  const slot = page.locator('.bha-slot').first();
  if (await slot.count()) { await slot.click().catch(() => {}); await page.getByRole('button', { name: '확인' }).click().catch(() => {}); await wait(1500); }
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const srv = await startServer();
  const browser = await chromium.launch();
  const proof = { cases: {}, errors: [] };
  try {
    // pc 호로 = 튜토리얼 18 + 흡수 몇 번(모든 능력치 6 + 힘 4 = 40) / ph 사신 = 1단계 상한 가득(모든 능력치 16 = 96)
    for (const [mode, fi, fname, per, extraAtk] of [['pc', 0, 'hollow', 6, 4], ['ph', 1, 'shinigami', 16, 0]]) {
      const tag = `${mode}-${fname}`;
      if (process.argv[3] && process.argv[3] !== mode) continue;
      const page = await browser.newPage(VIEW[mode]);
      page.on('pageerror', (e) => proof.errors.push(`${tag}: ${e.message.slice(0, 160)}`));
      await newGame(page, srv.url, fi);
      await patchSave(page, `
        t.help.guides = { ...t.help.guides, 'first-run': 'done', 'home-intro': 'done', 'first-run-room': 'done', 'birth': 'done', 'recover': 'done' };
        t.evolution.tierIndex = 0;
        for (const k of Object.keys(t.evolution.ev)) { t.evolution.ev[k] = ${per}; if (t.evolution.carry) t.evolution.carry[k] = 0; }
        t.evolution.ev.atk += ${extraAtk};
      `);
      await reopen(page, srv.url);
      await page.locator('.bha-room__status').first().click({ timeout: 4000 });
      await wait(1200);
      await page.mouse.move(2, 2);
      await wait(200);
      const status = await page.evaluate(() => {
        const el = document.querySelector('[data-ev-total]');
        const line = el?.closest('p, li, div');
        return { ev: el?.textContent ?? null, line: line?.textContent?.trim().slice(0, 120) ?? null };
      });
      await page.locator('[data-ev-total]').first().scrollIntoViewIfNeeded().catch(() => {});
      await page.screenshot({ path: path.join(OUT, `${tag}-status-ev.png`) });
      proof.cases[tag] = status;
      await page.close();
    }
  } finally {
    await browser.close();
    srv.stop();
  }
  fs.writeFileSync(path.join(OUT, 'proof.json'), JSON.stringify(proof, null, 2));
  console.log(JSON.stringify(proof, null, 1));
  process.exit(0);
})();
