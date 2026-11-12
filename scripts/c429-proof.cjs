// C.429 proof (GDD 12-4 v6.028, 코딩281): 초월자 = 완전한 3번째 캐릭터 — 합체 직후 초월자 방 · 트랙 전환 · 초월자 상태 · 초월자 모험 전투. PC 844×390 + 폰 796×384, 1배
// 실행: node scripts/c429-proof.cjs [저장 폴더]
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const { startServer } = require('./c276-proof.cjs');

const OUT = path.resolve(process.argv[2] || path.join(__dirname, '..', 'docs/captures/c429'));
const PH = { viewport: { width: 796, height: 384 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true };
const PC = { viewport: { width: 844, height: 390 }, deviceScaleFactor: 1 };
const DONE = ['first-run', 'first-run-room', 'birth', 'recover', 'home-intro', 'recover-cure', 'tile-intro', 'tile-plan', 'tile-draw', 'unlock-gear', 'unlock-battle-item', 'unlock-instinct', 'unlock-rank', 'unlock-accessory', 'unlock-pet', 'unlock-sortie', 'hogyoku-appear', 'hogyoku-resonance'];

async function boot(page, url) {
  await page.goto(url); await page.waitForTimeout(600);
  const fused = await page.evaluate(async (done) => {
    localStorage.clear();
    const g = await import('/src/game.ts');
    const st = await import('/src/data/story/index.ts');
    const s = g.newSaveData('hollow', Date.now());
    s.name = '권영'; s.help.tutorialSeen = true; s.lastSeenAt = Date.now();
    for (const id of done) s.help.guides[id] = 'done';
    for (const id of ['tiles', 'gear', 'battleItem', 'instinct', 'rankBattle']) s.shared.unlocks[id] = 0;
    const fin = (t, formId, ev) => { t.evolution.tierIndex = 3; t.evolution.formHistory = ['t2:base', 't3:fire', formId]; t.evolution.formId = formId; t.evolution.ev = ev; t.rank.ladder = ['player', ...t.rank.ladder.filter((x) => x !== 'player')]; t.rank.history.everRanked = true; };
    fin(s, 't4:fire:physical', { hp: 60, atk: 50, int: 10, def: 30, spr: 10, spd: 20 });
    s.build.owned = ['t-fire-a', 't-water-b']; s.build.slots = ['t-fire-a', null, null]; s.build.enhance = { fire: 40 };
    // 두 종족 스토리 전부 = 두 번째 캐릭터 + 공명
    const clear = (fid) => { const p = (s.story[fid] ??= g.newStoryProgress()); p.chapters = st.STORY_CHAPTERS.map((c) => c.id); };
    clear('hollow'); g.checkTrackOpen(s, Date.now());
    const o = s.otherTracks[0];
    if (o) { fin(o, 't4:water:special', { hp: 20, atk: 70, int: 40, def: 10, spr: 20, spd: 30 }); o.build.owned = ['t-water-a']; o.build.slots = ['t-water-a', null, null]; o.build.enhance = { water: 60 }; clear(o.factionId); }
    g.checkTrackOpen(s, Date.now());
    s.shared.soulCrystals = 9999; s.shared.hogyokuShards = 9999; s.shared.resonanceEssence = 9999;
    for (const id of ['soul', 'shard', 'essence']) while (g.developHogyoku(s, id, Date.now())) { /* 50강 */ }
    s.hogyoku.tabNotice = false; s.trackNotice = null;
    const r = g.performFusion(s, Date.now());
    g.writeSave(localStorage, s);
    return { ok: r.ok, missing: r.ok ? null : r.missing, def: r.ok ? r.def.name : null, tracks: g.allTracks(s).map((t) => g.trackIdOf(t)), ev: s.evolution.ev, owned: s.build.owned, slots: s.build.slots, enhance: s.build.enhance, star: s.difficulty.unlocked };
  }, DONE);
  await page.goto(url); await page.waitForTimeout(1200);
  await page.getByRole('button', { name: /이어하기/ }).first().click({ timeout: 5000 }); await page.waitForTimeout(2200);
  return fused;
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
      const shot = async (name, wait = 350) => { await page.waitForTimeout(wait); await page.screenshot({ path: path.join(OUT, `${String(n++).padStart(2, '0')}-${dk}-${name}.png`) }); proof.shots.push(`${dk}-${name}`); };
      F[`${dk}-fusion`] = await boot(page, server.url);
      F[`${dk}-room`] = await page.evaluate(() => ({
        screen: document.querySelector('[data-screen]')?.dataset.screen ?? null,
        name: document.querySelector('.bha-room__name')?.textContent.replace(/\s+/g, ' ').trim() ?? null,
        toast: [...document.querySelectorAll('.bha-toast')].map((t) => t.textContent.replace(/\s+/g, ' ').trim()).join(' | '),
      }));
      await page.waitForTimeout(1800);
      F[`${dk}-toast`] = await page.evaluate(() => [...document.querySelectorAll('.bha-toast')].map((t) => t.textContent.replace(/\s+/g, ' ').trim()).join(' | '));
      await shot('room-transcendent', 200);
      // 상태 화면 (초월자)
      await page.locator('.bha-room__status').first().click({ timeout: 3000 });
      await page.waitForTimeout(900);
      F[`${dk}-status`] = await page.evaluate(() => ({ rebirth: [...document.querySelectorAll('[data-sc="rebirth"]')].map((b) => `${b.textContent.trim()}${b.disabled ? '(off)' : ''}`) }));
      await shot('status');
      const reopen = async () => { await page.goto(server.url); await page.waitForTimeout(1200); await page.getByRole('button', { name: /이어하기/ }).first().click({ timeout: 5000 }); await page.waitForTimeout(2000); };
      // 트랙 전환 = ··· 더보기: 초월자 → 호로로 바꾼 뒤 더보기에 '초월자 ○○' 칸
      await reopen();
      const moreItems = () => page.evaluate(() => [...document.querySelectorAll('.bha-homedock button')].map((b) => b.textContent.replace(/\s+/g, ' ').trim()).filter((x) => /트랙|초월자/.test(x)));
      await page.locator('[data-dock="more"]').first().click(); await page.waitForTimeout(500);
      F[`${dk}-more-transcendent`] = await moreItems();
      await page.locator('.bha-homedock button', { hasText: '호로 트랙' }).first().click(); await page.waitForTimeout(1500);
      await page.locator('[data-dock="more"]').first().click(); await page.waitForTimeout(500);
      F[`${dk}-more-hollow`] = await moreItems();
      await shot('track-switch');
      await page.locator('.bha-homedock button', { hasText: '초월자' }).first().click(); await page.waitForTimeout(1500);
      F[`${dk}-back-name`] = await page.evaluate(() => document.querySelector('.bha-room__name')?.textContent.replace(/\s+/g, ' ').trim() ?? null);
      await page.locator('.bha-prop--outside').first().click({ timeout: 4000 }); await page.waitForTimeout(1500);
      F[`${dk}-worldmap-rank`] = await page.evaluate(() => document.querySelector('.bha-worldmap [data-place="rank"]')?.outerHTML.slice(0, 200) ?? null);
      await page.locator('.bha-worldmap [data-place="adventure"]').first().click(); await page.waitForTimeout(2200);
      F[`${dk}-depart`] = await page.evaluate(() => ({
        screen: document.querySelector('[data-screen]')?.dataset.screen ?? null,
        tabs: [...document.querySelectorAll('[role="tab"]')].map((b) => b.textContent.trim()),
        stars: [...document.querySelectorAll('[data-star], .bha-diff button')].map((b) => `${b.textContent.trim()}${b.disabled ? '(off)' : ''}`).slice(0, 8),
      }));
      const go = page.getByRole('button', { name: /출발/ }).last();
      await go.click({ timeout: 4000 }); await page.waitForTimeout(1200);
      await page.getByRole('button', { name: /^(네|출발|확인)/ }).first().click({ timeout: 1500 }).catch(() => {});
      for (let i = 0; i < 40; i++) {
        const sc = await page.evaluate(() => document.querySelector('[data-screen]')?.dataset.screen ?? '');
        if (/battle/.test(sc) || (await page.locator('.bha-battle').count()) > 0) break;
        await page.waitForTimeout(500);
      }
      await page.waitForTimeout(2500);
      F[`${dk}-battle`] = await page.evaluate(() => ({ screen: document.querySelector('[data-screen]')?.dataset.screen ?? null, battle: document.querySelectorAll('.bha-battle').length }));
      await shot('adventure-battle', 100);
      await page.close();
    }
  } catch (e) {
    proof.errors.push(String(e).slice(0, 400));
  } finally {
    fs.writeFileSync(path.join(OUT, 'proof.json'), JSON.stringify(proof, null, 2));
    await browser.close();
    server.close?.();
    console.log(JSON.stringify(proof, null, 1).slice(0, 5000));
    process.exit(0);
  }
})();
