// C.560 proof (GDD 12-2·12-4 v6.242, 코딩359): 붕옥 창 간소화 · [강화하기] 별도 창(기기 ▲▼·✓ 만으로) · 합체 결과 실루엣 ???. PC 844×390 + 폰 796×384, 1배
// 실행: node scripts/c560-proof.cjs [저장 폴더]
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const { startServer } = require('./c276-proof.cjs');

const OUT = path.resolve(process.argv[2] || path.join(__dirname, '..', 'docs/captures/c560'));
const PH = { viewport: { width: 796, height: 384 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true };
const PC = { viewport: { width: 844, height: 390 }, deviceScaleFactor: 1 };
const DONE = ['first-run', 'first-run-room', 'birth', 'recover', 'home-intro', 'recover-cure', 'tile-intro', 'tile-plan', 'tile-draw', 'unlock-gear', 'unlock-battle-item', 'unlock-instinct', 'unlock-rank', 'unlock-accessory', 'unlock-pet', 'unlock-sortie', 'hogyoku-appear', 'hogyoku-resonance'];

const body = (o) => `
  const clear = (fid) => { const p = (s.story[fid] ??= g.newStoryProgress()); for (const c of st.STORY_CHAPTERS) { const ct = st.chapterContent(fid, c.id); for (const e of ct.episodes) p.cleared[st.episodeKey(c.id, e.id)] = { firstAt: 1, clears: 1 }; if (!p.chapters.includes(c.id)) p.chapters.push(c.id); } };
  s.evolution.tierIndex = 3; s.evolution.formHistory = ['t2:base', 't3:fire', 't4:fire:physical']; s.evolution.formId = 't4:fire:physical';
  for (const id of ['tiles','gear','battleItem','instinct','rankBattle']) s.shared.unlocks[id] = 0;
  clear('hollow'); g.checkTrackOpen(s, 1000);
  clear('shinigami'); g.checkTrackOpen(s, 1100);
  const ot = s.otherTracks[0]; ot.evolution.tierIndex = 3; ot.evolution.formHistory = ['t2:base', 't3:water', 't4:water:special']; ot.evolution.formId = 't4:water:special';
  s.shared.soulCrystals = 9999; s.shared.hogyokuShards = 9999; s.shared.resonanceEssence = 9999;
  for (const [t, n] of Object.entries(${JSON.stringify(o.tracks)})) for (let i = 0; i < n; i++) g.developHogyoku(s, t, 2000 + i);
  s.shared.soulCrystals = ${o.mat[0]}; s.shared.hogyokuShards = ${o.mat[1]}; s.shared.resonanceEssence = ${o.mat[2]};
  for (const t of g.allTracks(s)) { t.rank.ladder = ['player', ...t.rank.ladder.filter((x) => x !== 'player')]; t.rank.history.everRanked = true; }
  for (const id of done) s.help.guides[id] = 'done';
  s.hogyoku.tabNotice = false; s.trackNotice = null;
`;

async function boot(page, url, src) {
  await page.goto(url); await page.waitForTimeout(600);
  await page.evaluate(async ([b, done]) => {
    localStorage.clear();
    const g = await import('/src/game.ts');
    const st = await import('/src/data/story/index.ts');
    const s = g.newSaveData('hollow', Date.now());
    s.name = '권영'; s.help.tutorialSeen = true; s.lastSeenAt = Date.now();
    await new Function('s', 'g', 'st', 'done', b)(s, g, st, done);
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
  try {
    for (const [dk, opts] of [['pc', PC], ['phone', PH]]) {
      const page = await browser.newPage(opts);
      page.on('pageerror', (e) => proof.errors.push(e.message.slice(0, 200)));
      const shot = async (name, wait = 350) => { await page.waitForTimeout(wait); await page.screenshot({ path: path.join(OUT, `${name}.png`) }); proof.shots.push(`${name}.png`); };
      const txt = (q) => page.evaluate((q) => document.querySelector(q)?.textContent.replace(/\s+/g, ' ').trim().slice(0, 300) ?? null, q);
      const sel = () => page.evaluate(() => { const e = document.querySelector('.bha-sel'); return e ? `${e.dataset.sc ?? e.dataset.act ?? e.dataset.sel ?? ''}|${e.textContent.replace(/\s+/g, ' ').trim().slice(0, 30)}` : null; });
      await boot(page, server.url, body({ tracks: { soul: 33, shard: 30, essence: 20 }, mat: [99438, 6, 2] }));
      await page.locator('.bha-prop--hogyoku').first().click({ timeout: 5000 }); await page.waitForTimeout(900);
      F[`${dk}-detail`] = await txt('.bha-hgdetail');
      F[`${dk}-foot`] = await txt('.bha-hgfoot');
      F[`${dk}-stageChips`] = await page.locator('.bha-hogyoku__stages').count();
      if (dk === 'phone') { await shot('04-phone-hogyoku'); await page.close(); continue; }
      await shot('01-pc-hogyoku');
      // 기기 ▲▼ 로 [강화하기]까지 → ✓
      for (let i = 0; i < 20 && !String(await sel()).startsWith('hogyoku-develop|'); i++) { await page.keyboard.press('ArrowDown'); await page.waitForTimeout(80); }
      F['pc-selBeforeOpen'] = await sel();
      await page.keyboard.press('Enter'); await page.waitForTimeout(500);
      F['pc-dialog'] = await txt('.bha-itemdialog');
      F['pc-dialogSel'] = await sel();
      await shot('02-pc-develop-dialog');
      // 창 안 ✓ = [강화] → 같은 창이 34 → 35 로 다시 열린다
      await page.keyboard.press('Enter'); await page.waitForTimeout(600);
      F['pc-dialogAfter'] = await txt('.bha-itemdialog');
      F['pc-dialogSelAfter'] = await sel();
      F['pc-levelAfter'] = await page.evaluate(() => document.querySelector('.bha-hgmat[data-material="soul"]')?.dataset.level ?? null);
      await page.keyboard.press('Escape'); await page.waitForTimeout(300);
      await page.locator('[data-sc="hogyoku-fusion"]').click(); await page.waitForTimeout(800);
      F['pc-fusionResult'] = await txt('.bha-fuse__result');
      F['pc-fusionWhy'] = await txt('.bha-fusestrip__why');
      await shot('03-pc-fusion');
      await page.close();
    }
  } finally {
    fs.writeFileSync(path.join(OUT, 'proof.json'), JSON.stringify(proof, null, 2));
    await browser.close(); server.stop?.();
  }
  console.log(JSON.stringify(proof, null, 1));
  process.exit(0);
})();
