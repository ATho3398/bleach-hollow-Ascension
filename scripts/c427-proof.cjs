// C.427 proof (GDD 12-4 v6.023·v6.025, 코딩279): 초월체 → 초월자 · 4 영왕 · 5 태초 · 6 Unknown;03398 — 초월자 도감·합체 창. 폰 796×384, 1배
// 실행: node scripts/c427-proof.cjs [저장 폴더]
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const { startServer } = require('./c276-proof.cjs');

const OUT = path.resolve(process.argv[2] || path.join(__dirname, '..', 'docs/captures/c427'));
const PH = { viewport: { width: 796, height: 384 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true };
const PC = { viewport: { width: 844, height: 390 }, deviceScaleFactor: 1 };
const DONE = ['first-run', 'first-run-room', 'birth', 'recover', 'home-intro', 'recover-cure', 'tile-intro', 'tile-plan', 'tile-draw', 'unlock-gear', 'unlock-battle-item', 'unlock-instinct', 'unlock-rank', 'unlock-accessory', 'unlock-pet', 'unlock-sortie', 'hogyoku-appear', 'hogyoku-resonance'];

// 세이브 몸통: 종족 스토리 전부 클리어(clear 목록), 붕옥 등장·두 번째 트랙(checkTrackOpen), 개발 단계·재료·1위
const body = (o) => `
  const clear = (fid) => { const p = (s.story[fid] ??= g.newStoryProgress()); for (const c of st.STORY_CHAPTERS) { const ct = st.chapterContent(fid, c.id); for (const e of ct.episodes) p.cleared[st.episodeKey(c.id, e.id)] = { firstAt: 1, clears: 1 }; if (!p.chapters.includes(c.id)) p.chapters.push(c.id); } };
  s.evolution.tierIndex = 3; s.evolution.formHistory = ['t2:base', 't3:fire', 't4:fire:physical']; s.evolution.formId = 't4:fire:physical';
  for (const id of ['tiles','gear','battleItem','instinct','rankBattle']) s.shared.unlocks[id] = 0;
  clear('hollow'); g.checkTrackOpen(s, 1000);
  ${o.resonance ? "clear('shinigami'); g.checkTrackOpen(s, 1100);" : ''}
  const ot = s.otherTracks[0]; ot.evolution.tierIndex = 3; ot.evolution.formHistory = ['t2:base', 't3:water', 't4:water:special']; ot.evolution.formId = 't4:water:special';
  s.shared.soulCrystals = 999; s.shared.hogyokuShards = 999; s.shared.resonanceEssence = 999;
  for (const [t, n] of Object.entries(${JSON.stringify(o.tracks)})) for (let i = 0; i < n; i++) g.developHogyoku(s, t, 2000 + i);
  s.shared.soulCrystals = ${o.mat[0]}; s.shared.hogyokuShards = ${o.mat[1]}; s.shared.resonanceEssence = ${o.mat[2]};
  ${o.top ? "for (const t of g.allTracks(s)) { t.rank.ladder = ['player', ...t.rank.ladder.filter((x) => x !== 'player')]; t.rank.history.everRanked = true; }" : ''}
  for (const id of done) s.help.guides[id] = 'done';
  s.hogyoku.tabNotice = false; s.trackNotice = null;
  ${o.dex ? "for (const [i, id] of ['ichigo', 'iron-tyrant', 'zero-sage', 'rift-wanderer'].entries()) s.transcendentDex.push({ id, at: 3000 + i, fusionIndex: i + 1 });" : ''}
  ${o.cut ? "s.help.guides['hogyoku-resonance'] = 'pending';" : ''}
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
    const page = await browser.newPage(PH);
    page.on('pageerror', (e) => proof.errors.push(e.message.slice(0, 200)));
    const shot = async (name) => { await page.waitForTimeout(400); await page.screenshot({ path: path.join(OUT, `${name}.png`) }); proof.shots.push(`${name}.png`); };
    await boot(page, server.url, body({ tracks: { soul: 40, shard: 30, essence: 20 }, mat: [40, 25, 9], resonance: true, top: false, dex: true }));
    await page.locator('.bha-prop--hogyoku').first().click({ timeout: 5000 }); await page.waitForTimeout(900);
    F.tabs = await page.evaluate(() => [...document.querySelectorAll('.bha-lcdpage__aside button')].map((b) => b.textContent.trim()));
    await page.locator('[data-sc="hogyoku-dex"]').click(); await page.waitForTimeout(800);
    F.dex = await page.evaluate(() => ({ title: document.querySelector('.bha-lcdpage__title')?.textContent, cards: [...document.querySelectorAll('.bha-dexcard')].map((c) => c.textContent.trim()) }));
    await shot('01-transcendent-dex');
    await page.goBack().catch(() => {}); await page.waitForTimeout(600);
    if (!(await page.locator('.bha-hgorb').count())) { await page.locator('.bha-prop--hogyoku').first().click({ timeout: 5000 }).catch(() => {}); await page.waitForTimeout(800); }
    await page.locator('[data-sc="hogyoku-fusion"]').click(); await page.waitForTimeout(800);
    F.fusion = await page.evaluate(() => document.querySelector('.bha-hgdetail')?.textContent.replace(/\s+/g, ' ').trim().slice(0, 300));
    await shot('02-fusion');
    F.textHasOld = await page.evaluate(() => document.body.innerText.includes('초월체'));
    await page.close();
  } finally {
    fs.writeFileSync(path.join(OUT, 'proof.json'), JSON.stringify(proof, null, 2));
    await browser.close(); server.stop?.();
  }
  console.log(JSON.stringify(proof, null, 1));
  process.exit(0);
})();
