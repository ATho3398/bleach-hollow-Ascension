// C.465 proof (GDD v6.094 12-4): 초월자 스킨 잠금(가방 — 이치고 기본·천년혈전, Unknown) · 혈쇄 이치고(상태·방·전투 사슬) · 무월(종이인형 + 칼 불) · 폰 1장. PC 844×390 · 폰 796×384 1배.
// 실행: node scripts/c465-proof.cjs [저장 폴더]
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const { startServer } = require('./c276-proof.cjs');

const OUT = path.resolve(process.argv[2] || path.join(__dirname, '..', 'docs/captures/c465'));
const PC = { viewport: { width: 844, height: 390 }, deviceScaleFactor: 1 };
const PH = { viewport: { width: 796, height: 384 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function skipTut(page) {
  for (let t = 0; t < 40 && (await page.locator('.bha-tut').count()); t++) {
    const go = page.locator('.bha-tut button.bha-btn--primary:not([disabled])').filter({ visible: true });
    if (await go.count()) await go.first().click({ timeout: 2000 }).catch(() => {});
    else await page.locator('.bha-lcd').first().click({ timeout: 2000 }).catch(() => {});
    await wait(400);
  }
}
async function newGame(page, url, card = 0) {
  const u = `${url}?test=1`;
  await page.goto(u);
  await page.evaluate(() => localStorage.clear());
  await page.goto(u);
  await wait(1200);
  await page.getByRole('button', { name: '새로 시작' }).click();
  await wait(300);
  await page.locator('.bha-slot').first().click();
  await page.getByRole('button', { name: '확인' }).click();
  await wait(300);
  await page.locator('.bha-species__card').nth(card).click();
  await wait(300);
  await page.getByRole('button', { name: '네', exact: true }).click();
  await wait(400);
  const nm = page.locator('[data-ident="name"]');
  if (await nm.count()) {
    await nm.fill('권영');
    await nm.press('Enter');
    await wait(300);
    await page.locator('.bha-ident__gender[data-gender="male"]').click();
    await page.locator('.bha-ident .bha-btn--primary').last().click();
  }
  await wait(2500);
  await skipTut(page);
}
async function back(page) {
  await page.locator('.bha-dev__btn[aria-label="취소"]').first().click({ timeout: 2000 }).catch(() => {});
  await wait(700);
  const no = page.getByRole('button', { name: '아니요', exact: true }).filter({ visible: true });
  if (await no.count()) { await no.first().click({ timeout: 2000 }).catch(() => {}); await wait(400); }
}
async function openTest(page, tabName) {
  await page.getByRole('button', { name: /더보기/ }).first().click({ timeout: 3000 });
  await wait(400);
  await page.getByRole('button', { name: '테스트', exact: true }).first().click({ timeout: 3000 });
  await wait(700);
  await page.locator('.bha-test-page .bha-viewtitle, .bha-test-page [aria-haspopup]').first().click({ timeout: 2000 }).catch(() => {});
  await wait(300);
  await page.getByRole('option', { name: tabName }).or(page.getByRole('menuitemradio', { name: tabName })).or(page.getByRole('button', { name: tabName })).first().click({ timeout: 3000 });
  await wait(600);
}
const calm = (page) => page.evaluate(() => {
  const s = window.__bhaCombat;
  s.enemy.maxHp *= 50; s.enemy.hp = s.enemy.maxHp; s.player.maxHp *= 3; s.player.hp = s.player.maxHp;
  s.spawnTimer = 1e9; s.enemy.attackTimer = 1e9; s.enemy.actionTimer = 1e9; s.params.timeLimitSeconds = 1e6; s.player.attackTimer = 1e9; s.tray = [];
});
const startBattle = async (page) => {
  await openTest(page, '바로 전투');
  await page.getByRole('button', { name: '전투 들어가기' }).first().click({ timeout: 3000 });
  await wait(800);
  const ok = page.getByRole('button', { name: '확인', exact: true }).filter({ visible: true });
  if (await ok.count()) await ok.last().click({ timeout: 3000 });
  await page.waitForFunction(() => !!window.__bhaCombat && window.__bhaCombat.tick > 5, null, { timeout: 15000 });
  await calm(page);
};

async function openSkinChar(page) {
  await page.locator('.bha-prop--chest').first().click();
  await wait(1000);
  await skipTut(page);
  await page.locator('.bha-chest-page .bha-lcdpage__aside [role="tab"][data-tab="skin"]').first().click();
  await wait(500);
  await page.locator('[aria-label="스킨 종류"] [data-tab="character"]').first().click();
  await wait(500);
  await page.locator('[aria-label="스킨 중분류"] [data-tab="transcendent"]').first().click().catch(() => {});
  await wait(500);
}
const skinFacts = (page) => page.evaluate(() => ({
  note: document.querySelector('.bha-skinpick__lock')?.textContent ?? null,
  cards: [...document.querySelectorAll('.bha-itemcard')].map((c) => `${c.classList.contains('is-locked') ? '[잠김] ' : c.classList.contains('is-worn') ? '[착용] ' : ''}${c.querySelector('.bha-itemcard__name')?.textContent ?? ''}`),
}));
const toast = (page) => page.evaluate(() => [...document.querySelectorAll('.bha-toast, [class*="toast"]')].map((t) => t.textContent.replace(/\s+/g, ' ').trim()).filter(Boolean).slice(-1)[0] ?? null);
const heroFacts = (page) => page.evaluate(() => {
  const cs = [...document.querySelectorAll('.bha-unit--me canvas.bha-rigcanvas, .bha-unit--me .bha-hero__body canvas')];
  return cs.map((c) => {
    const r = c.getBoundingClientRect();
    let ink = 0, red = 0;
    try { const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; for (let i = 0; i < d.length; i += 4) if (d[i + 3]) { ink++; if (d[i] > 150 && d[i + 1] < 120) red++; } } catch { /* */ }
    return { cls: c.className, hidden: !!c.closest('[hidden]'), rect: [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)], ink, red };
  });
});
async function toIchigo(page, server) {
  await newGame(page, server.url, 0);
  await openTest(page, '붕옥·초월자');
  await page.getByRole('button', { name: /^이치고/ }).first().click({ timeout: 3000 });
  await wait(2500); await skipTut(page);
}
async function setMode(page, mode) {
  await page.locator('.bha-room__status').first().click({ timeout: 4000 }); await wait(1000);
  const seg = page.locator(`[data-sc="kit-mode-${mode}"]`).first();
  await seg.scrollIntoViewIfNeeded().catch(() => {});
  await seg.click({ timeout: 3000 }); await wait(1000);
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const server = await startServer();
  const browser = await chromium.launch();
  const proof = { errors: [], shots: [], facts: {} };
  const shot = async (page, name) => { await page.screenshot({ path: path.join(OUT, `${name}.png`) }); proof.shots.push(`${name}.png`); };
  const step = async (name, fn) => { try { await fn(); } catch (e) { proof.errors.push(`${name}: ${String(e).slice(0, 300)}`); } };
  try {
    // 1) 이치고 — 가방 스킨(기본 모드: 전부 잠김) → 상태 화면 천년혈전 → 혈쇄 자동 교체(상태·방·가방) → 전투(사슬) → 무월(칼 불)
    {
      const ctx = await browser.newContext(PC);
      const page = await ctx.newPage();
      page.on('pageerror', (e) => proof.errors.push(`ichigo: ${e.message.slice(0, 200)}`));
      await toIchigo(page, server);
      await step('bag-basic', async () => {
        await openSkinChar(page);
        proof.facts.bagBasic = await skinFacts(page);
        await shot(page, '01-pc-bag-ichigo-basic');
        await back(page); await back(page);
      });
      await step('status-tybw', async () => {
        await setMode(page, 'tybw');
        await page.locator('[data-sc="kit-mode-tybw"]').first().scrollIntoViewIfNeeded().catch(() => {});
        await page.evaluate(() => document.querySelector('.bha-lcdpage__main, .bha-status')?.scrollTo?.(0, 0));
        await wait(1500);
        proof.facts.statusSkin = await page.evaluate(() => JSON.parse(localStorage.getItem(Object.keys(localStorage).find((k) => /slot|save/i.test(k) && localStorage.getItem(k)?.includes('"transcendentId"')) ?? '') ?? 'null')?.skin ?? 'n/a');
        await shot(page, '02-pc-status-bloodchain');
        await back(page);
        await wait(1500);
        await shot(page, '03-pc-room-bloodchain');
      });
      await step('bag-tybw', async () => {
        await openSkinChar(page);
        proof.facts.bagTybw = await skinFacts(page);
        await shot(page, '04-pc-bag-ichigo-tybw');
        const locked = page.locator('.bha-itemcard.is-locked').first();
        if (await locked.count()) { await locked.click({ timeout: 2000 }); await wait(400); proof.facts.lockedToast = await toast(page); await shot(page, '05-pc-bag-locked-toast'); }
        await wait(2600);
        await back(page); await back(page);
      });
      await step('battle-bloodchain', async () => {
        await startBattle(page);
        await wait(1500);
        proof.facts.battleBloodchain = await heroFacts(page);
        await shot(page, '06-pc-battle-bloodchain');
      });
      await ctx.close();
    }
    // 2) 무월 — 이치고 기본 모드에서 무월수련 가득 → 해방 → 무월(종이인형 + 인형 불꽃)
    {
      const ctx = await browser.newContext(PC);
      const page = await ctx.newPage();
      page.on('pageerror', (e) => proof.errors.push(`mugetsu: ${e.message.slice(0, 200)}`));
      await toIchigo(page, server);
      await step('mugetsu', async () => {
        await startBattle(page);
        await page.evaluate(() => { const s = window.__bhaCombat; s.kit.risk = 0; s.kit.mastery = 100; s.tray = []; });
        await wait(500);
        await page.locator('.bha-v2herolib').first().click({ timeout: 3000, force: true });
        await wait(2500);
        proof.facts.mugetsuIdle = { second: await page.evaluate(() => window.__bhaCombat.kit.second), canvases: await heroFacts(page) };
        await shot(page, '07-pc-battle-mugetsu');
        await page.evaluate(() => { window.__bhaCombat.player.attackTimer = 1; });
        await wait(330);
        await shot(page, '08-pc-battle-mugetsu-attack');
      });
      await ctx.close();
    }
    // 3) Unknown;03398 — 기본 ↔ 디버깅만, 나머지 잠김
    {
      const ctx = await browser.newContext(PC);
      const page = await ctx.newPage();
      page.on('pageerror', (e) => proof.errors.push(`unknown: ${e.message.slice(0, 200)}`));
      await newGame(page, server.url, 0);
      await step('unknown', async () => {
        await openTest(page, '붕옥·초월자');
        await page.getByRole('button', { name: /^Unknown/ }).first().click({ timeout: 3000 });
        await wait(2500); await skipTut(page);
        await openSkinChar(page);
        proof.facts.bagUnknown = await skinFacts(page);
        await shot(page, '09-pc-bag-unknown');
      });
      await ctx.close();
    }
    // 4) 폰: 이치고 천년혈전 가방
    {
      const ctx = await browser.newContext(PH);
      const page = await ctx.newPage();
      page.on('pageerror', (e) => proof.errors.push(`phone: ${e.message.slice(0, 200)}`));
      await toIchigo(page, server);
      await step('phone', async () => {
        await setMode(page, 'tybw');
        await back(page);
        await openSkinChar(page);
        proof.facts.phoneBag = await skinFacts(page);
        await shot(page, '10-phone-bag-ichigo-tybw');
      });
      await ctx.close();
    }
  } catch (e) {
    proof.errors.push(String(e).slice(0, 400));
    for (const c of browser.contexts()) for (const pg of c.pages()) await pg.screenshot({ path: path.join(OUT, '_err.png') }).catch(() => {});
  } finally {
    fs.writeFileSync(path.join(OUT, 'proof.json'), JSON.stringify(proof, null, 2));
    await browser.close(); server.stop?.();
    console.log(JSON.stringify(proof, null, 1));
    process.exit(0);
  }
})();
