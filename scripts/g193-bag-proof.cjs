// GDD 193장 6·9·15·16·17 캡처 + 폰 기계 점검 (코딩222). 18(진화 연출 알림)은 단위 동작이라 캡처 없음.
// 조건: pc = 844×390 / ph = 796×384 터치 / ph115 = 796×384 터치 + 글자 1.15배. 두 종족.
// 장면: 방 피곤 줄 + 먹이 줄(컨디션 100) · 가방 장비 탭(빈 소모품 칸) · 빈 칸 고르기 창 · 가방 소모품 탭 약·전투 소모품 · 대기 보상 창(빈사) · 전투 빈 소모품 칸 고르기
// 쓰기: node scripts/g193-bag-proof.cjs <저장 폴더>  (G193_URL=<주소> 이미 떠 있는 서버, G193_FACTIONS=0,1, G193_MODES=pc,ph,ph115, G193_BEFORE=1 = 옛 화면(고르기 장면 없음))
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const { startServer } = require('./c276-proof.cjs');
const { phoneInPage } = require('./ui-audit/phone-checks.cjs');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.resolve(process.argv[2] || path.join(ROOT, 'docs/captures/c305'));
const FACTIONS = (process.env.G193_FACTIONS ?? '0,1').split(',').map(Number);
const MODES = (process.env.G193_MODES ?? 'pc,ph,ph115').split(',');
const BEFORE = process.env.G193_BEFORE === '1';
if (process.env.G193_URL) process.env.C276_URL = process.env.G193_URL;
const FNAME = ['hollow', 'shinigami'];
const VIEW = {
  pc: { viewport: { width: 844, height: 390 }, deviceScaleFactor: 1 },
  ph: { viewport: { width: 796, height: 384 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true },
  ph115: { viewport: { width: 796, height: 384 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true },
};
const KEY = 'bha-save-test';

async function newGame(page, url, fi) {
  const u = `${url}?test=1`;
  await page.goto(u); await page.evaluate(() => localStorage.clear()); await page.goto(u); await page.waitForTimeout(1200);
  await page.getByRole('button', { name: '새로 시작' }).click(); await page.waitForTimeout(300);
  await page.locator('.bha-slot').first().click(); await page.waitForTimeout(200);
  await page.getByRole('button', { name: '확인' }).click(); await page.waitForTimeout(300);
  await page.locator('.bha-species__card').nth(fi).click(); await page.waitForTimeout(300);
  await page.getByRole('button', { name: '시작', exact: true }).click(); await page.waitForTimeout(1800);
}
/** 세이브를 고치고 다시 연다 (방) */
async function patch(page, url, fn, arg) {
  await page.evaluate(([k, src, a]) => {
    const s = JSON.parse(localStorage.getItem(k));
    // eslint-disable-next-line no-new-func
    new Function('s', 'a', src)(s, a);
    localStorage.setItem(k, JSON.stringify(s));
  }, [KEY, fn, arg ?? null]);
  await page.goto(`${url}?test=1`); await page.waitForTimeout(1200);
  await page.getByRole('button', { name: '이어하기' }).click().catch(() => {}); await page.waitForTimeout(1500);
}
const closeOverlays = async (page) => {
  for (let i = 0; i < 3; i++) {
    const b = page.locator('.bha-confirm .bha-btn').filter({ hasText: /나중에|닫기|확인|아니오/ }).first();
    if (!(await b.count())) break;
    await b.click({ timeout: 1000 }).catch(() => {}); await page.waitForTimeout(250);
  }
};

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const server = await startServer();
  const browser = await chromium.launch();
  const sum = [];
  try {
    for (const fi of FACTIONS) for (const mode of MODES) {
      const tag = `${FNAME[fi]}-${mode}${BEFORE ? '-before' : ''}`;
      const issues = [];
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
      const shot = async (name) => {
        await page.waitForTimeout(250);
        await page.screenshot({ path: path.join(OUT, `${tag}-${name}.png`) });
        if (mode !== 'pc') for (const r of await page.evaluate(phoneInPage)) issues.push({ shot: name, ...r });
      };
      await newGame(page, server.url, fi);
      // ── 15·16 방: 피곤 + 컨디션 100 + 먹이 줄 ──
      await patch(page, server.url, `Object.assign(s.nest, { tired: true, condition: 100, hunger: 59 }); s.shared.food.basic = Math.max(3, s.shared.food.basic || 0);`);
      await closeOverlays(page);
      await page.locator('[data-care="feed"]').first().click({ timeout: 3000 }).catch(() => {}); await page.waitForTimeout(400);
      await shot('room-tired-feed');
      // ── 6·9 가방: 회복 물건 셋 + 각성제, 소모품 칸 빈 채 ──
      await patch(page, server.url, `Object.assign(s.nest, { tired: false }); s.shared.items = { ...s.shared.items, 'heal-patch': 3, 'battle-potion': 2, 'heal-salve': 1, 'battle-haste': 1 }; s.shared.battleItem = null;`);
      await closeOverlays(page);
      await page.locator('.bha-room__scene .bha-prop[data-prop="chest"]').first().click({ timeout: 3000 }).catch(() => {}); await page.waitForTimeout(700);
      await page.locator('[data-tab="gear"]').first().click().catch(() => {}); await page.waitForTimeout(300);
      await shot('bag-gear');
      if (!BEFORE) {
        await page.locator('.bha-eqslot--battle').first().click().catch(() => {}); await page.waitForTimeout(400);
        await shot('bag-pick');
        await page.locator('.bha-shoppick [data-pick]').first().click().catch(() => {}); await page.waitForTimeout(400);
        await shot('bag-gear-filled');
      }
      await page.locator('[data-tab="items"]').first().click().catch(() => {}); await page.waitForTimeout(300);
      await page.locator('[data-tab="medicine"]').first().click().catch(() => {}); await page.waitForTimeout(300);
      await shot('bag-items-med');
      await page.locator('[data-tab="battle"]').last().click().catch(() => {}); await page.waitForTimeout(300);
      await shot('bag-items-battle');
      // ── 17 대기 보상 창: 빈사 중 쌓인 30분 ──
      await patch(page, server.url, `Object.assign(s.nest, { collapsed: true, collapsedAt: Date.now() }); s.idlePending = { from: Date.now() - 1800000, hours: 0.5, activeHours: 0 };`);
      await closeOverlays(page);
      await page.locator('[data-sc="idle-reward"]').first().click({ timeout: 3000 }).catch(() => {}); await page.waitForTimeout(500);
      await shot('idle-dying');
      await closeOverlays(page);
      // ── 6 전투: 빈 소모품 칸 → 고르기 창 ──
      if (!BEFORE) {
        await patch(page, server.url, `Object.assign(s.nest, { collapsed: false, collapsedAt: null }); s.idlePending = null; s.shared.battleItem = null;`);
        await closeOverlays(page);
        await page.locator('.bha-prop--outside').first().click().catch(() => {}); await page.waitForTimeout(700);
        await page.locator('.bha-worldmap [data-place="adventure"]').first().click().catch(() => {}); await page.waitForTimeout(2000);
        await page.getByRole('button', { name: '★1', exact: true }).first().click().catch(() => {}); await page.waitForTimeout(300);
        await page.getByRole('button', { name: '출발', exact: true }).first().click().catch(() => {}); await page.waitForTimeout(700);
        let ok = false;
        for (let t = 0; t < 160 && !ok; t++) {
          ok = (await page.locator('.bha-v2role--item').count()) > 0;
          if (!ok) await page.waitForTimeout(250);
        }
        if (ok) {
          await page.waitForTimeout(2500); // 조우 연출이 걷힐 때까지
          await page.locator('.bha-v2role--item').first().click({ timeout: 2000, force: true }).catch(() => {}); await page.waitForTimeout(500);
          await shot('battle-pick');
          await page.locator('.bha-shoppick [data-pick]').first().click({ timeout: 2000 }).catch(() => {}); await page.waitForTimeout(500);
          await shot('battle-armed');
        } else issues.push({ shot: 'battle', kind: '전투 못 감', key: '[소모품] 버튼이 안 보였다' });
      }
      await page.close();
      const kinds = {};
      for (const i of issues) kinds[i.kind] = (kinds[i.kind] ?? 0) + 1;
      sum.push({ tag, kinds, issues });
      console.log(tag, JSON.stringify(kinds));
    }
  } finally {
    const file = path.join(OUT, 'phone-checks.json');
    const old = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')).filter((o) => !sum.some((n) => n.tag === o.tag)) : [];
    fs.writeFileSync(file, JSON.stringify([...old, ...sum], null, 1));
    await browser.close();
    server.stop();
  }
})();
