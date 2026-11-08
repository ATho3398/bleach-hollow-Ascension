// C.322 proof (GDD 197장 5, 코딩230): 월드맵 왼쪽 위 [둥지로]/[대원실로] 버튼 삭제. 지도 위 둥지/대원실 장소 → 방, 기기 ◀ → 방.
// 두 종족 × PC 844×390 마우스 · 폰 796×384 터치, 1배. 실행: node scripts/c322-proof.cjs <주소> <before|after> [저장 폴더]
// 비교 합치기: node scripts/c322-proof.cjs --compose [저장 폴더]
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
const screenId = (page) => page.evaluate(() => (document.querySelector('.bha-lcd .bha-worldmap') ? 'worldmap' : document.querySelector('.bha-lcd .bha-room') ? 'room' : 'other'));
async function toMap(page) {
  await page.locator('.bha-prop--outside').first().click({ timeout: 4000 });
  for (let i = 0; i < 30 && (await screenId(page)) !== 'worldmap'; i++) await page.waitForTimeout(100);
  await page.waitForTimeout(700);
}

async function run(url, tag, out) {
  fs.mkdirSync(out, { recursive: true });
  const browser = await chromium.launch();
  const proof = { tag, cases: {}, errors: [] };
  try {
    for (const fi of [0, 1]) for (const mode of ['pc', 'ph']) {
      const fid = FNAME[fi];
      const page = await browser.newPage(VIEW[mode]);
      page.on('pageerror', (e) => proof.errors.push(`${fid}-${mode}: ${e.message.slice(0, 120)}`));
      await newGame(page, url, fi);
      await page.waitForTimeout(2500);
      await skipTut(page);
      await patchSave(page, `t.help.guides = { ...t.help.guides, 'first-run': 'done', 'home-intro': 'done', 'first-run-room': 'done', 'birth': 'done', 'recover': 'done' }; t.nest.careRequest = null;`);
      await reopen(page);
      await page.waitForTimeout(800);
      await toMap(page);
      await page.mouse.move(2, 2).catch(() => {});
      const name = `${tag}-${mode}-${fid}-worldmap`;
      await page.screenshot({ path: path.join(out, `${name}.png`) });
      const r = await page.evaluate(() => ({
        backBtn: document.querySelectorAll('.bha-lcd .bha-worldmap [data-space-back]').length,
        hud: document.querySelectorAll('.bha-lcd .bha-worldmap__hud').length,
        home: (() => { const b = document.querySelector('.bha-lcd .bha-worldmap [data-place="home"]'); if (!b) return null; const x = b.getBoundingClientRect(); return { name: b.textContent.trim(), box: [Math.round(x.x), Math.round(x.y), Math.round(x.width), Math.round(x.height)] }; })(),
      }));
      // 지도 위 둥지/대원실 장소 → 방
      await page.locator('.bha-lcd .bha-worldmap [data-place="home"]').click({ timeout: 3000 }).catch((e) => proof.errors.push(`${fid}-${mode} home click: ${e.message.slice(0, 80)}`));
      for (let i = 0; i < 30 && (await screenId(page)) === 'worldmap'; i++) await page.waitForTimeout(100);
      await page.waitForTimeout(500);
      r.afterHomeIcon = await screenId(page);
      // 다시 월드맵 → 기기 ◀(취소) → 방
      if (r.afterHomeIcon === 'room') {
        await toMap(page);
        await page.locator('.bha-dev__btn[aria-label="취소"]').first().click({ timeout: 2000 }).catch(() => {});
        for (let i = 0; i < 30 && (await screenId(page)) === 'worldmap'; i++) await page.waitForTimeout(100);
        await page.waitForTimeout(500);
        r.afterDeviceBack = await screenId(page);
      }
      proof.cases[`${fid}-${mode}`] = r;
      await page.close();
    }
  } finally {
    await browser.close();
  }
  fs.writeFileSync(path.join(out, `proof-${tag}.json`), JSON.stringify(proof, null, 1));
  console.log(JSON.stringify(proof.cases), JSON.stringify(proof.errors));
}

/** 비교 한 장: 왼쪽 전 · 오른쪽 후 — 종족·기기마다 */
async function compose(out) {
  const browser = await chromium.launch();
  try {
    for (const fid of FNAME) for (const mode of ['pc', 'ph']) {
      const imgs = ['before', 'after'].map((t) => {
        const n = `${t}-${mode}-${fid}-worldmap`;
        return { n, src: `data:image/png;base64,${fs.readFileSync(path.join(out, `${n}.png`)).toString('base64')}` };
      });
      const w = VIEW[mode].viewport.width;
      const h = VIEW[mode].viewport.height;
      const page = await browser.newPage({ viewport: { width: w * 2 + 8, height: h + 22 }, deviceScaleFactor: 1 });
      await page.setContent(`<body style="margin:0;background:#222;color:#eee;font:12px sans-serif;display:flex;gap:8px">${imgs.map((i) => `<div><div style="height:22px;line-height:22px">${i.n}</div><img src="${i.src}" width="${w}" height="${h}"></div>`).join('')}</body>`);
      await page.screenshot({ path: path.join(out, `compare-${mode}-${fid}.png`) });
      await page.close();
    }
  } finally {
    await browser.close();
  }
}

(async () => {
  if (process.argv[2] === '--compose') return compose(path.resolve(process.argv[3] || path.join(ROOT, 'docs/captures/c322')));
  await run(process.argv[2], process.argv[3], path.resolve(process.argv[4] || path.join(ROOT, 'docs/captures/c322')));
})();
