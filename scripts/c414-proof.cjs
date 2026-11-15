// C.414 proof (GDD 244장 2~6, 코딩274): 폰 796×384 1배 — 붕옥 반각성·개발 단계 목록·공명 컷·공명·100%(합체 가능)·합체 미리보기, PC 1장
// 실행: node scripts/c414-proof.cjs [저장 폴더]
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const { startServer } = require('./c276-proof.cjs');

const OUT = path.resolve(process.argv[2] || path.join(__dirname, '..', 'docs/captures/c414'));
const PH = { viewport: { width: 796, height: 384 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true };
const PC = { viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 };
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
  for (let i = 0; i < ${o.level}; i++) g.developHogyoku(s, 2000 + i);
  s.shared.soulCrystals = ${o.mat[0]}; s.shared.hogyokuShards = ${o.mat[1]}; s.shared.resonanceEssence = ${o.mat[2]};
  ${o.top ? "for (const t of g.allTracks(s)) { t.rank.ladder = ['player', ...t.rank.ladder.filter((x) => x !== 'player')]; t.rank.history.everRanked = true; }" : ''}
  for (const id of done) s.help.guides[id] = 'done';
  s.hogyoku.tabNotice = false; s.trackNotice = null;
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
    let page = await browser.newPage(PH);
    page.on('pageerror', (e) => proof.errors.push(e.message.slice(0, 200)));
    const shot = async (name) => { await page.waitForTimeout(350); await page.screenshot({ path: path.join(OUT, `${name}.png`) }); proof.shots.push(`${name}.png`); };
    const openHog = async () => { await page.locator('.bha-prop--hogyoku').first().click({ timeout: 5000 }); await page.waitForTimeout(900); };
    const facts = () => page.evaluate(() => ({
      stage: document.querySelector('.bha-hogyoku__stages')?.dataset.stage ?? null,
      title: [...document.querySelectorAll('.bha-panel__title')].map((x) => x.textContent.trim()).slice(0, 4),
      materials: [...document.querySelectorAll('[data-materials] .bha-info__row')].map((r) => r.textContent.replace(/\s+/g, ' ').trim()),
      developDisabled: document.querySelector('[data-sc="hogyoku-develop"]')?.disabled ?? null,
      blocks: [...document.querySelectorAll('.bha-hogyoku-page .bha-faint')].map((p) => p.textContent.trim()).filter((t) => t.startsWith('·')),
      preview: document.querySelector('[data-preview]')?.textContent.trim() ?? null,
      previewDisabled: document.querySelector('[data-sc="hogyoku-preview"]')?.disabled ?? null,
      stepsDone: document.querySelectorAll('[data-level][data-done="true"]').length,
    }));
    const scrollTo = async (sel) => { await page.evaluate((s) => document.querySelector(s)?.scrollIntoView({ block: 'start' }), sel); await page.waitForTimeout(300); };

    // 1) 반각성: 2단계까지 · 재료 일부 → 다음 단계 버튼
    await boot(page, server.url, body({ level: 2, mat: [40, 30, 6] }));
    await openHog(); F.half = await facts();
    await shot('01-half-awake');
    await scrollTo('[aria-label="붕옥 개발 단계"]');
    await shot('02-develop-steps');
    await page.locator('[data-sc="hogyoku-develop"]').click(); await page.waitForTimeout(600);
    F.afterDevelop = await facts();
    // 2) 반각성 5단계 = 공명 필요로 막힘
    await boot(page, server.url, body({ level: 5, mat: [200, 200, 200] }));
    await openHog(); F.halfMax = await facts();
    await shot('03-half-max-needs-resonance');
    // 3) 공명 컷 (방)
    await boot(page, server.url, body({ level: 5, mat: [60, 20, 40], resonance: true, cut: true }));
    F.cut = await page.evaluate(() => document.querySelector('.bha-tut')?.textContent.replace(/\s+/g, ' ').trim().slice(0, 160) ?? null);
    await shot('04-resonance-cut');
    // 4) 공명: 7단계
    await boot(page, server.url, body({ level: 7, mat: [60, 20, 40], resonance: true }));
    await openHog(); F.resonance = await facts();
    await shot('05-resonance');
    // 5) 100% + 1위 = 합체 가능 → 미리보기
    await boot(page, server.url, body({ level: 10, mat: [3, 50, 9], resonance: true, top: true }));
    await openHog(); F.ready = await facts();
    await shot('06-ready-100');
    await scrollTo('[aria-label="초월체 도감"]');
    await shot('07-dex-conditions');
    await page.locator('[data-sc="hogyoku-preview"]').click(); await page.waitForTimeout(900);
    F.confirm = await page.evaluate(() => document.querySelector('[aria-label="합체 미리보기"]')?.textContent.replace(/\s+/g, ' ').trim() ?? null);
    await shot('08-fusion-preview');
    await page.close();
    // 6) PC 한 장 (공명 7단계)
    page = await browser.newPage(PC);
    page.on('pageerror', (e) => proof.errors.push(e.message.slice(0, 200)));
    await boot(page, server.url, body({ level: 7, mat: [60, 20, 40], resonance: true }));
    await openHog();
    await shot('09-pc-resonance');
  } finally {
    fs.writeFileSync(path.join(OUT, 'proof.json'), JSON.stringify(proof, null, 2));
    await browser.close(); server.stop?.();
  }
  console.log(JSON.stringify(proof, null, 1));
  process.exit(0);
})();
