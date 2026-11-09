// C.354 proof (GDD 216장, 코딩252): 탑 강적 층 승리 → 승리 창·결과 '수련권 +1'(폰) · 수련 화면 '수련권 n'(PC) · 방 먹이 직후 숫자 칩(폰·PC). 캡처 1배 4장 docs/captures/c354/
// 실행: node scripts/c354-proof.cjs <주소> [저장 폴더]   (vite 서버는 따로 띄운다)
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..');
const PC = { viewport: { width: 844, height: 390 }, deviceScaleFactor: 1 };
const PH = { viewport: { width: 796, height: 384 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true };
/** 탑 5층(강적)에서 수련권이 나오는 전투 시드 (towerTicketDrop(towerFloor(5), 4) = true — tests/c354 와 같은 굴림) */
const DROP_SEED = 4;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function skipTut(page) {
  for (let t = 0; t < 40 && (await page.locator('.bha-tut').count()); t++) {
    const go = page.locator('.bha-tut button.bha-btn--primary:not([disabled])').filter({ visible: true });
    if (await go.count()) await go.first().click({ timeout: 2000 }).catch(() => {});
    else await page.locator('.bha-lcd').first().click({ timeout: 2000 }).catch(() => {});
    await wait(400);
  }
}
async function patchSave(page, src) {
  await page.evaluate((src) => {
    const f = new Function('t', 'shared', src);
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      const raw = localStorage.getItem(k);
      if (!raw || !raw.includes('"runLog"')) continue;
      const data = JSON.parse(raw);
      let sh = null;
      const find = (o) => { if (!o || typeof o !== 'object' || sh) return; if (o.food && o.items && o.wanderer) { sh = o; return; } for (const v of Object.values(o)) find(v); };
      find(data);
      const walk = (o) => {
        if (!o || typeof o !== 'object') return;
        if (o.nest && o.help && o.runLog) f(o, o.shared ?? sh);
        for (const v of Object.values(o)) walk(v);
      };
      walk(data);
      localStorage.setItem(k, JSON.stringify(data));
    }
  }, src);
}
async function reopen(page) {
  await page.reload();
  await wait(1500);
  const cont = page.getByRole('button', { name: /이어하기|불러오기/ });
  if (await cont.count()) { await cont.first().click().catch(() => {}); await wait(500); }
  const slot = page.locator('.bha-slot').first();
  if (await slot.count()) { await slot.click().catch(() => {}); await page.getByRole('button', { name: '확인' }).click().catch(() => {}); await wait(1500); }
  await skipTut(page);
}
async function newGame(page, url, fi) {
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
  await page.locator('.bha-species__card').nth(fi).click();
  await wait(300);
  await page.getByRole('button', { name: '시작', exact: true }).click();
  await wait(400);
  const nm = page.locator('[data-ident="name"]');
  if (await nm.count()) {
    await nm.fill(fi === 0 ? '권영' : 'Rukia');
    await nm.press('Enter');
    await wait(300);
    await page.locator('.bha-ident__gender[data-gender="male"]').click();
    await page.locator('.bha-ident .bha-btn--primary').last().click();
  }
}


const chips = (page) => page.evaluate(() => [...document.querySelectorAll('.bha-lcd [data-change], .bha-actfx [data-change]')].map((c) => `${c.dataset.change}:${c.textContent}:${c.classList.contains('bha-chip--guard') ? 'good' : 'bad'}`));
const nestVals = (page) => page.evaluate(() => {
  for (let i = 0; i < localStorage.length; i++) {
    const raw = localStorage.getItem(localStorage.key(i));
    if (!raw || !raw.includes('"runLog"')) continue;
    let out = null;
    const walk = (o) => { if (!o || typeof o !== 'object' || out) return; if (o.nest && o.runLog && o.training) { out = { hunger: o.nest.hunger, cond: o.nest.condition, risk: o.nest.risk, stab: o.nest.stability, tickets: o.training.tickets, ticketLog: (o.runLog.trainingTickets || []).length }; return; } for (const v of Object.values(o)) walk(v); };
    walk(JSON.parse(raw));
    if (out) return out;
  }
  return null;
});

