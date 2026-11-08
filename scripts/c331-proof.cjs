// C.331 proof (GDD 201장, 코딩237): 회복 = '+n' 숫자 대신 머리 위 상태창 막대가 0.8초 동안 차오르고 숫자도 따라 오른다.
// PC 844×390 · 폰 796×384 터치, 1배. 장면: 방 먹이 주는 중간(약 0.3초)·끝 · 온천 체력 차오름. 말풍선·떠오르는 숫자에 '+n' 이 없는지 proof.json 에.
// 실행: node scripts/c331-proof.cjs <주소> [저장 폴더]   (vite 서버는 따로 띄운다)
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..');
const VIEW = {
  pc: { viewport: { width: 844, height: 390 }, deviceScaleFactor: 1 },
  ph: { viewport: { width: 796, height: 384 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true },
};

async function skipTut(page) {
  for (let t = 0; t < 40 && (await page.locator('.bha-tut').count()); t++) {
    const go = page.locator('.bha-tut button.bha-btn--primary:not([disabled])').filter({ visible: true });
    if (await go.count()) await go.first().click({ timeout: 2000 }).catch(() => {});
    else await page.locator('.bha-lcd').first().click({ timeout: 2000 }).catch(() => {});
    await page.waitForTimeout(400);
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
      const walk = (o) => {
        if (!o || typeof o !== 'object') return;
        if (o.nest && o.help && o.runLog) f(o, o.shared);
        for (const v of Object.values(o)) walk(v);
      };
      walk(data);
      localStorage.setItem(k, JSON.stringify(data));
    }
  }, src);
}
async function reopen(page) {
  await page.reload();
  await page.waitForTimeout(1500);
  const cont = page.getByRole('button', { name: /이어하기|불러오기/ });
  if (await cont.count()) { await cont.first().click().catch(() => {}); await page.waitForTimeout(500); }
  const slot = page.locator('.bha-slot').first();
  if (await slot.count()) { await slot.click().catch(() => {}); await page.getByRole('button', { name: '확인' }).click().catch(() => {}); await page.waitForTimeout(1500); }
  await skipTut(page);
}
async function newGame(page, url, fi) {
  const u = `${url}?test=1`;
  await page.goto(u);
  await page.evaluate(() => localStorage.clear());
  await page.goto(u);
  await page.waitForTimeout(1200);
  await page.getByRole('button', { name: '새로 시작' }).click();
  await page.waitForTimeout(300);
  await page.locator('.bha-slot').first().click();
  await page.getByRole('button', { name: '확인' }).click();
  await page.waitForTimeout(300);
  await page.locator('.bha-species__card').nth(fi).click();
  await page.waitForTimeout(300);
  await page.getByRole('button', { name: '시작', exact: true }).click();
  await page.waitForTimeout(400);
  // 이름 → 성별 (C.326)
  const nm = page.locator('[data-ident="name"]');
  if (await nm.count()) {
    await nm.fill(fi === 0 ? '권영' : 'Rukia');
    await nm.press('Enter');
    await page.waitForTimeout(300);
    await page.locator('.bha-ident__gender[data-gender="male"]').click();
    await page.locator('.bha-ident .bha-btn--primary').last().click();
  }
}
const readStatus = (page) => page.evaluate(() => ({
  rows: [...document.querySelectorAll('.bha-lcd .bha-room__status .bha-room__gauge')].map((g) => `${[...g.classList].find((c) => c.startsWith('bha-room__chip--'))?.slice(16)}:${g.querySelector('.bha-room__gaugenum')?.textContent}:${g.querySelector('i')?.style.width}`),
  hp: document.querySelector('.bha-lcd .bha-room__hp')?.textContent?.trim() ?? null,
  bubble: document.querySelector('.bha-lcd .bha-bubble, .bha-lcd .bha-room__bubble')?.textContent?.trim() ?? null,
  plusText: [...document.querySelectorAll('.bha-lcd .bha-bubble, .bha-lcd .bha-room__bubble, .bha-toast, .bha-float, .bha-actfx')].map((e) => e.textContent).filter((t) => /\+\d/.test(t)),
}));

