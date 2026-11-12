// C.431 proof (GDD 12-4 v6.028, 코딩281): 초월자 = 완전한 3번째 캐릭터 — 합체 직후 초월자 방 · 트랙 전환 · 초월자 상태 · 초월자 모험 전투. PC 844×390 + 폰 796×384, 1배
// 실행: node scripts/c431-proof.cjs [저장 폴더]
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const { startServer } = require('./c276-proof.cjs');

const OUT = path.resolve(process.argv[2] || path.join(__dirname, '..', 'docs/captures/c431'));
const PH = { viewport: { width: 796, height: 384 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true };
const PC = { viewport: { width: 844, height: 390 }, deviceScaleFactor: 1 };
const DONE = ['first-run', 'first-run-room', 'birth', 'recover', 'home-intro', 'recover-cure', 'tile-intro', 'tile-plan', 'tile-draw', 'unlock-gear', 'unlock-battle-item', 'unlock-instinct', 'unlock-rank', 'unlock-accessory', 'unlock-pet', 'unlock-sortie', 'hogyoku-appear', 'hogyoku-resonance'];

async function boot(page, url, mode) {
  await page.goto(url); await page.waitForTimeout(600);
  const fused = await page.evaluate(async ([done, mode]) => {
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
    if (mode === 'ready') { g.writeSave(localStorage, s); return { ready: true, preview: g.fusionPreview(s).def?.name }; }
    const r = g.performFusion(s, Date.now());
    // 캡처용: 지금 초월자 = 태초, 도감 = 태초 + Unknown;03398
    s.transcendentId = 'rift-wanderer'; s.trackNotice = null;
    s.transcendentDex = [{ id: 'zero-sage', at: 1, fusionIndex: 1 }, { id: 'rift-wanderer', at: 2, fusionIndex: 2 }];
    g.writeSave(localStorage, s);
    return { ok: r.ok, missing: r.ok ? null : r.missing, def: r.ok ? r.def.name : null, tracks: g.allTracks(s).map((t) => g.trackIdOf(t)), ev: s.evolution.ev, owned: s.build.owned, slots: s.build.slots, enhance: s.build.enhance, star: s.difficulty.unlocked };
  }, [DONE, mode]);
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
      const shot = async (name, wait = 300) => { await page.waitForTimeout(wait); await page.screenshot({ path: path.join(OUT, `${String(n++).padStart(2, '0')}-${dk}-${name}.png`) }); proof.shots.push(`${dk}-${name}`); };
      const freeze = (on) => page.evaluate(async (v) => (await import('/src/ui/bha/glitchName.ts')).setGlitchFrozen(v), on);
      F[`${dk}-fusion`] = (await boot(page, server.url, 'fused')).ok;
      await page.waitForTimeout(2500);
      F[`${dk}-room`] = await page.evaluate(() => {
        const im = document.querySelector('.bha-char img');
        return { mosaic: im?.classList.contains('bha-mosaic') ?? false, live: im?.dataset.mosaicLive ?? null, w: im?.naturalWidth ?? 0, srcHead: (im?.getAttribute('src') ?? '').slice(0, 22) };
      });
      await shot('room-mosaic-base', 50);
      if (dk === 'pc') {
        await freeze(true); await page.waitForTimeout(300);
        await shot('room-mosaic-glitch', 50);
        await freeze(false);
        // 도감 상세
        await page.locator('[data-prop="hogyoku"], .bha-prop--hogyoku').first().click({ timeout: 4000 }); await page.waitForTimeout(1200);
        await page.getByRole('button', { name: /초월자 도감/ }).first().click({ timeout: 4000 }); await page.waitForTimeout(1200);
        await page.locator('[data-transcendent="rift-wanderer"]').first().click(); await page.waitForTimeout(1500);
        F.detail = await page.evaluate(() => [...document.querySelectorAll('.bha-itemdialog img.bha-mosaic')].map((i) => i.naturalWidth));
        await shot('dex-detail-mosaic');
        // 모험 전투
        await page.goto(server.url); await page.waitForTimeout(1200);
        await page.getByRole('button', { name: /이어하기/ }).first().click({ timeout: 5000 }); await page.waitForTimeout(2000);
        await page.locator('.bha-prop--outside').first().click({ timeout: 4000 }); await page.waitForTimeout(1500);
        await page.locator('.bha-worldmap [data-place="adventure"]').first().click(); await page.waitForTimeout(2200);
        await page.getByRole('button', { name: /출발/ }).last().click({ timeout: 4000 }); await page.waitForTimeout(1200);
        await page.getByRole('button', { name: /^(네|출발|확인)/ }).first().click({ timeout: 1500 }).catch(() => {});
        for (let i = 0; i < 40; i++) { if ((await page.locator('.bha-battle').count()) > 0) break; await page.waitForTimeout(500); }
        await page.waitForTimeout(3000);
        F.battle = await page.evaluate(() => [...document.querySelectorAll('img.bha-mosaic')].length);
        await shot('battle-mosaic', 50);
      }
      await page.close();
    }
  } catch (e) {
    proof.errors.push(String(e).slice(0, 400));
  } finally {
    fs.writeFileSync(path.join(OUT, 'proof.json'), JSON.stringify(proof, null, 2));
    await browser.close();
    server.close?.();
    console.log(JSON.stringify(proof, null, 1).slice(0, 3000));
    process.exit(0);
  }
})();
