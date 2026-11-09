// C.357 (GDD 214장) proof: 공격 피해를 모션 타격 순간에 — 평타 타격 직전·직후 프레임 + 블록 공격 착탄 프레임 (PC·폰). 캡처 docs/captures/c357/
// 실행: npm run build → npx vite preview --port 5393 → node scripts/c357-proof.cjs http://localhost:5393/
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const OUT = path.resolve(__dirname, '../docs/captures/c357');
const URL = process.argv[2] || 'http://localhost:5393/';
const PC = { viewport: { width: 844, height: 390 }, deviceScaleFactor: 1 };
const PH = { viewport: { width: 796, height: 384 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true };

async function newGame(page, url, fi) {
  await page.goto(`${url}?test=1`);
  await page.evaluate(() => localStorage.clear());
  await page.goto(`${url}?test=1`);
  await page.waitForTimeout(1200);
  await page.getByRole('button', { name: '새로 시작' }).click();
  await page.waitForTimeout(300);
  await page.locator('.bha-slot').first().click();
  await page.getByRole('button', { name: '확인' }).click();
  await page.waitForTimeout(300);
  await page.locator('.bha-species__card').nth(fi).click();
  await page.waitForTimeout(300);
  await page.getByRole('button', { name: '시작', exact: true }).click();
  await page.waitForTimeout(600);
  const input = page.locator('[data-ident="name"]');
  if (await input.count()) {
    await input.fill('시험');
    await page.locator('[data-ident="next"]').click();
    await page.waitForTimeout(200);
    await page.locator('.bha-ident__gender').first().click();
    await page.locator('[data-ident="done"]').click();
  }
  await page.waitForTimeout(1200);
}
const lcd = (page) => page.locator('.bha-lcd');
async function openTest(page, tab) {
  for (let i = 0; i < 4 && (await page.locator('.bha-lcd [data-dev-layer]').count()); i++) await page.keyboard.press('Escape');
  await lcd(page).getByRole('button', { name: '더보기' }).click();
  await page.waitForTimeout(500);
  await page.locator('.bha-homedock__tray').getByRole('button', { name: '테스트' }).click();
  await page.waitForTimeout(700);
  await page.locator('.bha-lcd .bha-viewtitle__btn').first().click();
  await page.locator('.bha-viewtitle__list').getByRole('option', { name: tab }).click();
  await page.waitForTimeout(400);
}
async function pick(page, aria, group, nth = 0) {
  await page.locator(`.bha-lcd button.bha-pick[aria-label="${aria}"]`).click();
  await page.waitForTimeout(200);
  const ok = await page.evaluate(({ group, nth }) => {
    const box = document.querySelector('.bha-pick__list');
    if (!box) return false;
    let inGroup = false;
    let k = 0;
    for (const n of box.children) {
      if (n.classList.contains('bha-pick__group')) { inGroup = n.textContent === group; continue; }
      if (inGroup && n.getAttribute('role') === 'option') { if (k++ === nth) { n.click(); return true; } }
    }
    return false;
  }, { group, nth });
  await page.waitForTimeout(300);
  return ok;
}
async function battle(page, url, fi) {
  await newGame(page, url, fi);
  await openTest(page, '바로 전투');
  await pick(page, '상대', '일반', 0);
  await lcd(page).getByRole('button', { name: '전투 시작' }).click();
  await page.locator('.bha-battle').waitFor({ timeout: 20_000 });
  await page.waitForTimeout(800);
  for (let i = 0; i < 3 && (await page.locator('.bha-tut').count()); i++) { await page.keyboard.press('Escape'); await page.waitForTimeout(300); }
  // 적이 죽지 않게(캡처 동안) 적 체력을 크게
  await page.evaluate(() => { const s = window.__bhaCombat; if (s) { s.enemy.maxHp *= 50; s.enemy.hp = s.enemy.maxHp; } });
}
/** 엔진 상태 요약 (예약 피해·체력) */
const state = () => {
  const s = window.__bhaCombat;
  if (!s) return null;
  return { tick: s.tick, hp: s.enemy.hp, pending: (s.pendingHits ?? []).map((h) => ({ at: h.atTick, target: h.target, kind: h.event.kind, amount: Math.round(h.amount * 10) / 10 })), delay: s.params.hitDelay };
};
/** 조건이 될 때까지 짧게 폴링 */
async function until(page, fn, ms = 6000, arg = null) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    const r = await page.evaluate(fn, arg);
    if (r) return r;
    await page.waitForTimeout(8);
  }
  return null;
}
const shot = (page, name) => page.screenshot({ path: path.join(OUT, `${name}.png`) });

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const proof = { url: URL, cases: [], errors: [] };
  const browser = await chromium.launch();
  for (const [tag, ctxOpt] of [['pc', PC], ['ph', PH]].filter(([t]) => !process.env.ONLY || process.env.ONLY === t)) {
    const ctx = await browser.newContext(ctxOpt);
    const page = await ctx.newPage();
    try {
      await battle(page, URL, 1); // 사신(종이인형 — 동작 데이터 hit 300ms)
      const delay = await page.evaluate(() => window.__bhaCombat.params.hitDelay);
      // ① 평타: 내 평타 예약이 생긴 직후(모션 시작, 체력 그대로) → 착탄 틱 직후(피해 숫자·체력 감소)
      const before = await until(page, () => { const s = window.__bhaCombat; const h = (s.pendingHits ?? []).find((x) => x.target === 'enemy' && x.event.kind === 'player-attack'); return h && h.atTick - s.tick >= 2 ? { hp: s.enemy.hp, at: h.atTick, tick: s.tick } : null; });
      await shot(page, `${tag}-basic-before`);
      const b1 = await page.evaluate(state);
      const after = await until(page, () => { const s = window.__bhaCombat; return s.enemy.hp < s.enemy.maxHp ? { hp: s.enemy.hp, tick: s.tick } : null; });
      await page.waitForTimeout(40);
      await shot(page, `${tag}-basic-after`);
      const a1 = await page.evaluate(state);
      // ② 블록 공격: 타격 지연이 있는 계열 공격 블록(없으면 아무 공격 블록)을 눌러 발동 → 착탄 틱(블록 예약이 들어가 체력이 깎인 순간)
      // 지연이 있는 계열 블록이 바에 나올 때까지(최대 25초), 없으면 아무 공격 블록
      await until(page, () => { const s = window.__bhaCombat; const d = s.params.hitDelay; return s.tray.some((b) => b.kind === 'skill' && b.family && (d.blockBy?.[`${b.family}:1`] ?? d.block) > 0) || null; }, 25000);
      await until(page, () => document.querySelectorAll('.bha-v2tray__grid .bha-block').length > 0, 15000);
      const target = await page.evaluate(() => {
        const s = window.__bhaCombat;
        const d = s.params.hitDelay;
        const key = (b) => (b.family ? `${b.family}:1` : null);
        const delayOf = (b) => (key(b) && d.blockBy && d.blockBy[key(b)] !== undefined ? d.blockBy[key(b)] : d.block);
        const cands = s.tray.map((b, i) => ({ i, uid: b.uid, family: b.family, kind: b.kind, delay: delayOf(b) })).filter((b) => b.kind === 'skill');
        return cands.sort((a, b) => b.delay - a.delay)[0] ?? null;
      });
      const hp0 = await page.evaluate(() => window.__bhaCombat.enemy.hp);
      await page.locator(`.bha-v2tray__grid .bha-block[data-uid="${target.uid}"]`).click();
      const sw = await until(page, () => { const s = window.__bhaCombat; const h = (s.pendingHits ?? []).find((x) => x.event.kind === 'block'); return h ? { at: h.atTick, tick: s.tick, family: h.event.family, chain: h.event.chain, amount: Math.round(h.amount) } : null; }, 1500);
      const land = await until(page, (hp0) => { const s = window.__bhaCombat; return !(s.pendingHits ?? []).some((x) => x.event.kind === 'block') && s.enemy.hp < hp0 ? { hp: s.enemy.hp, tick: s.tick } : null; }, 4000, hp0);
      await page.waitForTimeout(50);
      await shot(page, `${tag}-block-hit`);
      const a2 = await page.evaluate(state);
      proof.cases.push({ tag, delay, basic: { before, b1, after, a1 }, block: { target, hp0, sw, land, a2 } });
    } catch (e) {
      proof.errors.push(`${tag}: ${e.message.slice(0, 200)}`);
      await shot(page, `${tag}-fail`).catch(() => {});
    }
    await ctx.close();
  }
  await browser.close();
  if (process.env.ONLY && fs.existsSync(path.join(OUT, 'proof.json'))) {
    const prev = JSON.parse(fs.readFileSync(path.join(OUT, 'proof.json'), 'utf8'));
    proof.cases = [...prev.cases.filter((c) => c.tag !== process.env.ONLY), ...proof.cases];
  }
  fs.writeFileSync(path.join(OUT, 'proof.json'), JSON.stringify(proof, null, 2));
  console.log(JSON.stringify(proof, null, 1));
})();
