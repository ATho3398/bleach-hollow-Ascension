// C.562 proof (GDD 13절 v6.243 '튜토리얼 각본 전투의 블록 = 호로 탄 / 사신 참' — c559-proof 기반): 도움말 '튜토리얼 다시 보기' 체험 전투(첫 모험과 같은 각본)를 열어
// ④ 위기 블록 1체인 · ⑧ 체인 3체인이 피해가 들어간 프레임에 화면을 멈춰 1배 캡처. 01 사신 ④ 참 1체인 / 02 사신 ⑧ 참 3체인.
// 실행: node scripts/c559-proof.cjs [저장 폴더]
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const { startServer } = require('./c276-proof.cjs');

const OUT = path.resolve(process.argv[2] || path.join(__dirname, '..', 'docs/captures/c562'));
const PC = { viewport: { width: 844, height: 390 }, deviceScaleFactor: 1 };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function seed(page, url, factionId) {
  await page.goto(`${url}?test=1`);
  await page.evaluate(() => localStorage.clear());
  await page.evaluate(async (factionId) => {
    const m = { g: await import('/src/game.ts'), tut: await import('/src/engine/tutorial.ts'), tm: await import('/src/engine/testMode.ts') };
    const slots = await import('/src/saveSlots.ts');
    const store = m.tm.testStorage(localStorage);
    const now = Date.now();
    const s = m.g.newSaveData(factionId, now);
    s.name = '시험';
    s.gender = 'male';
    s.help.tutorialSeen = true;
    for (const id of m.tut.GUIDE_IDS) s.help.guides[id] = 'done';
    s.nest.hunger = 30;
    s.nest.condition = 90;
    slots.writeSlotSave(store, s, 1);
    slots.touchSlot(store, 1, now);
  }, factionId);
  await page.goto(`${url}?test=1`);
  await wait(1500);
  const cont = page.getByRole('button', { name: '이어하기' });
  if (await cont.count()) await cont.click({ timeout: 5000 });
  await wait(2500);
}

async function openDemo(page) {
  for (let i = 0; i < 4 && (await page.locator('.bha-tut').count()); i++) { await page.keyboard.press('Escape'); await wait(300); }
  await page.locator('.bha-lcd').getByRole('button', { name: '더보기' }).first().click({ timeout: 5000 });
  await wait(500);
  await page.getByRole('button', { name: '도움말' }).first().click({ timeout: 5000 });
  await wait(700);
  await page.getByRole('button', { name: '다시 보기' }).first().click({ timeout: 5000 });
  await wait(500);
  await page.getByRole('button', { name: '튜토리얼 다시 보기' }).first().click({ timeout: 5000 });
  await page.waitForFunction(() => !!window.__bhaCombat?.script, null, { timeout: 20000 });
}

/** 각본을 사람처럼 진행하고, 블록을 쓴 단계에서 적 체력이 준 프레임에 멈춰 캡처 */
async function playDemo(page, shots, F, tag) {
  const t0 = Date.now();
  const done = new Set();
  while (Date.now() - t0 < 120000) {
    const L = await page.evaluate(() => {
      const s = window.__bhaCombat;
      const card = document.querySelector('.bha-tut');
      const next = card ? [...card.querySelectorAll('button')].some((b) => /다음|확인|✓/.test(b.textContent || '') || /다음/.test(b.getAttribute('aria-label') || '')) : false;
      return { stage: s?.script?.stage ?? null, status: s?.status ?? null, card: !!card, next, tray: s ? s.tray.map((b) => b.family) : [] };
    });
    if (L.status && L.status !== 'playing') break;
    if (L.card && L.next) {
      await page.evaluate(() => { const c = document.querySelector('.bha-tut'); const b = [...c.querySelectorAll('button')].find((x) => /다음|확인|✓/.test(x.textContent || '') || /다음/.test(x.getAttribute('aria-label') || '')); b?.click(); });
      await wait(250);
      continue;
    }
    if (L.stage === 'lib-now') { await page.locator('[data-sc="liberate"]').first().click({ timeout: 2000, force: true }).catch(() => {}); await wait(250); continue; }
    if (L.stage === 'guard-now') { await page.locator('[data-sc="guard"]').first().click({ timeout: 2000, force: true }).catch(() => {}); await wait(250); continue; }
    const shot = shots[L.stage];
    if (shot && !done.has(L.stage)) {
      done.add(L.stage);
      const r = await page.evaluate(async () => {
        const s = window.__bhaCombat;
        const hp0 = s.enemy.hp;
        const tray = s.tray.map((b) => b.family);
        const p0 = performance.now();
        document.querySelector('[data-sc="block.1"]')?.dispatchEvent(new Event('bha-press'));
        while (performance.now() - p0 < 6000 && s.enemy.hp >= hp0 && s.status === 'playing') await new Promise((res) => requestAnimationFrame(() => res(0)));
        for (const a of document.getAnimations()) a.pause();
        return { tray, ms: Math.round(performance.now() - p0), hp: [Math.round(hp0), Math.round(s.enemy.hp)], stage: s.script?.stage ?? null, status: s.status };
      });
      await page.screenshot({ path: path.join(OUT, shot) });
      await page.evaluate(() => { for (const a of document.getAnimations()) a.play(); });
      F.shots.push({ tag, from: L.stage, file: shot, ...r });
      await wait(400);
      continue;
    }
    if (L.stage === 'hurt' || L.stage === 'chain-use') { await page.evaluate(() => document.querySelector('[data-sc="block.1"]')?.dispatchEvent(new Event('bha-press'))); await wait(250); continue; }
    await wait(40);
  }
  F.end = F.end || {};
  F.end[tag] = await page.evaluate(() => ({ status: window.__bhaCombat?.status ?? null }));
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const server = await startServer();
  const browser = await chromium.launch();
  const F = { errors: [], shots: [] };
  const jobs = [
    ['shinigami', { hurt: '01-shinigami-crisis-cham-chain1.png', 'chain-use': '02-shinigami-chain-cham-chain3.png' }],
  ];
  for (const [fid, shots] of jobs) {
    const page = await (await browser.newContext(PC)).newPage();
    page.on('pageerror', (e) => F.errors.push(`${fid}: ${e.message}`));
    try {
      await seed(page, server.url, fid);
      await openDemo(page);
      await playDemo(page, shots, F, fid);
    } catch (e) {
      F.errors.push(`${fid}: ${String(e).slice(0, 400)}`);
      await page.screenshot({ path: path.join(OUT, `..`, `c562-err-${fid}.png`) }).catch(() => {});
    }
    await page.context().close();
  }
  fs.writeFileSync(path.join(OUT, 'facts.json'), JSON.stringify(F, null, 1));
  console.log(JSON.stringify(F, null, 1));
  await browser.close();
  server.stop();
})();
