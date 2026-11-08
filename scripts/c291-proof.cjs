// C.291 proof (GDD 183장 화면 E 보충, 코딩203): 살 수 없는 물건 상세 [사기] = 흐리게 자리 유지 + 누르면 이유 한 줄. C.288 캡처 흐름 그대로 + 리디자인 v2 — 가방(탭 7개·장비)·상점 4곳·떠돌이 상인·상세 창·걷기 가방(회복 물건) 두 종족 캡처.
// 화면마다 LCD 안 글자 넘침(가로 잘림) 개수와 상점 카드 열 수·장비 칸 크기·글자 최소 크기도 잰다. 테스트 모드(?test=1, 튜토리얼 없음).
// 캡처 1배 844×390 docs/captures/c291/ (C291_OUT 로 바꿈). 실행: node scripts/c291-proof.cjs (C291_URL=<주소>, C291_FACTIONS=0,1)
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.resolve(ROOT, process.env.C291_OUT ?? 'docs/captures/c291');
const PORT = 5401;
const FACTIONS = (process.env.C291_FACTIONS ?? '0,1').split(',').map(Number);

async function startServer() {
  if (process.env.C291_URL) return { url: process.env.C291_URL, stop: () => {} };
  const p = spawn('npx', ['vite', '--port', String(PORT), '--strictPort'], { cwd: ROOT, stdio: 'pipe', detached: true });
  const url = `http://localhost:${PORT}/`;
  for (let i = 0; i < 60; i++) {
    try { if ((await fetch(url)).ok) return { url, stop: () => { try { process.kill(-p.pid); } catch { /* */ } } }; } catch { /* */ }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error('vite 서버가 뜨지 않았다');
}

/** LCD·창 안 보이는 글자 요소 중 가로로 잘린 것 + 12px 미만 글자 + 44(작은 36) 미만 버튼 */
const measure = () => {
  const vis = (e) => { const r = e.getBoundingClientRect(); return r.width >= 2 && r.height >= 2 && getComputedStyle(e).visibility !== 'hidden'; };
  const scope = '.bha-lcd';
  const over = [...document.querySelectorAll(`${scope} button, ${scope} .bha-chip, ${scope} .bha-num, ${scope} [class*="__name"], ${scope} [class*="__label"], ${scope} .bha-tab, ${scope} .bha-itemtab`)]
    .filter((e) => vis(e) && e.scrollWidth > e.clientWidth + 1 && getComputedStyle(e).overflowX !== 'visible' && getComputedStyle(e).textOverflow !== 'ellipsis')
    .map((e) => `${e.className.split(' ')[0]} '${(e.textContent || '').trim().slice(0, 16)}' ${e.scrollWidth}>${e.clientWidth}`);
  const small = new Set();
  for (const e of document.querySelectorAll(`${scope} *`)) {
    if (!vis(e) || !e.childNodes.length || ![...e.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())) continue;
    const fs = parseFloat(getComputedStyle(e).fontSize);
    if (fs < 12) small.add(`${e.className || e.tagName} ${fs}px '${e.textContent.trim().slice(0, 10)}'`);
  }
  const tiny = [...document.querySelectorAll(`${scope} button`)].filter(vis).filter((b) => {
    const r = b.getBoundingClientRect();
    return Math.min(r.width, r.height) < 36 && !b.closest('.bha-dev');
  }).map((b) => `${b.className.split(' ')[0]} '${(b.getAttribute('aria-label') || b.textContent || '').trim().slice(0, 12)}' ${Math.round(b.getBoundingClientRect().width)}×${Math.round(b.getBoundingClientRect().height)}`);
  const cards = [...document.querySelectorAll(`${scope} .bha-itemgrid .bha-itemcard`)].filter(vis);
  const cols = cards.length ? new Set(cards.slice(0, 8).map((c) => Math.round(c.getBoundingClientRect().top))).size && cards.filter((c) => Math.round(c.getBoundingClientRect().top) === Math.round(cards[0].getBoundingClientRect().top)).length : 0;
  const slot = document.querySelector(`${scope} .bha-eqslot`);
  const sr = slot?.getBoundingClientRect();
  return { over, small: [...small].slice(0, 12), tiny: tiny.slice(0, 12), cols, slot: sr ? `${Math.round(sr.width)}×${Math.round(sr.height)}` : null };
};

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const srv = await startServer();
  const browser = await chromium.launch();
  const proof = { shots: [], measure: {}, errors: [] };
  try {
    for (const fi of FACTIONS) {
      const fname = fi === 0 ? 'hollow' : 'shinigami';
      const page = await browser.newPage({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 1 });
      page.on('pageerror', (e) => proof.errors.push(`${fname}: ${e.message}`));
      const wait = (ms) => page.waitForTimeout(ms);
      const esc = async (n = 1) => { for (let i = 0; i < n; i++) { await page.keyboard.press('Escape'); await wait(250); } };
      const shot = async (name) => {
        await wait(400);
        const file = `${fname}-${name}.png`;
        await page.screenshot({ path: path.join(OUT, file) });
        proof.shots.push(file);
        proof.measure[file] = await page.evaluate(measure);
        console.log(file, JSON.stringify(proof.measure[file]));
      };
      const toRoom = async () => {
        await page.goto(`${srv.url}?test=1`);
        await wait(1200);
        await page.getByRole('button', { name: '이어하기' }).first().click();
        await wait(2200);
      };
      const step = async (label, fn) => { if (process.env.C291_ONLY && !label.includes(process.env.C291_ONLY)) return; try { await fn(); } catch (e) { proof.errors.push(`${fname} ${label}: ${String(e.message).split('\n').slice(0, 3).join(' ')}`); await page.screenshot({ path: path.join(OUT, `${fname}-fail-${label}.png`) }).catch(() => {}); await toRoom(); } };
      const lcd = page.locator('.bha-lcd');
      const tab = (name) => lcd.locator('[role="tab"]', { hasText: name }).first().click();
      // 새 게임 (테스트 모드)
      await page.goto(`${srv.url}?test=1`);
      await page.evaluate(() => localStorage.clear());
      await page.goto(`${srv.url}?test=1`);
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
      await wait(2500);
      // 떠돌이 상인 부르기 (테스트 패널 불러오기)
      await step('떠돌이 상인 부르기', async () => {
        await page.getByRole('button', { name: '더보기' }).first().click();
        await wait(300);
        await page.locator('.bha-homedock__tray').getByRole('button', { name: '테스트' }).first().click();
        await wait(900);
        await lcd.locator('.bha-viewtitle__btn').first().click();
        await wait(300);
        await lcd.locator('.bha-viewtitle__list button', { hasText: '불러오기' }).first().click();
        await wait(400);
        await lcd.getByRole('button', { name: '지금 부르기' }).first().click();
        await wait(600);
        await toRoom();
      });
      // ── 상점 4곳 + 떠돌이 상인 ──
      const toMarket = async () => {
        await page.locator('.bha-prop--outside').first().click();
        await wait(900);
        await page.locator('.bha-worldmap [data-place="market"]').first().click();
        await wait(2000);
      };
      await step('상점', async () => {
        await toMarket();
        await page.locator('.bha-market [data-spot="shop"]').first().click();
        await wait(900);
        await shot('11-shop');
        await lcd.locator('.bha-itemcard').first().click();
        await wait(600);
        await shot('12-shop-detail');
        // 살 수 없는 물건(보관 가득): [사기] 흐림 → 눌러도 창이 그대로, 이유 한 줄
        const buy = page.locator('.bha-itemdialog [data-act="buy"]').first();
        proof.cannotBuy = proof.cannotBuy ?? {};
        proof.cannotBuy[fname] = await buy.evaluate((b) => ({ ariaDisabled: b.getAttribute('aria-disabled'), cls: b.className, opacity: getComputedStyle(b).opacity }));
        await buy.click({ force: true }); // aria-disabled 라 playwright 는 force 로 누른다
        await wait(300);
        proof.cannotBuy[fname].after = await page.evaluate(() => ({ open: !!document.querySelector('.bha-itemdialog'), reason: document.querySelector('.bha-itemdialog .bha-itemmodal__lock')?.textContent ?? null, reasonShown: !document.querySelector('.bha-itemdialog .bha-itemmodal__lock')?.hidden }));
        console.log('cannotBuy', fname, JSON.stringify(proof.cannotBuy[fname]));
        await shot('12b-shop-cannot-buy-pressed');
        await esc(1);
        await tab('전투');
        await wait(400);
        await shot('13-shop-battle');
        await esc(1);
        await wait(800);
        await page.locator('.bha-market [data-spot="gearShop"]').first().click();
        await wait(900);
        await shot('14-shop-gear');
        await lcd.locator('.bha-itemcard').first().click();
        await wait(600);
        await shot('15-shop-gear-detail');
        await page.locator('.bha-itemdialog [data-act="buy"]').first().click();
        await wait(1200);
        await esc(1);
        await wait(800);
        await page.locator('.bha-market [data-spot="skinShop"]').first().click();
        await wait(900);
        await shot('16-shop-skin');
        await esc(1);
        await wait(800);
        await page.locator('.bha-market [data-spot="traitShop"]').first().click();
        await wait(900);
        await shot('17-shop-trait');
        await esc(1);
        await wait(800);
        await page.locator('.bha-market [data-spot="wanderer"]').first().click();
        await wait(900);
        await shot('18-wanderer');
        await lcd.locator('.bha-itemcard').first().click();
        await wait(600);
        await shot('19-wanderer-detail');
        await toRoom();
      });
      // ── 가방 ──
      await step('가방', async () => {
        await page.locator('.bha-prop--chest').first().click();
        await wait(900);
        await shot('01-bag-gear');
        await lcd.locator('.bha-eqright .bha-itemcard').first().click();
        await wait(500);
        await shot('01b-bag-gear-detail');
        await esc(1);
        const sub = lcd.locator('.bha-eqright [role="tab"]').last();
        await sub.click();
        await wait(400);
        await shot('02-bag-gear-battle');
        await lcd.locator('.bha-eqright .bha-itemcard').first().click();
        await wait(500);
        await shot('03-bag-battle-detail');
        await esc(1);
        for (const [i, name] of [['04', '슬롯'], ['05', '타일'], ['06', '소모품'], ['07', '스킨'], ['08', '펫'], ['09', '기타']]) {
          await lcd.locator('.bha-lcdpage__aside [role="tab"]', { hasText: name }).first().click();
          await wait(500);
          await shot(`${i}-bag-${name}`);
        }
        await lcd.locator('.bha-lcdpage__aside [role="tab"]', { hasText: '소모품' }).first().click();
        await wait(400);
        await lcd.locator('.bha-itemcard').first().click();
        await wait(500);
        await shot('10-bag-item-detail');
        await toRoom();
      });
      // ── 걷기 가방 (회복 물건) ──
      await step('걷기 가방', async () => {
        await page.locator('.bha-prop--outside').first().click();
        await wait(900);
        await page.locator('.bha-worldmap [data-place="adventure"]').first().click();
        await wait(2000);
        await lcd.getByRole('button', { name: '★1', exact: true }).first().click();
        await wait(300);
        await lcd.getByRole('button', { name: '출발', exact: true }).first().click();
        await wait(1500);
        await lcd.getByRole('button', { name: '가방' }).first().waitFor({ timeout: 20_000 });
        await lcd.getByRole('button', { name: '가방' }).first().click();
        await wait(700);
        await shot('20-walk-healbag');
      });
      await page.close();
    }
  } finally {
    await browser.close();
    srv.stop();
  }
  fs.writeFileSync(path.join(OUT, 'proof.json'), JSON.stringify(proof, null, 1));
  console.log('errors', proof.errors);
})();
