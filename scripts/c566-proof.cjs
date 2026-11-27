// C.566 proof (GDD 6-16 v6.252, 코딩361): 토벌전 — 목록(정령정 침입 작전만 열림) · 작전 걷기 중(모험 화면 그대로) · 보스 칸(뱌쿠야 보스전) · 결과. 1배
// 전투를 빨리 넘기려고 캡처 세이브에만 센 장비를 끼운다(게임 수치와 무관). 실행: node scripts/c566-proof.cjs [저장 폴더]
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const { startServer } = require('./c276-proof.cjs');

const OUT = path.resolve(process.argv[2] || path.join(__dirname, '..', 'docs/captures/c566'));
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
  for (const id of ['br-grand-fisher', 'br-byakuya']) s.shared.special.clears['boss:' + id] = 1;
  if (clears) {
    const g = s.shared.gear;
    g.items.push({ uid: 'gx1', kind: 'weapon', grade: 'legendary', star: 4, stats: { atk: 40000, int: 40000 }, special: null, plus: 0, gotAt: 1 });
    g.items.push({ uid: 'gx2', kind: 'armor', grade: 'legendary', star: 4, stats: { hp: 40000, def: 40000 }, special: null, plus: 0, gotAt: 1 });
    g.equipped.weapon = 'gx1'; g.equipped.armor = 'gx2';
  }
`;

async function boot(page, url, nowMs, clears = false) {
  if (nowMs) await page.clock.setFixedTime(new Date(nowMs));
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
  await page.locator('[data-sdg-tabs] button').filter({ hasText: '토벌전' }).first().click(); await wait(900);
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
    await page.close();
    const p1 = await browser.newPage(PC);
    p1.on('pageerror', (e) => proof.errors.push(e.message.slice(0, 200)));
    const shot = async (pg, name) => { await wait(300); await pg.screenshot({ path: path.join(OUT, `${name}.png`) }); proof.shots.push(`${name}.png`); };
    await boot(p1, server.url, 0, true);
    F.list = await listFacts(p1);
    await shot(p1, '01-pc-raid-list');
    await p1.locator('[data-go="raid"]').click(); await wait(2500);
    F.walk = await p1.evaluate(() => document.body.innerText.replace(/\s+/g, ' ').slice(0, 300));
    await shot(p1, '02-pc-raid-walking');
    F.steps = [];
    let bossShot = false;
    for (let t = 0; t < 150; t++) {
      await wait(1000);
      const txt = await p1.evaluate(() => document.body.innerText.replace(/\s+/g, ' '));
      const screen = await p1.evaluate(() => [...document.querySelectorAll('.bha-app')].map((a) => a.dataset.screen ?? '').join(','));
      
      if (!bossShot && txt.includes('뱌쿠야') && txt.includes('막기')) { await wait(1200); await shot(p1, '03-pc-raid-boss-battle'); bossShot = true; F.boss = txt.slice(0, 200); }
      if (screen.includes('special-result')) { F.result = txt.slice(0, 400); await shot(p1, '04-pc-raid-result'); break; }
      const res = p1.getByRole('button', { name: /^(결과 보기|계속)$/ }).filter({ visible: true });
      if (await res.count()) { F.steps.push(screen); await res.first().click().catch(() => {}); }
    }
    await p1.close();
  } catch (e) { proof.errors.push(String(e).slice(0, 400)); }
  finally {
    fs.writeFileSync(path.join(OUT, 'proof.json'), JSON.stringify(proof, null, 2));
    await browser.close(); server.stop?.();
  }
  console.log(JSON.stringify(proof, null, 1));
  process.exit(0);
})();