async function run(url, out) {
  fs.mkdirSync(out, { recursive: true });
  const browser = await chromium.launch();
  const proof = { checks: {}, shots: [], errors: [] };
  const base = `
    t.help.guides = { ...t.help.guides, 'first-run': 'done', 'home-intro': 'done', 'first-run-room': 'done', 'birth': 'done', 'recover': 'done' };
    t.nest.hpFraction = 1; t.nest.spa = null; t.nest.careRequest = null; t.nest.hunger = 40; t.nest.condition = 60; t.nest.risk = 30;
    t.nest.collapsed = false; t.nest.collapsedAt = 0; t.nest.weakened = false; t.nest.tired = false; t.nest.dead = false; t.nest.feedLog = [];
    for (const k of Object.keys(shared.food)) shared.food[k] = 5;
  `;
  try {
    for (const mode of [{ id: 'ph', ctx: PH }, { id: 'pc', ctx: PC }]) {
      const ctx = await browser.newContext(mode.ctx);
      const page = await ctx.newPage();
      page.on('pageerror', (e) => proof.errors.push(`${mode.id}: ${e.message.slice(0, 160)}`));
      const c = (proof.checks[mode.id] = {});
      await newGame(page, url, 0);
      await wait(2500);
      await skipTut(page);
      await patchSave(page, base);
      await reopen(page);
      await wait(1500);
      // ① 방 먹이 직후 숫자 칩 (폰·PC)
      c.feedBefore = await nestVals(page);
      await page.locator('.bha-homedock [data-care="feed"]').first().click();
      await wait(300);
      await page.locator('.bha-homedock__food[data-food="basic"]').first().click();
      await wait(450);
      c.feedChips = await chips(page);
      await page.screenshot({ path: path.join(out, `${mode.id}-feed.png`) });
      proof.shots.push(`${mode.id}-feed.png`);
      await wait(3500);
      c.feedAfter = await nestVals(page);
      if (mode.id === 'ph') {
        // ② 탑 5층(강적) 승리 → 승리 창 보상 칸 · 결과 줄 '수련권 +1'
        await patchSave(page, `t.evolution.tierIndex = 3; t.evolution.formId = 't4:normal:physical'; t.evolution.formHistory = ['t4:normal:physical']; t.evolution.ascended = true; t.tower = { best: 4 }; t.training.tickets = 2;
          t.runLog.bossBattles.push({ at: 1, runId: 1, factionId: t.factionId, bossId: 'sand-maw', won: true, firstKill: true, durationSeconds: 30, phase: 1, seals: 0, lossReason: null, tierIndex: 0 });`);
        await reopen(page);
        await wait(1500);
        await page.locator('.bha-prop--outside').first().click();
        await wait(1500);
        await page.locator('.bha-worldmap [data-place="tower"]').first().click();
        await wait(1500);
        // 탑 전투 시드 = floor(Math.random() * 2^32) — 도전 누르는 순간 한 번만 DROP_SEED 가 나오게
        await page.evaluate((seed) => { const orig = Math.random; let armed = true; window.__armSeed = () => { armed = true; }; Math.random = () => { if (armed) { armed = false; Math.random = orig; return (seed + 0.5) / 2 ** 32; } return orig(); }; }, DROP_SEED);
        await page.locator('.bha-lcd').getByRole('button', { name: '도전' }).first().click();
        await page.locator('.bha-battle').waitFor({ timeout: 20000 });
        await wait(1500);
        for (let i = 0; i < 3 && (await page.locator('.bha-tut').count()); i++) { await page.keyboard.press('Escape'); await wait(300); }
        c.towerSeed = await page.evaluate(() => window.__bhaCombat?.seed);
        await page.evaluate(() => { const s = window.__bhaCombat; s.enemy.hp = 1; });
        for (let i = 0; i < 100 && !(await page.locator('.bha-battle-ov--win').count()); i++) await wait(200);
        await wait(900);
        c.winRewards = await page.evaluate(() => document.querySelector('[data-battle="win-rewards"]')?.textContent ?? null);
        await page.screenshot({ path: path.join(out, 'ph-tower-win.png') });
        proof.shots.push('ph-tower-win.png');
        await page.locator('.bha-battle-ov--win button').first().click();
        await wait(1500);
        c.towerResult = await page.evaluate(() => document.querySelector('[data-screen="tower-result"]')?.textContent?.replace(/\s+/g, ' ').slice(0, 300) ?? null);
        c.afterTower = await nestVals(page);
      } else {
        // ③ 수련 화면 '수련권 n' (개수 제한 없음 — 7장)
        await patchSave(page, `t.evolution.tierIndex = 3; t.evolution.formId = 't4:normal:physical'; t.evolution.formHistory = ['t4:normal:physical']; t.evolution.ascended = true; t.training.tickets = 7;`);
        await reopen(page);
        await wait(1500);
        await page.locator('.bha-prop--outside').first().click();
        await wait(1500);
        await page.locator('.bha-worldmap [data-place="training"]').first().click();
        await wait(1500);
        c.ticketsText = await page.evaluate(() => document.querySelector('.bha-train__tickets')?.textContent ?? null);
        await page.screenshot({ path: path.join(out, 'pc-training.png') });
        proof.shots.push('pc-training.png');
      }
      await ctx.close();
    }
  } finally {
    await browser.close();
  }
  fs.writeFileSync(path.join(out, 'proof.json'), JSON.stringify(proof, null, 1));
  console.log(JSON.stringify(proof, null, 0).slice(0, 6000));
}

run(process.argv[2], path.resolve(process.argv[3] || path.join(ROOT, 'docs/captures/c354')));
