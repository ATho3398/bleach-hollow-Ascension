// C.554 proof (모든 기기 같은 화면비·같은 버튼 자리, GDD 14-2): 같은 방 화면을 5개 화면 크기에서 1배로 1장씩.
// 01 폰 가로 19.5:9 844×390 / 02 폰 가로 20:9 915×412 / 03 태블릿 4:3 1024×768 / 04 폰 세로 390×844 / 05 PC 1366×768
// facts.json = 기기 사각형·배율·여백·버튼 4개 상대 위치(기기 기준 0~1). 실행: node scripts/c554-proof.cjs [저장 폴더]
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const { startServer } = require('./c276-proof.cjs');

const OUT = path.resolve(process.argv[2] || path.join(__dirname, '..', 'docs/captures/c554'));
const touch = (w, h) => ({ viewport: { width: w, height: h }, deviceScaleFactor: 1, hasTouch: true, isMobile: true });
const SHOTS = [
  { name: '01-phone-19_5x9-844x390', ctx: touch(844, 390) },
  { name: '02-phone-20x9-915x412', ctx: touch(915, 412) },
  { name: '03-tablet-4x3-1024x768', ctx: touch(1024, 768) },
  { name: '04-phone-portrait-390x844', ctx: touch(390, 844) },
  { name: '05-pc-1366x768', ctx: { viewport: { width: 1366, height: 768 }, deviceScaleFactor: 1 } },
];
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function seed(page, url) {
  await page.goto(`${url}?test=1`);
  await page.evaluate(() => localStorage.clear());
  await page.evaluate(async () => {
    const m = { g: await import('/src/game.ts'), tut: await import('/src/engine/tutorial.ts'), tm: await import('/src/engine/testMode.ts') };
    const slots = await import('/src/saveSlots.ts');
    const store = m.tm.testStorage(localStorage);
    const now = Date.now();
    const s = m.g.newSaveData('hollow', now);
    s.name = '시험';
    s.gender = 'male';
    s.help.tutorialSeen = true;
    for (const id of m.tut.GUIDE_IDS) s.help.guides[id] = 'done';
    s.nest.hunger = 30;
    s.nest.condition = 90;
    m.tm.fillAllUnlocked(s);
    slots.writeSlotSave(store, s, 1);
    slots.touchSlot(store, 1, now);
    localStorage.setItem('bha-fullscreen-start', '0');
  });
  await page.goto(`${url}?test=1`);
  await wait(1500);
  const cont = page.getByRole('button', { name: '이어하기' });
  if (await cont.count()) await cont.click({ timeout: 5000 });
  await wait(2500);
  await page.waitForFunction(() => !document.querySelector('.bha-toast'), null, { timeout: 12000 }).catch(() => {});
}

/** 기기·LCD·버튼 4개의 화면 사각형 → 기기 기준 상대 위치 (돌렸으면 기기 가로 = 화면 세로) */
const facts = (page) => page.evaluate(() => {
  const dev = document.querySelector('.bha-dev');
  const d = dev.getBoundingClientRect();
  const rotated = dev.classList.contains('is-rotated');
  const rel = (el) => {
    const r = el.getBoundingClientRect();
    const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    const u = rotated ? (cy - d.top) / d.height : (cx - d.left) / d.width;
    const v = rotated ? (d.right - cx) / d.width : (cy - d.top) / d.height;
    return [Number(u.toFixed(4)), Number(v.toFixed(4))];
  };
  const lcd = document.querySelector('.bha-lcd, .bha-dev__bezel');
  const l = lcd.getBoundingClientRect();
  const btn = {};
  for (const [k, label] of [['up', '위'], ['down', '아래'], ['ok', '확정'], ['back', '취소']]) {
    const b = [...document.querySelectorAll(`.bha-dev__btn[aria-label="${label}"]`)].find((e) => e.offsetParent !== null) ?? document.querySelector(`.bha-dev__btn[aria-label="${label}"]`);
    btn[k] = b ? rel(b) : null;
  }
  const lw = rotated ? l.height : l.width, lh = rotated ? l.width : l.height;
  return {
    vw: innerWidth, vh: innerHeight, rotated, pc: dev.classList.contains('is-pc'),
    device: [d.left, d.top, d.width, d.height].map((n) => Math.round(n * 10) / 10),
    deviceRatio: Number(((rotated ? d.height / d.width : d.width / d.height)).toFixed(4)),
    margins: { left: Math.round(d.left), right: Math.round(innerWidth - d.right), top: Math.round(d.top), bottom: Math.round(innerHeight - d.bottom) },
    lcdRatio: Number((lw / lh).toFixed(4)),
    buttons: btn,
  };
});

if (require.main === module) (async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const srv = await startServer();
  const browser = await chromium.launch();
  const out = { shots: [], errors: [] };
  try {
    for (const s of SHOTS) {
      const page = await (await browser.newContext(s.ctx)).newPage();
      page.on('pageerror', (e) => out.errors.push(`${s.name}: ${e.message}`));
      await seed(page, srv.url);
      await wait(600);
      await page.screenshot({ path: path.join(OUT, `${s.name}.png`) });
      out.shots.push({ name: `${s.name}.png`, ...(await facts(page)) });
      await page.context().close();
    }
  } finally {
    await browser.close();
    srv.stop();
  }
  fs.writeFileSync(path.join(OUT, 'facts.json'), JSON.stringify(out, null, 2));
  console.log(JSON.stringify(out, null, 1));
})();