async function run(url, out) {
  fs.mkdirSync(out, { recursive: true });
  const browser = await chromium.launch();
  const proof = { shots: {}, errors: [] };
  try {
    for (const mode of ['pc', 'ph']) {
      const fi = mode === 'pc' ? 0 : 1; // PC = 호로 · 폰 = 사신
      const page = await browser.newPage(VIEW[mode]);
      page.on('pageerror', (e) => proof.errors.push(`${mode}: ${e.message.slice(0, 120)}`));
      await newGame(page, url, fi);
      await page.waitForTimeout(2500);
      await skipTut(page);
      await patchSave(page, `
        t.help.guides = { ...t.help.guides, 'first-run': 'done', 'home-intro': 'done', 'first-run-room': 'done', 'birth': 'done', 'recover': 'done' };
        t.nest.hpFraction = 0.3; t.nest.spa = null; t.nest.careRequest = null; t.nest.hunger = 75; t.nest.condition = 40;
        t.nest.collapsed = false; t.nest.collapsedAt = 0; t.nest.weakened = false; t.nest.tired = false; t.nest.dead = false; t.nest.feedLog = [];
        for (const k of Object.keys(shared.food)) shared.food[k] = 5;
      `);
      await reopen(page);
      await page.waitForTimeout(1200);
      proof.shots[`${mode}-before`] = await readStatus(page);

      await page.locator('.bha-homedock [data-care="feed"]').first().click();
      await page.waitForTimeout(300);
      const food = page.locator('.bha-homedock__food:not([disabled])').first();
      await food.click();
      await page.waitForTimeout(280);
      await page.screenshot({ path: path.join(out, `${mode}-feed-mid.png`) });
      proof.shots[`${mode}-feed-mid`] = await readStatus(page);
      await page.waitForTimeout(1200);
      await page.screenshot({ path: path.join(out, `${mode}-feed-end.png`) });
      proof.shots[`${mode}-feed-end`] = await readStatus(page);
      // 가방에서 회복 물건을 쓸 때 뜨는 상태창 (GDD 201장 4, statusFillFx) — 부품을 그대로 불러 중간 장면 한 장 (PC 만)
      if (mode === 'pc') {
        await page.evaluate(async () => {
          const sb = await import('/src/ui/bha/statusBox.ts');
          const rl = await import('/src/ui/bha/roomLogic.ts');
          const n = { hunger: 40, condition: 30, stability: 52, risk: 0, weakened: false };
          const chips = () => rl.statusChips(n, { riskGaugeName: '광기', fullnessName: '배부름', stabilityName: '영압 안정도' });
          sb.statusFillFx({ title: '체력 포션을(를) 썼다', chips, from: { hunger: 60, cond: 30, stab: 52, risk: 0, hp: 0.38 }, to: { hunger: 60, cond: 30, stab: 52, risk: 0, hp: 0.88 }, maxHp: 212 });
        });
        await page.waitForTimeout(250);
        await page.screenshot({ path: path.join(out, `${mode}-bag-fill-mid.png`) });
        await page.waitForTimeout(1500);
      }
      // 온천 체력 차오름
      await page.locator('.bha-prop--outside').first().click({ timeout: 4000 });
      await page.waitForTimeout(1500);
      await page.click('.bha-worldmap [data-place="spa"]', { timeout: 4000 });
      for (let i = 0; i < 40 && !(await page.locator('.bha-spa__actor.is-seated').count()); i++) await page.waitForTimeout(100);
      await page.mouse.move(2, 2).catch(() => {});
      await page.keyboard.press('Escape').catch(() => {});
      await page.waitForTimeout(1500);
      await page.screenshot({ path: path.join(out, `${mode}-spa-filling.png`) });
      proof.shots[`${mode}-spa-filling`] = await readStatus(page);
      await page.close();
    }
  } finally {
    await browser.close();
  }
  fs.writeFileSync(path.join(out, 'proof.json'), JSON.stringify(proof, null, 1));
  console.log(JSON.stringify({ errors: proof.errors, plus: Object.fromEntries(Object.entries(proof.shots).map(([k, v]) => [k, v.plusText])) }));
}

run(process.argv[2], path.resolve(process.argv[3] || path.join(ROOT, 'docs/captures/c331')));
