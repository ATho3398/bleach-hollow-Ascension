// C.565 proof (GDD 6-16 v6.251, 코딩361): 보스전 = 블리치 캐릭터 6명 — 목록(그랜드 피셔만 열림·실루엣) · 앞 3명 이긴 뒤 우르키오라 상세(★ 권장 이하) · 폰 잠긴 보스. 1배
// 실행: node scripts/c565-proof.cjs [저장 폴더]
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const { startServer } = require('./c276-proof.cjs');

const OUT = path.resolve(process.argv[2] || path.join(__dirname, '..', 'docs/captures/c565'));
const PC = { viewport: { width: 844, height: 390 }, deviceScaleFactor: 1 };
const PH = { viewport: { width: 796, height: 384 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true };
const DONE = ['first-run', 'first-run-room', 'birth', 'recover', 'home-intro', 'recover-cure', 'tile-intro', 'tile-plan', 'tile-draw', 'unlock-gear', 'unlock-battle-item', 'unlock-instinct', 'unlock-rank', 'unlock-accessory', 'unlock-pet', 'unlock-sortie', 'hogyoku-appear', 'hogyoku-resonance'];
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
// KST 12:00 — 2026-11-30 월 · 2026-12-06 일
const MON = Date.UTC(2026, 10, 30, 3);
const SUN = Date.UTC(2026, 11, 6, 3);

const BODY = `
  const clear = (fid) => { const p = (s.story[fid] ??= g.newStoryProgress()); for (const c of st.STORY_CHAPTERS) { const ct = st.chapterContent(fid, c.id); for (const e of ct.episodes) p.cleared[st.episodeKey(c.id, e.id)] = { firstAt: 1, clears: 1 }; if (!p.chapters.includes(c.id)) p.chapters.push(c.id); } };
  s.evolution.tierIndex = 2; s.evolution.formHistory = ['t2:base', 't3:fire']; s.evolution.formId = 't3:fire';
  s.difficulty.unlocked = 3; s.tower.best = 1;
  for (const id of ['tiles','gear','battleItem','instinct','rankBattle']) s.shared.unlocks[id] = 0;
  clear('hollow');
  for (const id of done) s.help.guides[id] = 'done';
  s.hogyoku.tabNotice = false; s.trackNotice = null;
  s.evolution.tierIndex = 3; s.difficulty.unlocked = 4;
  if (clears) for (const id of ['br-grand-fisher', 'br-byakuya']) s.shared.special.clears['boss:' + id] = 1;
`;

async function boot(page, url, nowMs, clears = false) {
  await page.clock.setFixedTime(new Date(nowMs));
  await page.goto(url); await wait(600);
  await page.evaluate(async ([b, done, clears]) => {
    localStorage.clear();
    const g = await import('/src/game.ts');
    const st = await import('/src/data/story/index.ts');
    const s = g.newSaveData('hollow', Date.now());
    s.name = '권영'; s.help.tutorialSeen = true; s.lastSeenAt = Date.now();
    await new Function('s', 'g', 'st', 'done', 'clears', b)(s, g, st, done, clears);
    g.writeSave(localStorage, s);
  }, [BODY, DONE, clears]);
  await page.goto(url); await wait(1200);
  await page.getByRole('button', { name: /이어하기/ }).first().click({ timeout: 5000 }); await wait(1800);
  await page.locator('.bha-prop--outside').first().click(); await wait(900);
  await page.locator('.bha-worldmap [data-place="tower"]').first().click(); await wait(1000);
  await page.locator('[data-sdg-tabs] button').filter({ hasText: '보스전' }).first().click(); await wait(900);
}
const listFacts = (page) => page.evaluate(() => ({
  tabs: [...document.querySelectorAll('[data-sdg-tabs] button')].map((b) => b.textContent.trim()),
  items: [...document.querySelectorAll('.bha-sdg__item')].map((b) => `${b.classList.contains('is-locked') ? '🔒' : ''}${b.textContent.replace(/\s+/g, ' ').trim()}`),
  stage: document.querySelector('.bha-sdg__stage')?.textContent.replace(/\s+/g, ' ').trim().slice(0, 300),
  corner: document.querySelector('.bha-corner')?.textContent.replace(/\s+/g, ' ').trim(),
  practice: [...document.querySelectorAll('[data-practice]')].map((b) => b.textContent.trim() + (b.disabled ? ' [disabled]' : '')),
}));

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const server = await startServer();
  const browser = await chromium.launch();
  const proof = { errors: [], shots: [], facts: {} };
  const F = proof.facts;
  try {
    const page = await browser.newPage(PC);
    page.on('pageerror', (e) => proof.errors.push(e.message.slice(0, 200)));
    const shot = async (name) => { await wait(400); await page.screenshot({ path: path.join(OUT, `${name}.png`) }); proof.shots.push(`${name}.png`); };
    await boot(page, server.url, MON);
    F.list = await listFacts(page);
    await shot('01-pc-boss-list-grand-fisher');
    await page.close();
    const p1 = await browser.newPage(PC);
    p1.on('pageerror', (e) => proof.errors.push(e.message.slice(0, 200)));
    await boot(p1, server.url, MON, true);
    await p1.locator('.bha-sdg__item[data-key="boss:br-ulquiorra"]').click(); await wait(400);
    F.ulquiorra = await listFacts(p1);
    await wait(400); await p1.screenshot({ path: path.join(OUT, '02-pc-ulquiorra-detail.png') }); proof.shots.push('02-pc-ulquiorra-detail.png');
    await p1.close();
    const p2 = await browser.newPage(PH);
    p2.on('pageerror', (e) => proof.errors.push(e.message.slice(0, 200)));
    await boot(p2, server.url, MON, true);
    await p2.locator('.bha-sdg__item[data-key="boss:br-yhwach"]').click(); await wait(400);
    F.yhwach = await listFacts(p2);
    await wait(400); await p2.screenshot({ path: path.join(OUT, '03-phone-yhwach-locked.png') }); proof.shots.push('03-phone-yhwach-locked.png');
    await p2.close();
  } catch (e) { proof.errors.push(String(e).slice(0, 400)); }
  finally {
    fs.writeFileSync(path.join(OUT, 'proof.json'), JSON.stringify(proof, null, 2));
    await browser.close(); server.stop?.();
  }
  console.log(JSON.stringify(proof, null, 1));
  process.exit(0);
})();
