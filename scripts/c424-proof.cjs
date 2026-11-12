// C.424 proof (GDD 12-2·15-1, 코딩278): 붕옥·불꽃 도트 맞춤(불꽃 프레임 안 붕옥 16·24) · 배율 1.5 — orbInFlame·orbInBox 로 어긋남 0 확인. 폰 796×384 1배 + PC 1장
// 실행: node scripts/c424-proof.cjs [저장 폴더]
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const { startServer } = require('./c276-proof.cjs');

const OUT = path.resolve(process.argv[2] || path.join(__dirname, '..', 'docs/captures/c424'));
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
    const shot = async (name, wait = 350) => { await page.waitForTimeout(wait); await page.screenshot({ path: path.join(OUT, `${name}.png`) }); proof.shots.push(`${name}.png`); };
    const openHog = async () => { await page.locator('.bha-prop--hogyoku').first().click({ timeout: 5000 }); await page.waitForTimeout(900); };
    const freeze = () => page.evaluate(() => { const f = document.querySelector('.bha-hgorb__flame'); if (f) { f.style.animationPlayState = 'paused'; f.style.animationDelay = `${-(3.5) * 1333 / 16}ms`; } });
    const facts = () => page.evaluate(() => {
      const box = document.querySelector('.bha-hgorb__art');
      const img = document.querySelector('.bha-hgorb__img');
      const fl = document.querySelector('.bha-hgorb__flame');
      const r = (e) => { if (!e) return null; const b = e.getBoundingClientRect(); return [Math.round(b.left), Math.round(b.top), Math.round(b.width), Math.round(b.height)]; };
      return {
        level: document.querySelector('.bha-hgorb')?.dataset.level ?? null,
        band: box?.dataset.band ?? null, art: box?.dataset.art ?? null,
        box: r(box), img: r(img), imgSrc: img?.getAttribute('src') ?? null, flame: fl?.dataset.flame ?? null, flameRect: r(fl),
        flameZ: fl ? getComputedStyle(fl).zIndex : null, scale: getComputedStyle(document.querySelector('.bha-hogyoku-page')).getPropertyValue('--hg-s').trim(),
        orbInFlame: img && fl ? [(img.getBoundingClientRect().left - fl.getBoundingClientRect().left) / 1.5, (img.getBoundingClientRect().top - fl.getBoundingClientRect().top) / 1.5] : null,
        orbInBox: img && box ? [(img.getBoundingClientRect().left - box.getBoundingClientRect().left) / 1.5, (img.getBoundingClientRect().top - box.getBoundingClientRect().top) / 1.5] : null, imgZ: img ? getComputedStyle(img).zIndex : null,
        mats: [...document.querySelectorAll('.bha-hgmat')].map((b) => `${b.dataset.material}:${b.textContent.trim()}`),
        list: [...document.querySelectorAll('.bha-hglist__item')].map((b) => `${b.dataset.sel}${b.classList.contains('is-on') ? '*' : ''}`),
        detail: document.querySelector('.bha-hgdetail')?.dataset.sel ?? null,
      };
    });
    const levels = [[0, 'p00', [7, 30, 2]], [2, 'p20', [40, 30, 6]], [4, 'p40', [40, 30, 6]], [6, 'p60', [60, 20, 40]], [8, 'p80', [60, 20, 40]], [10, 'p100', [3, 50, 9]]];
    let n = 1;
    for (const [lv, key, mat] of levels) {
      await boot(page, server.url, body({ level: lv, mat, resonance: lv > 5, top: lv === 10 }));
      await openHog(); await freeze(); F[key] = await facts();
      await shot(`${String(n++).padStart(2, '0')}-hogyoku-${lv * 10}`);
    }
    // 재료 칸 누르기 → 상세 = 재료 (100% 화면)
    await page.locator('.bha-hgmat--shard').click(); await page.waitForTimeout(300); await freeze();
    F.material = await facts();
    F.materialText = await page.evaluate(() => document.querySelector('.bha-hgdetail')?.textContent.replace(/\s+/g, ' ').trim().slice(0, 200));
    await shot(`${String(n++).padStart(2, '0')}-material-detail`);
    // 목록 '합체' → 상세 = 합체
    await page.locator('.bha-hglist__item[data-sel="fusion"]').click(); await page.waitForTimeout(300); await freeze();
    F.fusion = await facts();
    await shot(`${String(n++).padStart(2, '0')}-list-fusion`);
    F.sizes = await page.evaluate(() => ['.bha-lcdpage__body', '.bha-lcdpage__col--right', '.bha-hgright', '.bha-hglist', '.bha-hgdetail', '.bha-lcd, .bha-app'].map((q) => { const e = document.querySelector(q); if (!e) return q + ':-'; const b = e.getBoundingClientRect(); return `${q}: top ${Math.round(b.top)} h ${Math.round(b.height)} bottom ${Math.round(b.bottom)}`; }));
    await page.close();
    page = await browser.newPage(PC);
    page.on('pageerror', (e) => proof.errors.push(e.message.slice(0, 200)));
    await boot(page, server.url, body({ level: 8, mat: [60, 20, 40], resonance: true }));
    await openHog(); await page.locator('.bha-hglist__item[data-sel="develop"]').click(); await freeze(); F.pc = await facts();
    await shot(`${String(n++).padStart(2, '0')}-pc-80`);
  } finally {
    fs.writeFileSync(path.join(OUT, 'proof.json'), JSON.stringify(proof, null, 2));
    await browser.close(); server.stop?.();
  }
  console.log(JSON.stringify(proof, null, 1));
  process.exit(0);
})();
