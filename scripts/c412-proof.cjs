// C.412 proof (GDD 243장 1~4, 코딩272): 폰 796×384 1배 — 장비 탭 가로 드래그('펫' 안 잘림)·낡은 장비 지급·착용 따라 하기·상점 잠김 칸·가방 전투 소모품 잠김·타일 배치 겹침·붕옥 등장 컷(두 번째 트랙)
// 실행: node scripts/c412-proof.cjs [저장 폴더]  (C276_URL=<주소> 이미 떠 있는 서버)
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const { startServer } = require('./c276-proof.cjs');

const OUT = path.resolve(process.argv[2] || path.join(__dirname, '..', 'docs/captures/c412'));
const PH = { viewport: { width: 796, height: 384 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true };
const DONE = ['first-run', 'first-run-room', 'birth', 'recover', 'home-intro', 'recover-cure', 'tile-intro', 'tile-plan', 'tile-draw'];

/** 세이브를 만들어 넣고 이어하기 (src = 세이브 s·모듈 g·스토리 st 를 받는 함수 몸통) */
async function boot(page, url, src) {
  await page.goto(url); await page.waitForTimeout(600);
  await page.evaluate(async ([body, done]) => {
    localStorage.clear();
    const g = await import('/src/game.ts');
    const st = await import('/src/data/story/index.ts');
    const s = g.newSaveData('hollow', Date.now());
    s.name = '권영'; s.help.tutorialSeen = true;
    for (const id of done) s.help.guides[id] = 'done';
    s.lastSeenAt = Date.now();
    await new Function('s', 'g', 'st', body)(s, g, st);
    g.writeSave(localStorage, s);
  }, [src, DONE]);
  await page.goto(url); await page.waitForTimeout(1200);
  await page.getByRole('button', { name: /이어하기/ }).first().click({ timeout: 5000 }); await page.waitForTimeout(1800);
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const server = await startServer();
  const browser = await chromium.launch();
  const proof = { errors: [], shots: [], facts: {} };
  const F = proof.facts;
  let page = null;
  try {
    page = await browser.newPage(PH);
    page.on('pageerror', (e) => proof.errors.push(e.message.slice(0, 200)));
    const shot = async (name) => { await page.waitForTimeout(350); await page.screenshot({ path: path.join(OUT, `${name}.png`) }); proof.shots.push(`${name}.png`); };
    const card = () => page.evaluate(() => document.querySelector('.bha-tut')?.textContent.replace(/\s+/g, ' ').trim().slice(0, 200) ?? null);
    const next = async () => { await page.locator('.bha-tut button.bha-btn--primary:not([disabled])').first().click({ timeout: 3000 }); await page.waitForTimeout(700); };

    // ── 3) 장비 해금 = 낡은 장비 3종 + 따라 하기 ──
    await boot(page, server.url, `s.evolution.tierIndex = 2; s.shared.unlocks = { tiles: 0 }; s.tiles.unlocked = true; g.checkUnlocks(s, Date.now());`);
    F.gearCard1 = await card();
    await shot('01-gear-guide-open');
    await page.locator('.bha-prop--chest').first().click(); await page.waitForTimeout(1200);
    F.gearCard2 = await card();
    F.gearCards = await page.evaluate(() => [...document.querySelectorAll('.bha-equip-page .bha-itemcard')].map((c) => c.textContent.replace(/\s+/g, ' ').trim()));
    F.nextLockedBefore = await page.locator('.bha-tut button.bha-btn--primary[disabled]').count();
    await shot('02-gear-guide-wear');
    for (const name of ['낡은 무기', '낡은 방어구', '낡은 신발']) {
      await page.locator('.bha-equip-page .bha-itemcard', { hasText: name }).first().click(); await page.waitForTimeout(500);
      await page.locator('.bha-itemdialog [data-act^="equip-"]').first().click(); await page.waitForTimeout(600);
    }
    F.slotsAfter = await page.evaluate(() => [...document.querySelectorAll('.bha-eqslot[data-slot]')].slice(0, 6).map((b) => b.getAttribute('title') ?? b.textContent.trim()));
    F.nextLockedAfter = await page.locator('.bha-tut button.bha-btn--primary[disabled]').count();
    await shot('03-gear-guide-worn');
    await next(); F.gearCard3 = await card(); await next();
    F.gearGuideOpen = await page.locator('.bha-tut').count();

    // ── 4) 장비 탭 가로 드래그 ──
    const tabs = page.locator('.bha-eqright .bha-itemtabs');
    const edge = async () => page.evaluate(() => {
      const t = document.querySelector('.bha-eqright .bha-itemtabs'); const b = t.getBoundingClientRect();
      const pet = [...t.querySelectorAll('[role="tab"]')].at(-1).getBoundingClientRect();
      return { cls: t.className, stripRight: Math.round(b.right), petLeft: Math.round(pet.left), petRight: Math.round(pet.right), clipped: pet.right > b.right + 0.5 };
    });
    F.tabsBefore = await edge();
    // 드래그 전 상태는 proof.json tabsBefore (캡처 10장 제한)
    const box = await tabs.boundingBox();
    const cdp = await page.context().newCDPSession(page);
    const x0 = Math.round(box.x + box.width - 30); const y0 = Math.round(box.y + box.height / 2);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: x0, y: y0 }] });
    for (let i = 1; i <= 10; i++) { await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x0 - i * 15, y: y0 }] }); await page.waitForTimeout(16); }
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await page.waitForTimeout(400);
    F.tabsAfter = await edge();
    await shot('05-gear-tabs-after-drag');

    // ── 2) 상점 잠김 칸 · 가방 전투 소모품 잠김 (1단계) ──
    await boot(page, server.url, `s.shared.tradeCoins = 5000;`);
    await page.locator('.bha-prop--chest').first().click(); await page.waitForTimeout(900);
    await page.locator('[role="tab"][data-tab="items"]').first().click(); await page.waitForTimeout(400);
    await page.locator('[role="tab"][data-tab="battle"]').first().click(); await page.waitForTimeout(400);
    F.bagBattle = await page.evaluate(() => document.querySelector('.bha-itemgrid')?.textContent.trim());
    await shot('06-bag-battle-locked');
    await page.locator('[role="tab"][data-tab="sortie"]').first().click(); await page.waitForTimeout(400);
    F.bagSortie = await page.evaluate(() => document.querySelector('.bha-itembox')?.textContent.replace(/\s+/g, ' ').trim());
    await page.keyboard.press('Escape'); await page.waitForTimeout(500);
    await boot(page, server.url, `s.shared.tradeCoins = 5000;`);
    await page.locator('.bha-prop--outside').first().click(); await page.waitForTimeout(900);
    await page.locator('.bha-worldmap [data-place="market"]').first().click(); await page.waitForTimeout(2000);
    await page.locator('.bha-market [data-spot="shop"]').first().click(); await page.waitForTimeout(900);
    for (const tab of ['타일', '전투']) {
      const t = page.locator('[role="tab"]', { hasText: tab }).first();
      if (!(await t.count())) continue;
      await t.click(); await page.waitForTimeout(500);
      F[`shop-${tab}`] = await page.evaluate(() => [...document.querySelectorAll('.bha-itemcard')].map((c) => c.textContent.replace(/\s+/g, ' ').trim()));
      await shot(`07-shop-${tab === '타일' ? 'tiles' : 'battle'}-locked`);
    }

    // ── 4) 타일 배치: ×1 줄 · 프리셋 2줄 ──
    await boot(page, server.url, `s.evolution.tierIndex = 1; s.shared.unlocks = { tiles: 0 }; s.tiles.unlocked = true; s.tiles.collection = { 'rest-spring': 1, 'prey-nest-a': 1, 'elite-den-a': 1 }; s.tiles.presets = [1, 2, 3].map((n) => ({ name: '프리셋 ' + n, factionId: 'hollow', cells: [null, 'prey-nest-a'] }));`);
    await page.locator('.bha-prop--chest').first().click(); await page.waitForTimeout(800);
    await page.locator('[role="tab"][data-tab="tiles"]').first().click(); await page.waitForTimeout(400);
    await page.locator('[data-sc="tile-place"]').click({ timeout: 3000 }); await page.waitForTimeout(900);
    F.place = await page.evaluate(() => {
      const r = (e) => { const b = e.getBoundingClientRect(); return [Math.round(b.top), Math.round(b.bottom)]; };
      const c = document.querySelector('.bha-plan__side .bha-presets__chips');
      const cards = [...document.querySelectorAll('.bha-road__hand .bha-tilecard')].map((k) => ({ hint: r(k.querySelector('.bha-tilecard__hint')), count: r(k.querySelector('.bha-tilecard__count')) }));
      return { chips: r(c), rows: [...c.children].map(r), cardsOverlap: cards.some((k) => k.count[0] < k.hint[1]) };
    });
    await shot('08-tile-place');

    // ── 1) 붕옥 등장 = 스토리 전부 클리어 ──
    await boot(page, server.url, `s.evolution.tierIndex = 3; const p = g.storyProgressOf(s); for (const c of st.STORY_CHAPTERS) { const ct = st.chapterContent('hollow', c.id); for (const e of ct.episodes) p.cleared[st.episodeKey(c.id, e.id)] = { firstAt: 1, clears: 1 }; p.chapters.push(c.id); } for (const id of ['unlock-gear','unlock-battle-item','unlock-instinct','unlock-rank']) s.help.guides[id] = 'done'; s.shared.unlocks = { tiles: 0, gear: 0, battleItem: 0, instinct: 0, rankBattle: 0 };`);
    F.hogCard1 = await card();
    F.hogIcon = await page.locator('.bha-prop--hogyoku').count();
    await shot('09-hogyoku-appear');
    await next(); F.hogCard2 = await card();
    F.saveAfter = await page.evaluate(() => { const k = Object.keys(localStorage).find((x) => localStorage.getItem(x).includes('"hogyoku"')); const s = JSON.parse(localStorage.getItem(k)); const d = s.slots ? null : s; return d ? { tabOpen: d.hogyoku.tabOpen, appearedAt: d.hogyoku.appearedAt, tracks: d.otherTracks.map((t) => t.factionId) } : 'slots'; });
    await shot('10-hogyoku-second-track');
  } catch (e) {
    proof.errors.push(String(e.message).split('\n')[0]);
    await page?.screenshot({ path: path.join(OUT, 'fail.png') }).catch(() => {});
  } finally {
    fs.writeFileSync(path.join(OUT, 'proof.json'), JSON.stringify(proof, null, 1));
    await browser.close();
    server.stop();
  }
  console.log(JSON.stringify(proof, null, 1));
  process.exit(0);
})();
