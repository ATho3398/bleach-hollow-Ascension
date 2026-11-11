// C.407 proof (GDD 241-C 10 문구 검수, 코딩269): ① 대기 보상 창 규칙 줄('플레이와 관계없이 … 직접 모험했을 때의 n%') ② 월드맵 탑 잠김 알림('스토리 1장 클리어 후 열린다'). 1배 844×390
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const { startServer } = require('./c276-proof.cjs');
const OUT = path.resolve(process.argv[2] || path.join(__dirname, '..', 'docs/captures/c407'));
(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const server = await startServer();
  const browser = await chromium.launch();
  const proof = { errors: [], shots: [], facts: {} };
  try {
    const page = await browser.newPage({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 1 });
    page.on('pageerror', (e) => proof.errors.push(e.message.slice(0, 200)));
    const shot = async (name) => { await page.waitForTimeout(350); await page.screenshot({ path: path.join(OUT, `${name}.png`) }); proof.shots.push(`${name}.png`); };
    await page.goto(server.url); await page.waitForTimeout(600);
    await page.evaluate(async () => {
      localStorage.clear();
      const g = await import('/src/game.ts');
      const s = g.newSaveData('hollow', Date.now());
      s.name = '권영'; s.help.tutorialSeen = true;
      for (const id of ['first-run', 'first-run-room', 'birth', 'recover', 'home-intro', 'recover-cure']) s.help.guides[id] = 'done';
      s.lastSeenAt = Date.now();
      g.writeSave(localStorage, s);
    });
    await page.goto(server.url); await page.waitForTimeout(1200);
    await page.getByRole('button', { name: /이어하기/ }).first().click({ timeout: 5000 }); await page.waitForTimeout(1500);
    await page.locator('[data-sc="idle-reward"]').first().click(); await page.waitForTimeout(700);
    proof.facts.idleText = await page.evaluate(() => [...document.querySelectorAll('.bha-confirm, .bha-idle, [role="dialog"]')].map((e) => e.textContent.replace(/\s+/g, ' ').trim().slice(0, 300)));
    await shot('01-idle-rule-text');
    await page.keyboard.press('Escape'); await page.waitForTimeout(300);
    await page.evaluate(() => document.querySelectorAll('.bha-confirm button, [role="dialog"] button').forEach((b, i, a) => { if (i === a.length - 1) b.click(); }));
    await page.waitForTimeout(500);
    await page.locator('.bha-prop--outside').first().click(); await page.waitForTimeout(900);
    await page.evaluate(() => document.querySelector('.bha-worldmap [data-place="tower"]').click()); await page.waitForTimeout(500);
    proof.facts.towerToast = await page.evaluate(() => [...document.querySelectorAll('.bha-toast')].map((t) => t.textContent.replace(/\s+/g, ' ').trim()));
    await shot('02-tower-locked-text');
    await page.close();
  } catch (e) { proof.errors.push(`script: ${e.message.slice(0, 300)}`); } finally { await browser.close(); server.stop(); }
  fs.writeFileSync(path.join(OUT, 'proof.json'), JSON.stringify(proof, null, 1));
  console.log(JSON.stringify(proof, null, 1));
})();
