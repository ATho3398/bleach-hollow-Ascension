// C.413 proof (GDD 244장 1, 코딩274): 폰 796×384 1배 — 슬롯 삭제 확인 창이 열릴 때 입력칸에 초점이 없다(자판 안 뜸, 안내 문구가 보임)
// 실행: node scripts/c413-proof.cjs [저장 폴더]
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const { startServer } = require('./c276-proof.cjs');

const OUT = path.resolve(process.argv[2] || path.join(__dirname, '..', 'docs/captures/c413'));
const PH = { viewport: { width: 796, height: 384 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true };

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const server = await startServer();
  const browser = await chromium.launch();
  const proof = { errors: [], shots: [], facts: {} };
  try {
    const page = await browser.newPage(PH);
    page.on('pageerror', (e) => proof.errors.push(e.message.slice(0, 200)));
    await page.goto(server.url); await page.waitForTimeout(600);
    await page.evaluate(async () => {
      localStorage.clear();
      const g = await import('/src/game.ts');
      const s = g.newSaveData('hollow', Date.now());
      s.name = '권영'; s.help.tutorialSeen = true; s.lastSeenAt = Date.now();
      g.writeSave(localStorage, s);
    });
    await page.goto(server.url); await page.waitForTimeout(1500);
    await page.getByRole('button', { name: '새로 시작' }).click(); await page.waitForTimeout(300);
    await page.locator('.bha-slot').first().click(); await page.waitForTimeout(150);
    await page.locator('[data-sc="slots.delete"]').click(); await page.waitForTimeout(400);
    const focus = () => page.evaluate(() => { const a = document.activeElement; return a ? `${a.tagName}${a.className ? '.' + String(a.className).split(' ')[0] : ''}:${(a.textContent || a.getAttribute('placeholder') || '').trim()}` : null; });
    proof.facts.focusOnOpen = await focus();
    proof.facts.inputFocusedOnOpen = await page.evaluate(() => document.activeElement?.matches('[data-confirm-input]') ?? false);
    proof.facts.hintVisible = await page.locator('.bha-confirm .bha-modal__body', { hasText: '삭제하려면' }).isVisible();
    await page.screenshot({ path: path.join(OUT, '01-delete-open-no-keyboard.png') }); proof.shots.push('01-delete-open-no-keyboard.png');
    await page.locator('[data-confirm-input]').tap(); await page.waitForTimeout(200);
    proof.facts.inputFocusedAfterTap = await page.evaluate(() => document.activeElement?.matches('[data-confirm-input]') ?? false);
  } finally {
    fs.writeFileSync(path.join(OUT, 'proof.json'), JSON.stringify(proof, null, 2));
    await browser.close(); server.stop?.();
  }
  console.log(JSON.stringify(proof, null, 1));
  process.exit(0);
})();
