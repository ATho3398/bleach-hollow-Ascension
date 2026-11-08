// C.319 proof (GDD 197장 3, 코딩229): 걷기 왼쪽 위 능력치 상태창 — C.281 빌드 ↔ 지금 나란히.
// 조건: pc = 844×390 / ph = 796×384 터치 / ph115 = 796×384 터치 + 글자 1.15배. 두 종족.
// 장면: 걷기 평소 · 걷기 낮은 체력(둥지 체력 20%·컨디션 20).
// 쓰기: node scripts/c319-proof.cjs <저장 폴더> <접두어>  (C319_URL=<이미 떠 있는 서버>, C319_MODES=pc,ph,ph115, C319_FACTIONS=0,1)
// C.281 빌드 = git worktree add <폴더> 68acec7b 뒤 그 폴더에서 vite 를 띄우고 C319_URL 로 넘긴다.
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const { startServer } = require('./c276-proof.cjs');
const { phoneInPage } = require('./ui-audit/phone-checks.cjs');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.resolve(process.argv[2] || path.join(ROOT, 'docs/captures/c319'));
const PREFIX = process.argv[3] || 'after';
const FACTIONS = (process.env.C319_FACTIONS ?? '0,1').split(',').map(Number);
const MODES = (process.env.C319_MODES ?? 'pc,ph,ph115').split(',');
if (process.env.C319_URL) process.env.C276_URL = process.env.C319_URL;
const FNAME = ['hollow', 'shinigami'];
const VIEW = {
  pc: { viewport: { width: 844, height: 390 }, deviceScaleFactor: 1 },
  ph: { viewport: { width: 796, height: 384 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true },
  ph115: { viewport: { width: 796, height: 384 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true },
};

async function fresh(page, url, fi, nest) {
  const u = `${url}?test=1`;
  await page.goto(u); await page.evaluate(() => localStorage.clear()); await page.goto(u); await page.waitForTimeout(1200);
  await page.getByRole('button', { name: '새로 시작' }).click(); await page.waitForTimeout(300);
  await page.locator('.bha-slot').first().click(); await page.waitForTimeout(200);
  await page.getByRole('button', { name: '확인' }).click(); await page.waitForTimeout(300);
  await page.locator('.bha-species__card').nth(fi).click(); await page.waitForTimeout(300);
  await page.getByRole('button', { name: '시작', exact: true }).click(); await page.waitForTimeout(1800);
  if (nest) await page.evaluate((n) => {
    const k = 'bha-save-test';
    const s = JSON.parse(localStorage.getItem(k));
    Object.assign(s.nest, n);
    localStorage.setItem(k, JSON.stringify(s));
  }, nest);
  await page.goto(u); await page.waitForTimeout(1200);
  await page.getByRole('button', { name: '이어하기' }).click().catch(() => {}); await page.waitForTimeout(1500);
  await page.locator('.bha-prop--outside').first().click(); await page.waitForTimeout(700);
  await page.locator('.bha-worldmap [data-place="adventure"]').first().click(); await page.waitForTimeout(2000);
  await page.getByRole('button', { name: '★1', exact: true }).first().click().catch(() => {}); await page.waitForTimeout(300);
  await page.getByRole('button', { name: '출발', exact: true }).first().click(); await page.waitForTimeout(600);
  // 체력 낮음 확인 창이 뜨면 창 안 [출발]
  const dlg = page.locator('[role="dialog"] button, .bha-modal button').filter({ hasText: '출발' });
  if (await dlg.count()) { await dlg.last().click().catch(() => {}); }
  await page.waitForTimeout(1500);
}

/** 왼쪽 위 판 크기·글 (비교용) */
const panelInfo = () => {
  const p = document.querySelector('.bha-lcd .bha-exp__chips') || document.querySelector('.bha-exp__chips');
  const c = document.querySelector('.bha-lcd .bha-exp__corner') || document.querySelector('.bha-exp__corner');
  const r = (e) => { if (!e) return null; const b = e.getBoundingClientRect(); return { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width), h: Math.round(b.height) }; };
  return { panel: r(p), corner: r(c), text: p ? p.innerText.replace(/\s+/g, ' ').slice(0, 300) : null };
};

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const server = await startServer();
  const browser = await chromium.launch();
  const sum = [];
  try {
    for (const fi of FACTIONS) for (const mode of MODES) {
      const tag = `${PREFIX}-${FNAME[fi]}-${mode}`;
      const issues = [];
      const info = {};
      const mk = async () => {
        const page = await browser.newPage(VIEW[mode]);
        if (mode === 'ph115') await page.addInitScript((k) => {
          const put = () => {
            const st = document.createElement('style');
            st.textContent = `:root{${[['xs', 12], ['sm', 13], ['md', 14], ['lg', 16], ['xl', 18], ['2xl', 22], ['3xl', 28], ['4xl', 36], ['5xl', 48]].map(([n, v]) => `--bha-fs-${n}:${(v * k).toFixed(2)}px !important;`).join('')}}`;
            document.head.append(st);
          };
          if (document.head) put(); else document.addEventListener('DOMContentLoaded', put);
        }, 1.15);
        page.on('pageerror', (e) => issues.push({ shot: '-', kind: '스크립트 오류', key: e.message.slice(0, 100) }));
        return page;
      };
      const shot = async (page, name) => {
        await page.waitForTimeout(250);
        await page.screenshot({ path: path.join(OUT, `${tag}-${name}.png`) });
        info[name] = await page.evaluate(panelInfo);
        if (mode !== 'pc') for (const r of await page.evaluate(phoneInPage)) issues.push({ shot: name, ...r });
      };
      let page = await mk();
      await fresh(page, server.url, fi);
      await shot(page, 'walk');
      await page.close();
      page = await mk();
      await fresh(page, server.url, fi, { condition: 20, hpFraction: 0.2 });
      await shot(page, 'walk-lowhp');
      await page.close();
      const kinds = {};
      for (const i of issues) kinds[i.kind] = (kinds[i.kind] ?? 0) + 1;
      sum.push({ tag, kinds, info, issues });
      console.log(tag, JSON.stringify(kinds), JSON.stringify(info.walk));
    }
  } finally {
    const file = path.join(OUT, `${PREFIX}-proof.json`);
    const old = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')).filter((o) => !sum.some((n) => n.tag === o.tag)) : [];
    fs.writeFileSync(file, JSON.stringify([...old, ...sum], null, 1));
    await browser.close();
    server.stop();
  }
})();
