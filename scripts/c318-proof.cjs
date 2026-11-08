// C.318 proof (GDD 197장 4, 코딩230): 온천 상태창 = 방(홈) 상태창과 같은 부품·모양 (머리 위 C.281 박스 + 바깥 ⓘ · 발밑 체력 막대).
// 두 종족 × PC 844×390 · 폰 796×384 터치, 1배. 장면: 온천(앉은 뒤) · 방(비교) · 온천 쇠약+피곤(상태이상 줄). 잘림·판 밖 점검을 proof.json 에.
// 실행: node scripts/c318-proof.cjs <주소> <태그(before|after)> [저장 폴더]   (vite 서버는 따로 띄운다)
// 비교 합치기: node scripts/c318-proof.cjs --compose [저장 폴더]
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..');
const FNAME = ['hollow', 'shinigami'];
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
  const cont = page.getByRole('button', { name: '이어하기' });
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
}
/** 상태창 부품의 자리·잘림 (LCD 안인지) */
const measure = (page) => page.evaluate(() => {
  const lcd = document.querySelector('.bha-lcd .bha-app')?.getBoundingClientRect();
  const box = (sel) => {
    const e = document.querySelector(`.bha-lcd ${sel}`);
    if (!e) return null;
    const r = e.getBoundingClientRect();
    const inside = lcd ? r.left >= lcd.left - 0.5 && r.right <= lcd.right + 0.5 && r.top >= lcd.top - 0.5 && r.bottom <= lcd.bottom + 0.5 : null;
    return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height), inside };
  };
  const rows = [...document.querySelectorAll('.bha-lcd .bha-room__status .bha-room__gauge')].map((g) => `${[...g.classList].find((c) => c.startsWith('bha-room__chip--'))?.slice(16)}:${g.querySelector('.bha-room__gaugenum')?.textContent}`);
  const clipped = [...document.querySelectorAll('.bha-lcd .bha-room__status *, .bha-lcd .bha-room__hp *')].filter((e) => e.scrollWidth > e.clientWidth + 1 && getComputedStyle(e).overflow !== 'visible' && e.clientWidth > 0).length;
  return { status: box('.bha-room__status'), info: box('.bha-room__statusinfo'), name: box('.bha-room__name'), hp: box('.bha-room__hp'), hpText: document.querySelector('.bha-lcd .bha-room__hp')?.textContent?.trim() ?? null, rows, clipped, oldChips: document.querySelectorAll('.bha-lcd .bha-spa__status .bha-chip--status').length };
});

