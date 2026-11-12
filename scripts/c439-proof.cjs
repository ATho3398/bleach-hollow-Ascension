// C.439 proof (GDD 12-2 v6.046 합체 창 배치 다시): 부모 둘 → 가운데 결과 + 조건 칩 띠. 합체 가능 · 막힘 · 이미 있는 조합 · 확인 창.
// PC 844×390 + 폰 796×384, 1배. 실행: node scripts/c439-proof.cjs [저장 폴더]
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const { startServer } = require('./c276-proof.cjs');

const OUT = path.resolve(process.argv[2] || path.join(__dirname, '..', 'docs/captures/c439'));
const PC = { viewport: { width: 844, height: 390 }, deviceScaleFactor: 1 };
const PH = { viewport: { width: 796, height: 384 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true };
const DONE = ['first-run', 'first-run-room', 'birth', 'recover', 'home-intro', 'recover-cure', 'tile-intro', 'tile-plan', 'tile-draw', 'unlock-gear', 'unlock-battle-item', 'unlock-instinct', 'unlock-rank', 'unlock-accessory', 'unlock-pet', 'unlock-sortie', 'hogyoku-appear', 'hogyoku-resonance'];

// mode: ready = 물리+혼합(Unknown;03398, 조건 다 채움) · blocked = 혼합+혼합(태초, 개발 일부·사신 등급 1위 아님) · owned = 물리+물리(이치고, 이미 가짐)
async function boot(page, url, mode) {
  await page.goto(url); await page.waitForTimeout(600);
  const r = await page.evaluate(async ([done, mode]) => {
    localStorage.clear();
    const g = await import('/src/game.ts');
    const st = await import('/src/data/story/index.ts');
    const s = g.newSaveData('hollow', Date.now());
    s.name = '권영'; s.help.tutorialSeen = true; s.lastSeenAt = Date.now();
    for (const id of done) s.help.guides[id] = 'done';
    for (const id of ['tiles', 'gear', 'battleItem', 'instinct', 'rankBattle']) s.shared.unlocks[id] = 0;
    const fin = (t, formId, top) => { t.evolution.tierIndex = 3; t.evolution.formHistory = ['t2:base', 't3:fire', formId]; t.evolution.formId = formId; if (top) { t.rank.ladder = ['player', ...t.rank.ladder.filter((x) => x !== 'player')]; t.rank.history.everRanked = true; } };
    const forms = { ready: ['t4:fire:physical', 't4:fire:mixed'], blocked: ['t4:fire:mixed', 't4:earth:mixed'], owned: ['t4:fire:physical', 't4:earth:physical'] }[mode];
    fin(s, forms[0], true);
    const clear = (fid) => { const p = (s.story[fid] ??= g.newStoryProgress()); p.chapters = st.STORY_CHAPTERS.map((c) => c.id); };
    clear('hollow'); g.checkTrackOpen(s, Date.now());
    const o = s.otherTracks[0];
    if (o) { fin(o, forms[1], mode !== 'blocked'); clear(o.factionId); }
    g.checkTrackOpen(s, Date.now());
    s.shared.soulCrystals = 9999; s.shared.hogyokuShards = 9999; s.shared.resonanceEssence = 9999;
    const ids = mode === 'blocked' ? ['soul'] : ['soul', 'shard', 'essence'];
    for (const id of ids) while (g.developHogyoku(s, id, Date.now())) { /* 50강 */ }
    s.hogyoku.tabNotice = false; s.trackNotice = null;
    const pv = g.fusionPreview(s);
    if (mode === 'owned' && pv.def) s.transcendentDex = [{ id: pv.def.id, at: 1, fusionIndex: 1 }];
    g.writeSave(localStorage, s);
    return { preview: pv.def?.name ?? null, gate: g.fusionGate(s) };
  }, [DONE, mode]);
  await page.goto(url); await page.waitForTimeout(1200);
  await page.getByRole('button', { name: /이어하기/ }).first().click({ timeout: 5000 }); await page.waitForTimeout(2200);
  await page.locator('[data-prop="hogyoku"]').first().click({ timeout: 3000 }); await page.waitForTimeout(900);
  await page.locator('[data-sc="hogyoku-fusion"]').first().click({ timeout: 3000 }); await page.waitForTimeout(900);
  return r;
}

/** 글자 잘림·겹침 점검: 합체 창 안 글자 요소가 자기 칸 밖으로 넘치는지 · 카드끼리 겹치는지 · 한 글자 세로 깨짐(글자 높이가 폭의 3배 넘는 2글자 이상) */
async function layoutCheck(page) {
  return page.evaluate(() => {
    const bad = [];
    const root = document.querySelector('.bha-hgfusion-page');
    if (!root) return ['no page'];
    const page = root.getBoundingClientRect();
    for (const e of root.querySelectorAll('.bha-fuse__parent, .bha-fuse__result, .bha-fusestrip, .bha-fusestrip__go, .bha-fusecond')) {
      const r = e.getBoundingClientRect();
      if (r.right > page.right + 1 || r.bottom > page.bottom + 1 || r.left < page.left - 1) bad.push(`out:${e.className}`);
    }
    for (const e of root.querySelectorAll('.bha-fuse b, .bha-fuse small, .bha-fuse li, .bha-fuse .bha-chip, .bha-fusecond, .bha-fusestrip__why, .bha-btn__label, .bha-fuse__fac')) {
      const r = e.getBoundingClientRect();
      const t = (e.textContent ?? '').trim();
      if (t.length >= 2 && r.height > r.width * 3 && r.width > 0) bad.push(`vertical:${t}`);
      if (r.height > 40 && !e.matches('.bha-fuse__gains li')) bad.push(`tall:${t}:${Math.round(r.height)}`);
    }
    const cards = [...root.querySelectorAll('.bha-fuse__parent, .bha-fuse__result')].map((e) => e.getBoundingClientRect());
    for (let i = 1; i < cards.length; i++) if (cards[i].left < cards[i - 1].right - 1) bad.push(`overlap:${i}`);
    return bad;
  });
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const server = await startServer();
  const browser = await chromium.launch();
  const proof = { errors: [], shots: [], facts: {} };
  let n = 1;
  try {
    for (const [dk, opts] of [['pc', PC], ['phone', PH]]) {
      const ctx = await browser.newContext({ ...opts, reducedMotion: 'reduce' });
      const page = await ctx.newPage();
      page.on('pageerror', (e) => proof.errors.push(`${dk}: ${e.message.slice(0, 200)}`));
      const shot = async (name) => { const f = `${String(n++).padStart(2, '0')}-${dk}-${name}.png`; await page.waitForTimeout(250); await page.screenshot({ path: path.join(OUT, f) }); proof.shots.push(f); };
      const freeze = () => page.evaluate(async () => (await import('/src/ui/bha/glitchName.ts')).setGlitchFrozen?.(true)).catch(() => {});
      const facts = (proof.facts[dk] = {});
      const read = () => page.evaluate(() => ({
        result: document.querySelector('.bha-fuse__result')?.textContent ?? null,
        owned: document.querySelector('.bha-fuse__result')?.getAttribute('data-owned'),
        parents: [...document.querySelectorAll('.bha-fuse__parent')].map((e) => e.textContent),
        conds: [...document.querySelectorAll('.bha-fusecond')].map((e) => e.textContent),
        why: document.querySelector('.bha-fusestrip__why')?.textContent ?? null,
        go: document.querySelector('[data-sc="hogyoku-preview"]')?.hasAttribute('disabled'),
      }));
      for (const mode of ['ready', 'blocked', 'owned']) {
        facts[mode] = { boot: await boot(page, server.url, mode) };
        await freeze();
        Object.assign(facts[mode], await read(), { layout: await layoutCheck(page) });
        await shot(`fusion-${mode}`);
        if (mode === 'blocked' && dk === 'pc') {
          await page.locator('.bha-fusecond[data-cond="rank"]').click();
          facts[mode].tapRank = await page.locator('.bha-fusestrip__why').textContent();
          await shot('fusion-blocked-chip');
        }
        if (mode === 'ready') {
          await page.locator('[data-sc="hogyoku-preview"]').click({ timeout: 3000 }); await page.waitForTimeout(900);
          await shot('confirm-1');
          if (dk === 'pc') {
            await page.locator('[data-sc="fusion-next"]').click({ timeout: 3000 }); await page.waitForTimeout(700);
            facts.final = await page.evaluate(() => document.querySelector('[role="dialog"], [role="alertdialog"]')?.textContent?.slice(0, 200) ?? null);
            await shot('confirm-2');
          }
        }
      }
      await ctx.close();
    }
  } catch (e) {
    proof.errors.push(String(e).slice(0, 400));
  } finally {
    fs.writeFileSync(path.join(OUT, 'proof.json'), JSON.stringify(proof, null, 2));
    await browser.close();
    server.stop?.();
    console.log(JSON.stringify(proof, null, 1));
    process.exit(0);
  }
})();
