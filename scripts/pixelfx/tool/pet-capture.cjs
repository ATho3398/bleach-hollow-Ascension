// 이펙트 배치 도구 '펫' 탭 무대 만들기 (C.485): 종족마다 방 화면 1배 캡처(펫 숨김) + 펫 상자의 기본 자리(페이지 px).
// 실행: node scripts/pixelfx/tool/pet-capture.cjs → scripts/pixelfx/tool/pet-room-<종족>.png · pet-stage.json
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const { startServer } = require('../../c276-proof.cjs');
const HERE = __dirname;
(async () => {
  const server = await startServer(); const browser = await chromium.launch(); const out = {};
  try {
    for (const fid of ['shinigami', 'hollow']) {
      const page = await browser.newPage({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 1 });
      await page.goto(server.url); await page.waitForTimeout(600);
      await page.evaluate(async (fid) => {
        localStorage.clear();
        const g = await import('/src/game.ts');
        const s = g.newSaveData(fid, Date.now());
        s.name = '권영'; s.help.tutorialSeen = true; s.lastSeenAt = Date.now();
        for (const id of ['first-run', 'first-run-room', 'birth', 'recover', 'home-intro', 'recover-cure', 'tile-intro', 'tile-plan', 'tile-draw', 'unlock-gear', 'unlock-pet']) s.help.guides[id] = 'done';
        s.shared.pets.owned['pet-gold'] = { laps: 0, gotAt: 1 }; s.shared.pets.active = 'pet-gold';
        g.writeSave(localStorage, s);
      }, fid);
      await page.goto(server.url); await page.waitForTimeout(1200);
      await page.getByRole('button', { name: /이어하기/ }).first().click({ timeout: 5000 }).catch(() => {}); await page.waitForTimeout(4000);
      out[fid] = await page.evaluate(() => {
        // 자리 값을 뺀 기본 자리 = 몸 너비에 맞춘 자리(C.487 fitPetToBody) — 왼쪽 끝이 기준
        const p = document.querySelector('.bha-pet--buddy');
        const t = (p.style.translate || '0px 0px').split(' ').map((v) => parseFloat(v) || 0);
        p.style.translate = `${t[0] - Number(p.dataset.dx || 0)}px 0px`;
        const r = p.getBoundingClientRect(); p.style.visibility = 'hidden';
        const c = p.parentElement.getBoundingClientRect();
        return { x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width * 100) / 100, h: Math.round(r.height * 100) / 100, char: { x: Math.round(c.left), y: Math.round(c.top), w: Math.round(c.width), h: Math.round(c.height) } };
      });
      await page.screenshot({ path: path.join(HERE, `pet-room-${fid}.png`) });
      await page.close();
    }
  } finally { await browser.close(); server.stop(); }
  fs.writeFileSync(path.join(HERE, 'pet-stage.json'), JSON.stringify(out, null, 2) + '\n');
  console.log(JSON.stringify(out));
})();
