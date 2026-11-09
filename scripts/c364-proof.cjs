// C.364 proof (GDD 222장 1·2·3·5·9, 코딩257): ① 튜토리얼 카드 + 대기 보상 창 — 카드 먼저, 끝난 뒤 창이 뜨고 [받기]가 눌린다(두 번째 창 없음)
// ② 처음 로그인 창 [로그인 없이 하기] · 게스트 실패 쉬운 안내 · 다시 켜면 안 뜸 ③ 대기 보상 이유 줄 ⑤ 월드맵 수련장 자물쇠 + 여는 조건 ⑨ 모험 준비 머리 탭.
// PC 844×390 · 폰 796×384 터치, 1배. 쓰기: node scripts/c364-proof.cjs [저장 폴더]  (C276_URL=<주소> 이미 떠 있는 dev 서버)
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const { startServer } = require('./c276-proof.cjs');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.resolve(process.argv[2] || path.join(ROOT, 'docs/captures/c364'));
const VIEW = {
  pc: { viewport: { width: 844, height: 390 }, deviceScaleFactor: 1 },
  ph: { viewport: { width: 796, height: 384 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true },
};
let BASE = '';

async function skipTut(page) {
  for (let t = 0; t < 40 && (await page.locator('.bha-tut').count()); t++) {
    const go = page.locator('.bha-tut button.bha-btn--primary:not([disabled])').filter({ visible: true });
    if (await go.count()) await go.first().click({ timeout: 2000 }).catch(() => {});
    else await page.locator('.bha-lcd').first().click({ timeout: 2000 }).catch(() => {});
    await page.waitForTimeout(400);
  }
}
async function patchAway(page, src) {
  await page.goto(`${BASE}manifest.webmanifest`); await page.waitForTimeout(300);
  return page.evaluate((code) => {
    const f = new Function('t', code);
    const out = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      const raw = localStorage.getItem(k);
      if (!raw || !raw.includes('"runLog"')) continue;
      const data = JSON.parse(raw);
      const walk = (o) => { if (!o || typeof o !== 'object') return; if (o.nest && o.help && o.runLog) out.push(f(o)); for (const v of Object.values(o)) walk(v); };
      walk(data);
      localStorage.setItem(k, JSON.stringify(data));
    }
    return out;
  }, src);
}
async function testGame(page) {
  const u = `${BASE}?test=1`;
  await page.goto(u); await page.evaluate(() => localStorage.clear()); await page.goto(u); await page.waitForTimeout(1200);
  await page.getByRole('button', { name: '새로 시작' }).click(); await page.waitForTimeout(300);
  await page.locator('.bha-slot').first().click(); await page.waitForTimeout(200);
  await page.getByRole('button', { name: '확인' }).click(); await page.waitForTimeout(300);
  await page.locator('.bha-species__card').nth(0).click(); await page.waitForTimeout(300);
  await page.getByRole('button', { name: '시작', exact: true }).click(); await page.waitForTimeout(400);
  const nm = page.locator('[data-ident="name"]');
  if (await nm.count()) {
    await nm.fill('권영'); await page.locator('[data-ident="next"]').click(); await page.waitForTimeout(200);
    await page.locator('.bha-ident__gender').first().click(); await page.locator('[data-ident="done"]').click();
  }
  await page.waitForTimeout(1500);
  await skipTut(page);
}
const toastText = (page) => page.evaluate(() => [...document.querySelectorAll('.bha-toast')].map((t) => t.textContent.replace(/\s+/g, ' ').trim()));
const confirms = (page) => page.evaluate(() => [...document.querySelectorAll('.bha-confirm')].map((c) => c.getAttribute('aria-label')));

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const server = await startServer();
  BASE = server.url;
  const browser = await chromium.launch();
  const facts = {};
  const errors = [];
  try {
    for (const mode of ['pc', 'ph']) {
      const page = await browser.newPage(VIEW[mode]);
      page.on('pageerror', (e) => errors.push(`${mode}: ${e.message.slice(0, 160)}`));
      const shot = async (name) => { await page.waitForTimeout(300); await page.screenshot({ path: path.join(OUT, `${mode}-${name}.png`) }); };
      const F = (facts[mode] = {});

      // ② 처음 로그인 창 (가짜 클라우드, 익명 로그인 꺼짐)
      const cu = `${BASE}?cloudfake=noguest`;
      await page.goto(cu); await page.evaluate(() => localStorage.clear()); await page.goto(cu); await page.waitForTimeout(2000);
      F.gateButtons = await page.evaluate(() => [...document.querySelectorAll('.bha-cloud-gate button')].map((b) => b.textContent.trim()));
      await shot('1-login-gate');
      await page.locator('[data-set="gate-guest"]').click(); await page.waitForTimeout(1500);
      F.guestFailed = { gateOpen: await page.locator('.bha-cloud-gate').count(), toasts: await toastText(page) };
      await page.goto(cu); await page.waitForTimeout(2000);
      F.gateAfterReload = await page.locator('.bha-cloud-gate').count();
      // [로그인 없이 하기] → 알림 처음 한 번만 (이미 게스트 실패로 봤으니 이번엔 알림 없음)
      await page.evaluate(() => localStorage.removeItem('bha-cloud-gate')); await page.goto(cu); await page.waitForTimeout(2000);
      await page.locator('[data-set="gate-offline"]').click(); await page.waitForTimeout(600);
      F.offline = { gateOpen: await page.locator('.bha-cloud-gate').count(), toasts: await toastText(page), remembered: await page.evaluate(() => localStorage.getItem('bha-cloud-gate') !== null) };

      // ① 겹침: 첫 원정 뒤 '다음 할 일' 안내 카드 + 40분 꺼 둔 대기 보상 (세이브 고쳐 재현)
      await testGame(page);
      F.patch = await patchAway(page, `t.help.guides['first-run-room'] = 'pending'; t.idlePending = null; if (t.runLog.runs.length === 0) t.runLog.runs.push({ runId: 1, laps: 1, outcome: 'returned', gained: [], lost: [], endReason: 'tutorial-clear', seed: 1, factionId: t.factionId, gainedTraits: [], lostTraits: [], riskPeak: 0, breakthrough: false, tutorial: true }); t.tower.best = 0; t.runLog.bossBattles = []; t.lastSeenAt = Date.now() - 40 * 60000; t.activeExpedition = null; t.nest.hunger = 0; t.nest.weakened = false; t.nest.collapsed = false; t.evolution.tierIndex = 0; return { runs: t.runLog.runs.length };`);
      await page.goto(`${BASE}?test=1`); await page.waitForTimeout(1500);
      await page.getByRole('button', { name: '이어하기' }).click().catch(() => {}); await page.waitForTimeout(2500);
      F.overlap = { card: await page.locator('.bha-tut').count(), confirms: await confirms(page) };
      await shot('2-card-first');
      const go = page.locator('.bha-tut button.bha-btn--primary:not([disabled])').filter({ visible: true });
      if (await go.count()) await go.first().click();
      await page.waitForTimeout(1600);
      F.afterCard = { card: await page.locator('.bha-tut').count(), confirms: await confirms(page), list: await page.evaluate(() => [...document.querySelectorAll('.bha-confirm .bha-modal__list li')].map((li) => li.textContent)) };
      await shot('3-idle-after-card');
      await page.locator('.bha-confirm button').filter({ hasText: '받기' }).first().click().catch((e) => errors.push(`${mode} 받기: ${e.message.slice(0, 80)}`));
      await page.waitForTimeout(700);
      F.claimed = { confirms: await confirms(page), toasts: await toastText(page) };

      // ⑤ 월드맵 수련장 자물쇠 + 누르면 여는 조건
      await page.waitForTimeout(2500);
      await skipTut(page);
      if (!(await page.locator('.bha-prop--outside').count())) await page.screenshot({ path: path.join(OUT, `${mode}-debug.png`) });
      await page.locator('.bha-prop--outside').first().click({ timeout: 5000 }); await page.waitForTimeout(900);
      F.training = await page.evaluate(() => { const b = document.querySelector('.bha-worldmap [data-place="training"]'); return b ? { lock: !!b.querySelector('.bha-prop__lock'), partlock: b.classList.contains('is-partlock'), title: b.title } : null; });
      await shot('4-training-lock');
      await page.locator('.bha-worldmap [data-place="training"]').first().click(); await page.waitForTimeout(500);
      F.trainingToast = await toastText(page);
      await page.waitForTimeout(2500);
      F.trainingScreen = await page.evaluate(() => document.querySelector('.bha-lcd [data-screen], .bha-train') !== null);

      // ⑨ 모험 준비 머리 탭
      await page.goto(`${BASE}?test=1`); await page.waitForTimeout(1500);
      await page.getByRole('button', { name: '이어하기' }).click().catch(() => {}); await page.waitForTimeout(1800);
      await skipTut(page);
      await page.locator('.bha-prop--outside').first().click(); await page.waitForTimeout(900);
      await page.locator('.bha-worldmap [data-place="adventure"]').first().click(); await page.waitForTimeout(1800);
      await skipTut(page);
      F.tabs = await page.evaluate(() => {
        const t = document.querySelector('.bha-depart-tabs');
        const head = t?.closest('.bha-head, header');
        const hr = head?.getBoundingClientRect();
        return t ? {
          items: [...t.querySelectorAll('.bha-seg__item')].map((b) => ({ id: b.dataset.tab, text: b.textContent, on: b.getAttribute('aria-selected'), lock: !!b.querySelector('.bha-icon, svg'), disabled: b.getAttribute('aria-disabled') })),
          overflow: hr ? [...t.querySelectorAll('.bha-seg__item')].some((b) => { const r = b.getBoundingClientRect(); return r.right > hr.right + 0.5 || r.bottom > hr.bottom + 0.5; }) : null,
          minH: Math.min(...[...t.querySelectorAll('.bha-seg__item')].map((b) => b.getBoundingClientRect().height)),
        } : null;
      });
      await page.locator('.bha-depart-tabs [data-tab="tower"]').click({ force: true }); await page.waitForTimeout(500);
      F.towerToast = await toastText(page);
      await shot('5-depart-tabs');
      await page.waitForTimeout(2000);
      await page.locator('.bha-depart-tabs [data-tab="story"]').click(); await page.waitForTimeout(1200);
      F.storyTabs = await page.evaluate(() => ({ screen: document.querySelector('[data-screen]')?.getAttribute('data-screen'), on: document.querySelector('.bha-depart-tabs [aria-selected="true"]')?.getAttribute('data-tab') }));
      await page.close();
    }
  } finally {
    await browser.close();
    server.stop();
  }
  fs.writeFileSync(path.join(OUT, 'proof.json'), JSON.stringify({ facts, errors }, null, 1));
  console.log(JSON.stringify({ facts, errors }, null, 1));
})();
