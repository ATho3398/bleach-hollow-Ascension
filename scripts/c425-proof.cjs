// C.425 proof (GDD 12-2 v6.013, 코딩279): 붕옥 창 재배치 — 붕옥 선택·재료 선택·합체 창·초월체 도감 창. PC 844×390 + 폰 796×384, 1배
// 실행: node scripts/c425-proof.cjs [저장 폴더]
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const { startServer } = require('./c276-proof.cjs');

const OUT = path.resolve(process.argv[2] || path.join(__dirname, '..', 'docs/captures/c425'));
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
  ${o.dex ? "s.transcendentDex.push({ id: 'ichigo', at: 3000, fusionIndex: 1 });" : ''}
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
    let n = 1;
    for (const [dk, opts] of [['pc', PC], ['phone', PH]]) {
      const page = await browser.newPage(opts);
      page.on('pageerror', (e) => proof.errors.push(e.message.slice(0, 200)));
      const shot = async (name, wait = 350) => { await page.waitForTimeout(wait); await page.screenshot({ path: path.join(OUT, `${name}.png`) }); proof.shots.push(`${name}.png`); };
      const facts = () => page.evaluate(() => {
        const r = (q) => { const e = document.querySelector(q); if (!e) return null; const b = e.getBoundingClientRect(); return [Math.round(b.left), Math.round(b.top), Math.round(b.width), Math.round(b.height)]; };
        const txt = (q) => document.querySelector(q)?.textContent.replace(/\s+/g, ' ').trim().slice(0, 300) ?? null;
        // 한 글자씩 세로 깨짐 검사: 상세 줄 이름표 폭이 한 글자 폭보다 좁은 것
        const narrow = [...document.querySelectorAll('.bha-hgrow__label')].filter((e) => e.getBoundingClientRect().height > 30).map((e) => e.textContent);
        return {
          detailSel: document.querySelector('.bha-hgdetail')?.dataset.sel ?? null, percent: document.querySelector('.bha-hgorb')?.dataset.percent ?? null, mats: [...document.querySelectorAll('.bha-hgmat')].map((b) => `${b.dataset.material}:${b.dataset.level}${b.classList.contains('is-on') ? '*' : ''}`), foot: [...document.querySelectorAll('.bha-hgfoot button')].map((b) => `${b.textContent.trim()}${b.disabled ? '(off)' : ''}`), on: [...document.querySelectorAll('.is-on[data-sel]')].map((e) => e.dataset.sel),
          list: document.querySelectorAll('.bha-hglist').length, total: txt('.bha-hgorb__total'), detail: txt('.bha-hgdetail'),
          footRect: r('.bha-hgfoot'), app: r('.bha-lcdpage__body'), tabs: [...document.querySelectorAll('.bha-lcdpage__aside button')].map((b) => b.textContent.trim()),
          pair: [...document.querySelectorAll('.bha-hgpair__card')].map((c) => c.dataset.faction), cards: document.querySelectorAll('.bha-dexcard').length, narrowLabels: narrow,
          orb: document.querySelectorAll('.bha-hgorb').length,
        };
      });
      await boot(page, server.url, body({ tracks: { soul: 40, shard: 30, essence: 20 }, mat: [12, 6, 2], resonance: true, top: false, dex: true }));
      await page.locator('.bha-prop--hogyoku').first().click({ timeout: 5000 }); await page.waitForTimeout(900);
      F[`${dk}-track`] = await facts();
      await shot(`${String(n++).padStart(2, '0')}-${dk}-hogyoku-track-soul`);
      await page.locator('.bha-hgorb__art').click(); await page.waitForTimeout(300);
      F[`${dk}-orb`] = await facts();
      await shot(`${String(n++).padStart(2, '0')}-${dk}-hogyoku-orb-summary`);
      if (dk === 'phone') {
        await page.locator('[data-sc="hogyoku-develop-all"]').click(); await page.waitForTimeout(400);
        F[`${dk}-developAllConfirm`] = await page.evaluate(() => document.querySelector('.bha-confirm')?.textContent.replace(/\s+/g, ' ').trim() ?? null);
        await shot(`${String(n++).padStart(2, '0')}-${dk}-develop-all-confirm`);
        await page.locator('.bha-confirm button', { hasText: '일괄 강화' }).click(); await page.waitForTimeout(600);
        F[`${dk}-afterAll`] = await page.evaluate(() => [...document.querySelectorAll('.bha-hgmat')].map((b) => `${b.dataset.material}:${b.dataset.level}`).join(' '));
      }
      await page.locator('[data-sc="hogyoku-fusion"]').click(); await page.waitForTimeout(800);
      F[`${dk}-fusion`] = await facts();
      await shot(`${String(n++).padStart(2, '0')}-${dk}-fusion`);
      if (dk === 'pc') {
        await page.locator('[data-sc="fusion-detail-1"]').click(); await page.waitForTimeout(500);
        F[`${dk}-fusion-detail`] = await page.evaluate(() => document.querySelector('.bha-itemdialog')?.textContent.replace(/\s+/g, ' ').trim().slice(0, 300) ?? null);
        await shot(`${String(n++).padStart(2, '0')}-${dk}-fusion-detail`);
        await page.keyboard.press('Escape'); await page.waitForTimeout(300);
      }
      await page.goBack().catch(() => {}); await page.waitForTimeout(300);
      // 뒤로 = 붕옥 창 (화면 뒤로 버튼)
      const back = page.locator('[data-sc="back"], .bha-back, button[aria-label="뒤로"]').first();
      if (!(await page.locator('.bha-hgorb').count())) await back.click({ timeout: 3000 }).catch(() => {});
      await page.waitForTimeout(600);
      F[`${dk}-backToHogyoku`] = await page.locator('.bha-hgorb').count();
      if (!F[`${dk}-backToHogyoku`]) { await page.locator('.bha-prop--hogyoku').first().click({ timeout: 5000 }).catch(() => {}); await page.waitForTimeout(800); }
      await page.locator('[data-sc="hogyoku-dex"]').click(); await page.waitForTimeout(800);
      F[`${dk}-dex`] = await facts();
      await shot(`${String(n++).padStart(2, '0')}-${dk}-transcendent-dex`);
      await page.close();
    }
  } finally {
    fs.writeFileSync(path.join(OUT, 'proof.json'), JSON.stringify(proof, null, 2));
    await browser.close(); server.stop?.();
  }
  console.log(JSON.stringify(proof, null, 1));
  process.exit(0);
})();
