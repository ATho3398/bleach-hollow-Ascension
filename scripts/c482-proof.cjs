// C.477 proof: 사신 골드 펫(지옥나비) 그림 — 방 · 가방 장비 탭. 실행: node scripts/c477-proof.cjs [저장 폴더]
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const { startServer } = require('./c276-proof.cjs');
const OUT = path.resolve(process.argv[2] || path.join(__dirname, '..', 'docs/captures/c482'));
const PC = { viewport: { width: 844, height: 390 }, deviceScaleFactor: 1 };
(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const server = await startServer(); const browser = await chromium.launch(); const proof = { errors: [], facts: {} };
  try {
    for (const fid of ['shinigami', 'hollow']) {
      const page = await browser.newPage(PC);
      page.on('pageerror', (e) => proof.errors.push(e.message.slice(0, 200)));
      await page.goto(server.url); await page.waitForTimeout(600);
      await page.evaluate(async (fid) => {
        localStorage.clear();
        const g = await import('/src/game.ts');
        const s = g.newSaveData(fid, Date.now());
        s.name = '권영'; s.help.tutorialSeen = true; s.lastSeenAt = Date.now();
        for (const id of Object.keys(s.help.guides ?? {})) s.help.guides[id] = 'done';
        for (const id of ['first-run', 'first-run-room', 'birth', 'recover', 'home-intro', 'recover-cure', 'tile-intro', 'tile-plan', 'tile-draw', 'unlock-gear', 'unlock-pet']) s.help.guides[id] = 'done';
        const pid = fid === 'shinigami' ? 'pet-wakame' : 'pet-kon'; s.shared.pets.owned[pid] = { laps: 0, gotAt: 1 }; s.shared.pets.active = pid;
        g.writeSave(localStorage, s);
      }, fid);
      await page.goto(server.url); await page.waitForTimeout(1200);
      await page.getByRole('button', { name: /이어하기/ }).first().click({ timeout: 5000 }).catch(() => {}); await page.waitForTimeout(2500);
      proof.facts[fid] = await page.evaluate(() => { const p = document.querySelector('.bha-pet--buddy'); const r = p?.getBoundingClientRect(); return p ? { hasArt: p.classList.contains('has-art'), src: p.querySelector('img')?.getAttribute('src') ?? null, title: p.title, w: r.width, h: r.height } : null; });
      await page.screenshot({ path: path.join(OUT, `0${fid === 'shinigami' ? 1 : 2}-room-${fid}.png`) });
      await page.close();
    }
  } catch (e) { proof.errors.push(String(e).slice(0, 300)); }
  fs.writeFileSync(path.join(OUT, 'proof.json'), JSON.stringify(proof, null, 2));
  console.log(JSON.stringify(proof)); await browser.close(); server.stop();
})();
