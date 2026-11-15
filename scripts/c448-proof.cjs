// C.448 proof (GDD v6.062 7절): 블록 3개 연속 → 이펙트 3개 동시 · 빠른 평타(테스트 공격속도 999) · 폰 상태 화면(노력치 줄이 아래 버튼에 안 가림). 1배 10장 이내. 실행: node scripts/c448-proof.cjs [저장 폴더]
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const { startServer } = require('./c276-proof.cjs');

const OUT = path.resolve(process.argv[2] || path.join(__dirname, '..', 'docs/captures/c448'));
const PC = { viewport: { width: 844, height: 390 }, deviceScaleFactor: 1 };
const PH = { viewport: { width: 796, height: 384 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const ONLY = process.env.ONLY || '';

async function skipTut(page) {
  for (let t = 0; t < 40 && (await page.locator('.bha-tut').count()); t++) {
    const go = page.locator('.bha-tut button.bha-btn--primary:not([disabled])').filter({ visible: true });
    if (await go.count()) await go.first().click({ timeout: 2000 }).catch(() => {});
    else await page.locator('.bha-lcd').first().click({ timeout: 2000 }).catch(() => {});
    await wait(400);
  }
}
async function newGame(page, url) {
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
  await page.locator('.bha-species__card').nth(0).click();
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
async function openStatus(page) {
  for (let i = 0; i < 6 && (await page.locator('.bha-lcd [data-dev-layer]').count()); i++) { await page.keyboard.press('Escape'); await wait(250); }
  await page.locator('.bha-room__status').first().click({ timeout: 4000 });
  await wait(900);
}
/** 상태 화면: 오른쪽 스크롤 칸·노력치 줄·아래 버튼 줄 상자 (스크롤 칸 바닥이 버튼 줄 위인가) */
const statusBoxes = (page) => page.evaluate(() => {
  const r = (el) => { if (!el) return null; const b = el.getBoundingClientRect(); return { top: Math.round(b.top), bottom: Math.round(b.bottom), left: Math.round(b.left), right: Math.round(b.right) }; };
  const scroll = document.querySelector('.bha-care__scroll');
  const ev = document.querySelector('[data-ev-total]');
  const foot = document.querySelector('.bha-care__actions');
  return { scroll: r(scroll), cols: [...document.querySelectorAll('.bha-care-page .bha-lcdpage__col, .bha-care-page [class*="__col"]')].map(r), ev: r(ev), foot: r(foot), scrollH: scroll?.scrollHeight, clientH: scroll?.clientHeight };
});

async function startBattle(page) {
  await openTest(page, '바로 전투');
  await page.getByRole('button', { name: '전투 시작' }).first().click({ timeout: 3000 });
  await page.waitForFunction(() => !!window.__bhaCombat && window.__bhaCombat.tick > 10, null, { timeout: 15000 });
  await page.evaluate(() => { const s = window.__bhaCombat; s.enemy.hp = s.enemy.maxHp = 1e9; s.enemy.attackTimer = 1e9; });
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const server = await startServer();
  const browser = await chromium.launch();
  const proof = { errors: [], shots: [], facts: {} };
  let n = 1;
  try {
    for (const [dk, opts] of [['pc', PC], ['phone', PH]]) {
      if (ONLY && ONLY !== dk) continue;
      let ctx = await browser.newContext(opts);
      let page = await ctx.newPage();
      page.on('pageerror', (e) => proof.errors.push(`${dk}: ${e.message.slice(0, 200)}`));
      const shot = async (name) => { const f = `${String(n++).padStart(2, '0')}-${dk}-${name}.png`; await page.screenshot({ path: path.join(OUT, f) }); proof.shots.push(f); };
      const facts = (proof.facts[dk] = {});
      const step = async (label, fn) => { try { await fn(); } catch (e) { proof.errors.push(`${dk} ${label}: ${String(e).slice(0, 200)}`); if (process.env.DBG) await page.screenshot({ path: path.join(process.env.DBG, `${dk}-${label}.png`) }); await back(page); } };
      await newGame(page, server.url);
      if (dk === 'phone') {
        // 1) 폰 상태 화면: 노력치 줄까지 스크롤해도 아래 버튼 줄에 안 가림
        await step('status', async () => {
          await openStatus(page);
          facts.status = await statusBoxes(page);
          await shot('status-top');
          await page.evaluate(() => { document.activeElement?.blur?.(); document.querySelectorAll('.is-open').forEach((x) => x.classList.remove('is-open')); const el = document.querySelector('[data-ev-total]'); el?.scrollIntoView({ block: 'end' }); });
          await page.mouse.move(5, 5);
          await wait(300);
          facts.statusEv = await statusBoxes(page);
          await shot('status-ev-line');
          await back(page);
        });
      }
      if (dk === 'pc') {
        // 2) 블록 3개 연속: 이펙트 3개가 동시에 보이고, 몸동작은 줄을 선다
        await step('blocks3', async () => {
          await startBattle(page);
          // 바에 공격 블록 3개(계열이 달라 체인이 아니게)를 깔고 같은 프레임에 셋 다 쓴다
          // 블록이 5개 이상 쌓일 때까지 기다린다
          await page.waitForFunction(() => window.__bhaCombat.tray.filter((b) => b.kind === 'skill').length >= 5, null, { timeout: 30000 }).catch(() => {});
          facts.trayBefore = await page.evaluate(() => window.__bhaCombat.tray.map((b) => `${b.uid}:${b.kind}:${b.family}`));
          // 계열이 다른 공격 블록 3개(체인이 아니게)를 바에 깔고 바로 셋 다 쓴다
          const uids = await page.evaluate(() => {
            const s = window.__bhaCombat;
            const base = s.tray.find((b) => b.kind === 'skill');
            s.tray.length = 0;
            ['family-a', 'family-b', 'family-c'].forEach((f, i) => s.tray.push({ ...base, uid: 9001 + i, family: f }));
            return [9001, 9002, 9003];
          });
          await wait(300);
          facts.uids = uids;
          await page.evaluate(() => { window.__c448 = []; });
          for (const u of uids) {
            await page.locator(`[data-uid="${u}"]`).first().focus().catch(() => {});
            await page.keyboard.press('Enter');
            await wait(20);
          }
          await wait(60);
          await shot('blocks3-effects');
          // 이펙트 조각 수를 40ms 마다 잰다 (최대 동시 · 본 이펙트 이름 · 블록 몸동작 사건 순서)
          facts.fxTrace = await page.evaluate(async () => {
            const seen = new Set(); let max = 0; const at = [];
            for (let k = 0; k < 8; k++) {
              const w = [...document.querySelectorAll('.bha-pxfx-wrap')];
              w.forEach((x) => seen.add(x.dataset.fx)); max = Math.max(max, w.length); at.push(w.length);
              await new Promise((r) => setTimeout(r, 40));
            }
            return { max, seen: [...seen], at };
          });
          facts.motionEvents = await page.evaluate(() => (window.__bhaProbe || []).filter((x) => x.kind === 'block-motion' || x.kind === 'motion-hasten').slice(-6));
          facts.fxAfter3 = await page.evaluate(() => document.querySelectorAll('.bha-pxfx-wrap').length);
          // (위에서 찍음)
          facts.motionState = await page.evaluate(() => { const m = window.__bhaCombat.motion; return m ? { cur: m.cur, queue: m.queue.length, seq: m.seq } : null; });
          facts.fxSides = await page.evaluate(() => [...document.querySelectorAll('.bha-pxfx-wrap')].map((w) => w.dataset.fx));
          facts.motionTable = await page.evaluate(() => window.__bhaCombat.params.motion);
          await wait(1200);
          facts.fxLater = await page.evaluate(() => document.querySelectorAll('.bha-pxfx-wrap').length);
          await shot('blocks3-later');
          await back(page); await back(page);
        });
        await ctx.close();
        const ctx2 = await browser.newContext(opts);
        const page2 = await ctx2.newPage();
        page2.on('pageerror', (e) => proof.errors.push(`${dk}: ${e.message.slice(0, 200)}`));
        await newGame(page2, server.url);
        page = page2;
        ctx = ctx2;
        // 3) 빠른 평타: 테스트 공격속도 999 → 평타 간격 0.3초(상한) < 모션 → 1.5배속 + 앞 자르기
        await step('fastbasic', async () => {
          await openTest(page, '능력치');
          const inputs = page.locator('.bha-test-page input[type="number"]');
          const labels = await page.evaluate(() => [...document.querySelectorAll('.bha-test-page input[type="number"]')].map((i) => i.getAttribute('aria-label') || i.closest('label')?.textContent?.trim() || ''));
          const ai = labels.findIndex((l) => l.includes('공격속도'));
          if (ai >= 0) await inputs.nth(ai).fill('999');
          await page.getByRole('button', { name: '적용', exact: true }).first().click({ timeout: 3000 });
          await wait(600);
          await back(page);
          await startBattle(page);
          await page.evaluate(() => { const s = window.__bhaCombat; s.params.trayCapacity = 0; s.tray.length = 0; });
          const a = await page.evaluate(() => ({ tick: window.__bhaCombat.tick, n: window.__bhaCombat.basicCount ?? 0 }));
          await wait(3000);
          const b = await page.evaluate(() => { const s = window.__bhaCombat; return { tick: s.tick, n: s.basicCount ?? 0, motion: s.params.motion?.basic, hit: s.params.hitDelay.basic, rates: (window.__bhaProbe || []).filter((x) => x.type === 'swing' && x.kind === 'player-attack').length }; });
          const sec = (b.tick - a.tick) * 0.1;
          // 간격 0.3초(상한) < 모션 → 배율 = min(1.5, 모션 ÷ 0.3)
          facts.fastBasic = { seconds: +sec.toFixed(1), basicAttacks: b.n - a.n, perSecond: +((b.n - a.n) / sec).toFixed(2), basicMotion: b.motion, basicHit: b.hit, expectRate: b.motion ? +Math.min(1.5, b.motion.total / 0.3).toFixed(3) : null };
          await shot('fast-basic');
          await wait(140);
          await shot('fast-basic-2');
          await back(page); await back(page);
        });
      }
      await ctx.close();
    }
  } catch (e) {
    proof.errors.push(String(e).slice(0, 400));
  } finally {
    fs.writeFileSync(path.join(OUT, 'proof.json'), JSON.stringify(proof, null, 2));
    await browser.close();
    server.stop?.();
    console.log(JSON.stringify(proof, null, 1).slice(0, 9000));
    process.exit(0);
  }
})();
