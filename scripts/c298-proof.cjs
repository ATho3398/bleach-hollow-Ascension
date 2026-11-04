// C.298 proof (GDD 189장, 코딩209): 걷기(S08)·모험 준비(S06·S07) 수리 캡처 + 폰 기계 점검.
// 조건 3벌: pc = 844×390 고정 / ph = 796×384 터치 / ph115 = 796×384 터치 + 글자 1.15배. 두 종족.
// 화면: 준비 탭(타일 0개·몇 개·가득) · 타일 배치 탭 · 걷기 평소 · 일시정지 창 · 조우 · 걷기 경고 칩(둥지 컨디션 20 으로 출발).
// 쓰기: node scripts/c298-proof.cjs [저장 폴더]  (C298_URL=<주소> 이미 떠 있는 서버, C298_FACTIONS=0,1, C298_MODES=pc,ph,ph115)
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const { startServer } = require('./c276-proof.cjs');
const { phoneInPage } = require('./ui-audit/phone-checks.cjs');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.resolve(process.argv[2] || path.join(ROOT, 'docs/captures/c298'));
const FACTIONS = (process.env.C298_FACTIONS ?? '0,1').split(',').map(Number);
const MODES = (process.env.C298_MODES ?? 'pc,ph,ph115').split(',');
if (process.env.C298_URL) process.env.C276_URL = process.env.C298_URL;
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
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const server = await startServer();
  const browser = await chromium.launch();
  const sum = [];
  try {
    for (const fi of FACTIONS) for (const mode of MODES) {
      const tag = `${FNAME[fi]}-${mode}`;
      const issues = [];
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
        if (mode !== 'pc') for (const r of await page.evaluate(phoneInPage)) issues.push({ shot: name, ...r });
      };
      // ── 준비·배치·걷기 (평소) ──
      let page = await mk();
      await fresh(page, server.url, fi);
      await shot(page, 'prep-0');
      const placeTab = page.locator('.bha-lcd [data-plan-side="place"]');
      const prepTab = page.locator('.bha-lcd [data-plan-side="prep"]');
      const placeSome = async (n) => {
        for (let i = 0; i < n; i++) {
          // 놓고 나면 다음 카드가 저절로 골라진다(176장 14) — 놓을 칸이 안 보일 때만 카드를 누른다
          if (!(await page.locator('.bha-lcd .bha-road__cell.is-can').count())) {
            const card = page.locator('.bha-lcd .bha-tilecard').first();
            if (!(await card.count())) break;
            await card.click({ timeout: 2000 }).catch(() => {});
            await page.waitForTimeout(150);
          }
          const empty = page.locator('.bha-lcd .bha-road__cell.is-can').first();
          if (!(await empty.count())) break;
          await empty.click({ timeout: 2000 }).catch(() => {});
          await page.waitForTimeout(150);
        }
      };
      if (await placeTab.count()) {
        await placeTab.click(); await page.waitForTimeout(300);
        await shot(page, 'place-0');
        await placeSome(3);
        await shot(page, 'place-some');
        await prepTab.click(); await page.waitForTimeout(300);
        await shot(page, 'prep-some');
        await placeTab.click(); await page.waitForTimeout(300);
        await placeSome(12);
        await shot(page, 'place-full');
        await prepTab.click(); await page.waitForTimeout(300);
        await shot(page, 'prep-full');
      } else issues.push({ shot: 'prep', kind: '탭 없음', key: '[타일 배치] 탭이 없다(첫 진화 전?)' });
      await page.getByRole('button', { name: '★1', exact: true }).first().click().catch(() => {}); await page.waitForTimeout(300);
      await page.getByRole('button', { name: '출발', exact: true }).first().click(); await page.waitForTimeout(700);
      await shot(page, 'walk');
      await ((await page.locator('.bha-lcd .bha-exp__pausebtn').count()) ? page.locator('.bha-lcd .bha-exp__pausebtn') : page.locator('.bha-lcd .bha-exp__cornerrow .bha-btn--icon').last()).click({ timeout: 3000 }).catch(() => {}); // 옛 화면(전 캡처) = 아이콘 버튼 중 마지막 await page.waitForTimeout(400);
      await shot(page, 'pause');
      await page.getByRole('button', { name: '계속', exact: true }).click({ timeout: 2000 }).catch(() => page.locator('.bha-lcd .bha-exp__cornerrow .bha-btn--icon').first().click({ timeout: 2000 }).catch(() => {})); await page.waitForTimeout(300);
      // 조우: 말풍선이 '조우!' 일 때
      for (let t = 0; t < 120; t++) {
        const txt = await page.locator('.bha-lcd .bha-exp__msg').textContent().catch(() => '');
        if (/조우/.test(txt ?? '')) break;
        await page.waitForTimeout(250);
      }
      await shot(page, 'encounter');
      await page.close();
      // ── 경고 칩: 둥지 컨디션 20 으로 출발 ──
      page = await mk();
      await fresh(page, server.url, fi, { condition: 20 });
      await page.getByRole('button', { name: '★1', exact: true }).first().click().catch(() => {}); await page.waitForTimeout(300);
      await page.getByRole('button', { name: '출발', exact: true }).first().click(); await page.waitForTimeout(1800);
      await shot(page, 'walk-warn');
      await page.close();
      const kinds = {};
      for (const i of issues) kinds[i.kind] = (kinds[i.kind] ?? 0) + 1;
      sum.push({ tag, kinds, issues });
      console.log(tag, JSON.stringify(kinds));
    }
  } finally {
    // 조건별로 나눠 돌려도 합친다 (같은 tag 는 새 결과)
    const file = path.join(OUT, 'phone-checks.json');
    const old = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')).filter((o) => !sum.some((n) => n.tag === o.tag)) : [];
    fs.writeFileSync(file, JSON.stringify([...old, ...sum], null, 1));
    await browser.close();
    server.stop();
  }
})();