async function run(url, tag, out) {
  fs.mkdirSync(out, { recursive: true });
  const browser = await chromium.launch();
  const proof = { tag, shots: {}, errors: [] };
  try {
    for (const fi of [0, 1]) for (const mode of ['pc', 'ph']) {
      const fid = FNAME[fi];
      const page = await browser.newPage(VIEW[mode]);
      page.on('pageerror', (e) => proof.errors.push(`${fid}-${mode}: ${e.message.slice(0, 120)}`));
      await newGame(page, url, fi);
      await page.waitForTimeout(2500);
      await skipTut(page);
      const cases = tag === 'after' && mode === 'ph' ? ['normal', 'weak'] : ['normal'];
      for (const kind of cases) {
        const extra = kind === 'weak' ? 't.nest.weakened = true; t.nest.tired = true; t.nest.hunger = 85; t.nest.condition = 20;' : 't.nest.hunger = 30; t.nest.condition = 40;';
        await patchSave(page, `
          t.help.guides = { ...t.help.guides, 'first-run': 'done', 'home-intro': 'done', 'first-run-room': 'done', 'birth': 'done', 'recover': 'done' };
          t.nest.hpFraction = 0.3; t.nest.spa = null; t.nest.careRequest = null;
          t.nest.collapsed = false; t.nest.collapsedAt = 0; t.nest.weakened = false; t.nest.tired = false; t.nest.dead = false; t.nest.feedLog = [];
          ${extra}
        `);
        await reopen(page);
        await page.waitForTimeout(800);
        if (kind === 'normal') {
          const name = `${tag}-${mode}-${fid}-room`;
          await page.screenshot({ path: path.join(out, `${name}.png`) });
          proof.shots[name] = await measure(page);
        }
        await page.locator('.bha-prop--outside').first().click({ timeout: 4000 });
        await page.waitForTimeout(1500);
        await page.click('.bha-worldmap [data-place="spa"]', { timeout: 4000 });
        for (let i = 0; i < 40 && !(await page.locator('.bha-spa__actor.is-seated').count()); i++) await page.waitForTimeout(100);
        await page.waitForTimeout(300);
        // 열린 ⓘ 창이 있으면 닫고 찍는다 (상태 박스를 보려고)
        proof.infoOpen = { ...(proof.infoOpen ?? {}), [`${fid}-${mode}-${kind}`]: await page.locator('.bha-infotip, .bha-info__pop, [role="dialog"]').count() };
        await page.mouse.move(2, 2).catch(() => {}); // 월드맵에서 누른 자리에 마우스가 남아 ⓘ 위에 걸리면(올림 = 열림) 치운다
        await page.keyboard.press('Escape').catch(() => {});
        await page.waitForTimeout(200);
        const name = `${tag}-${mode}-${fid}-spa${kind === 'weak' ? '-weak' : ''}`;
        await page.screenshot({ path: path.join(out, `${name}.png`) });
        proof.shots[name] = await measure(page);
        // 걷는 중(오른쪽 끝)에도 판 밖이 아닌지: 나가기 눌러 걷는 순간 한 번 잼
        if (tag === 'after' && kind === 'normal') {
          await page.locator('[data-space-back]').first().click().catch(() => {});
          await page.waitForTimeout(500);
          proof.shots[`${name}-leaving`] = await measure(page);
          await page.waitForTimeout(2500);
        } else {
          await page.locator('[data-space-back]').first().click().catch(() => {});
          await page.waitForTimeout(3000);
        }
      }
      await page.close();
    }
  } finally {
    await browser.close();
  }
  fs.writeFileSync(path.join(out, `proof-${tag}.json`), JSON.stringify(proof, null, 1));
  console.log(JSON.stringify(proof.errors));
}

/** 비교 한 장: 왼쪽 온천 전 · 가운데 온천 후 · 오른쪽 방(홈) — 종족·기기마다 */
async function compose(out) {
  const browser = await chromium.launch();
  try {
    for (const fid of FNAME) for (const mode of ['pc', 'ph']) {
      const imgs = [`before-${mode}-${fid}-spa`, `after-${mode}-${fid}-spa`, `after-${mode}-${fid}-room`].map((n) => {
        const p = path.join(out, `${n}.png`);
        return { n, src: `data:image/png;base64,${fs.readFileSync(p).toString('base64')}` };
      });
      const w = VIEW[mode].viewport.width;
      const h = VIEW[mode].viewport.height;
      const page = await browser.newPage({ viewport: { width: w * 3 + 16, height: h + 22 }, deviceScaleFactor: 1 });
      await page.setContent(`<body style="margin:0;background:#222;color:#eee;font:12px sans-serif;display:flex;gap:8px">${imgs.map((i) => `<div><div style="height:22px;line-height:22px">${i.n}</div><img src="${i.src}" width="${w}" height="${h}"></div>`).join('')}</body>`);
      await page.screenshot({ path: path.join(out, `compare-${mode}-${fid}.png`) });
      await page.close();
    }
  } finally {
    await browser.close();
  }
}

(async () => {
  if (process.argv[2] === '--compose') return compose(path.resolve(process.argv[3] || path.join(ROOT, 'docs/captures/c318')));
  await run(process.argv[2], process.argv[3], path.resolve(process.argv[4] || path.join(ROOT, 'docs/captures/c318')));
})();
