// C.471 proof (GDD 7-13 스택 표시 · 8-9 훈련 인형 = 전투 안 설정 창): 체력 막대 위 스택 네모 — 천년혈전 소도 스택 · 대도 발도·유지 · 기본 모드 월아천충 충전 ·
// 아이젠 영창 + 적 쪽(지속 피해·넉백) · 훈련 인형 들어가자마자 설정 창 · 적 등장 · 처치 뒤 다시 창 · 폰 796×384 스택 1장. 1배. 실행: node scripts/c471-proof.cjs [저장 폴더]
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const { startServer } = require('./c276-proof.cjs');

const OUT = path.resolve(process.argv[2] || path.join(__dirname, '..', 'docs/captures/c471'));
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
  s.spawnTimer = 1e9; s.enemy.attackTimer = 1e9; s.enemy.actionTimer = 1e9; s.params.timeLimitSeconds = 1e6; s.player.attackTimer = 1e9;
});
const startTestBattle = async (page) => {
  await openTest(page, '바로 전투');
  await page.getByRole('button', { name: '전투 들어가기' }).first().click({ timeout: 3000 });
  await wait(800);
  const ok = page.getByRole('button', { name: '확인', exact: true }).filter({ visible: true });
  if (await ok.count()) await ok.last().click({ timeout: 3000 });
  await page.waitForFunction(() => !!window.__bhaCombat && window.__bhaCombat.tick > 5, null, { timeout: 15000 });
  await calm(page);
  await page.evaluate(() => { window.__bhaCombat.tray = []; });
};
const kitBattle = async (page, url, btn) => {
  await newGame(page, url);
  await openTest(page, '붕옥·초월자');
  await page.getByRole('button', typeof btn === 'string' ? { name: btn, exact: true } : { name: btn }).first().click({ timeout: 3000 });
  await wait(2500); await skipTut(page);
  await startTestBattle(page);
};
/** 네모 줄 상태 + 겹침 점검 (체력 막대·이름·피해 숫자) */
const marks = (page) => page.evaluate(() => {
  const rect = (n) => { const r = n.getBoundingClientRect(); return [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)]; };
  const hit = (a, b) => a[0] < b[0] + b[2] && b[0] < a[0] + a[2] && a[1] < b[1] + b[3] && b[1] < a[1] + a[3];
  const out = {};
  for (const side of ['self', 'foe']) {
    const row = document.querySelector(`.bha-marks[data-side="${side}"]`);
    const items = [...(row?.querySelectorAll('.bha-mark') ?? [])].map((b) => ({ key: b.dataset.mark, n: b.textContent.trim(), label: b.getAttribute('aria-label'), full: b.classList.contains('is-full'), rect: rect(b) }));
    const unit = row?.closest('.bha-unit');
    const gauge = unit?.querySelector('.bha-v2hp .bha-gauge');
    const g = gauge ? rect(gauge) : null;
    out[side] = { items, gauge: g, overlapGauge: g ? items.some((i) => hit(i.rect, g)) : null, aboveGauge: g ? items.every((i) => i.rect[1] + i.rect[3] <= g[1] + 1) : null };
  }
  out.legendChips = [...document.querySelectorAll('.bha-v2legendrow .bha-v2chip')].filter((n) => !n.hidden).map((n) => n.textContent.replace(/\s+/g, ' ').trim());
  out.headChips = document.querySelectorAll('.bha-unit__heads .bha-v2chip:not([hidden])').length;
  return out;
});

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const server = await startServer();
  const browser = await chromium.launch();
  const proof = { errors: [], shots: [], facts: {} };
  const shot = async (page, name) => { await page.screenshot({ path: path.join(OUT, `${name}.png`) }); proof.shots.push(`${name}.png`); };
  try {
    const ctx = await browser.newContext(PC);
    let page = await ctx.newPage();
    page.on('pageerror', (e) => proof.errors.push(e.message.slice(0, 200)));
    // 1) 천년혈전 소도 스택 12 (내 체력 막대 위)
    await kitBattle(page, server.url, '이치고 · 천년혈전');
    await page.evaluate(() => { const s = window.__bhaCombat; s.kit.stanceStacks[0] = 12; s.kit.stanceUntil[0] = s.tick + 1e6; });
    await wait(500);
    proof.facts.kodachi = await marks(page);
    await shot(page, '01-pc-tybw-kodachi');
    // 2) 대도: 발도 충전 중 + 유지 보너스
    await page.locator('[data-sc="stance"]').first().click({ timeout: 3000 }); await wait(400);
    await page.evaluate(() => { const s = window.__bhaCombat; s.player.attackTimer = 1e9; s.kit.stanceStacks[1] = 7; s.kit.stanceUntil[1] = s.tick + 1e6; s.kit.holdTicks = 200; });
    const uids = await page.evaluate(() => { const s = window.__bhaCombat; s.tray = [0, 1].map(() => ({ uid: s.nextUid++, kind: 'skill', traitId: 'kit:odachi', family: null, element: null, solo: true })); return s.tray.map((b) => b.uid); });
    await wait(300);
    const box = await page.locator(`.bha-block[data-uid="${uids[0]}"]`).first().boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await wait(800);
    proof.facts.odachi = await marks(page);
    await shot(page, '02-pc-tybw-odachi-draw-hold');
    await page.mouse.up(); await wait(300);
    // 이름 = 네모를 누르면 ⓘ 설명 창
    await page.locator('.bha-marks[data-side="self"] .bha-mark').first().click({ timeout: 2000 }).catch(() => {});
    await wait(300);
    proof.facts.tipOnTap = await page.evaluate(() => document.querySelector('.bha-pop')?.textContent.replace(/\s+/g, ' ').trim() ?? null);
    await page.close();
    // 3) 기본 모드 월아천충 충전 2
    page = await ctx.newPage();
    page.on('pageerror', (e) => proof.errors.push(e.message.slice(0, 200)));
    await kitBattle(page, server.url, '이치고 · 기본');
    await page.evaluate(() => { const s = window.__bhaCombat; s.kit.charges = 2; });
    await wait(500);
    proof.facts.getsuga = await marks(page);
    await shot(page, '03-pc-basic-getsuga-charge');
    await page.close();
    // 4) 아이젠 영창 3 + 적에게 건 것(지속 피해·넉백) = 적 체력 막대 위
    page = await ctx.newPage();
    page.on('pageerror', (e) => proof.errors.push(e.message.slice(0, 200)));
    await kitBattle(page, server.url, /^아이젠/);
    await page.evaluate(() => { const s = window.__bhaCombat; s.kit.stack = 3; s.enemy.dot = { ticks: 100, perTick: 0 }; s.knockbackTicks = 60; });
    await wait(500);
    proof.facts.aizenFoe = await marks(page);
    await shot(page, '04-pc-aizen-chant-foe-marks');
    await page.close();
    // 5~7) 수련장 훈련 인형: [전투 들어가기] → 설정 창 → [확인] 적 등장 → 처치 → 다시 창
    page = await ctx.newPage();
    page.on('pageerror', (e) => proof.errors.push(e.message.slice(0, 200)));
    await newGame(page, server.url);
    for (const b of ['닫기', '확인']) { const x = page.getByRole('button', { name: b, exact: true }).filter({ visible: true }); if (await x.count()) await x.first().click({ timeout: 1500 }).catch(() => {}); }
    await page.locator('.bha-prop--altar').first().click({ timeout: 4000 }); await wait(900);
    proof.facts.entry = await page.evaluate(() => ({ title: document.querySelector('.bha-viewtitle__name')?.textContent ?? null, enter: !!document.querySelector('[data-sc="practice-enter"]'), rules: [...document.querySelectorAll('.bha-practice__rules li')].map((l) => l.textContent) }));
    await page.locator('[data-sc="practice-enter"]').first().click({ timeout: 3000 }); await wait(1200);
    proof.facts.dialog = await page.evaluate(() => ({
      title: document.querySelector('.bha-testarena .bha-dialog__title, .bha-testarena h2')?.textContent ?? null,
      foes: [...document.querySelectorAll('.bha-testarena [role="option"], .bha-testarena option')].map((o) => o.textContent.trim()),
      foeNow: document.querySelector('.bha-testarena .bha-test__select')?.textContent.trim() ?? null,
      empty: !!document.querySelector('.bha-unit--foe.is-empty'),
    }));
    await shot(page, '05-pc-practice-dialog-on-enter');
    // 창 닫기(뒤로) → 빈 자리 [적 설정] → 다시 열기 → 기기 ✓ 로 확인
    await page.locator('.bha-dev__btn[aria-label="취소"]').first().click({ timeout: 2000 }); await wait(500);
    proof.facts.closed = await page.evaluate(() => ({ dialog: !!document.querySelector('.bha-testarena'), slot: !!document.querySelector('.bha-testarena__slot') }));
    await page.locator('.bha-testarena__slot').first().click({ timeout: 2000 }); await wait(500);
    await page.locator('.bha-dev__btn[aria-label="확정"]').first().click({ timeout: 2000 }); await wait(400);
    if (await page.locator('.bha-testarena').count()) { await page.getByRole('button', { name: '확인', exact: true }).filter({ visible: true }).last().click({ timeout: 2000 }); }
    await page.waitForFunction(() => !!window.__bhaCombat && window.__bhaCombat.tick > 5 && !document.querySelector('.bha-unit--foe.is-empty'), null, { timeout: 15000 });
    await wait(800);
    proof.facts.round = await page.evaluate(() => ({ enemy: window.__bhaCombat.enemy.def.id, hp: window.__bhaCombat.enemy.maxHp, notice: document.querySelector('.bha-battle__notice, .bha-v2notice')?.textContent ?? null }));
    await shot(page, '06-pc-practice-foe');
    await page.evaluate(() => { window.__bhaCombat.enemy.hp = 1; window.__bhaCombat.player.attackTimer = 1; });
    await page.waitForSelector('.bha-testarena', { timeout: 15000 });
    await wait(600);
    proof.facts.after = await page.evaluate(() => ({ note: document.querySelector('.bha-testarena .bha-test__note')?.textContent ?? null, result: !!document.querySelector('.bha-resultpage') }));
    await shot(page, '07-pc-practice-again');
    // 나가기 = 수련장
    await page.getByRole('button', { name: '나가기', exact: true }).filter({ visible: true }).first().click({ timeout: 2000 }); await wait(800);
    proof.facts.exit = await page.evaluate(() => ({ entry: !!document.querySelector('[data-sc="practice-enter"]'), practices: JSON.parse(localStorage.getItem(Object.keys(localStorage).find((k) => localStorage.getItem(k)?.includes('"practices"')) ?? '') ?? 'null')?.evolution?.practices ?? 'n/a' }));
    await ctx.close();
    // 8) 폰: 천년혈전 소도 21 + 대도 4
    const pctx = await browser.newContext(PH);
    const pp = await pctx.newPage();
    pp.on('pageerror', (e) => proof.errors.push(`phone: ${e.message.slice(0, 200)}`));
    await kitBattle(pp, server.url, '이치고 · 천년혈전');
    await pp.evaluate(() => { const s = window.__bhaCombat; s.kit.stanceStacks = [21, 4]; s.kit.stanceUntil = [s.tick + 1e6, s.tick + 1e6]; s.enemy.dot = { ticks: 100, perTick: 0 }; });
    await wait(600);
    proof.facts.phone = await marks(pp);
    await shot(pp, '08-phone-tybw-stacks');
    await pctx.close();
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
