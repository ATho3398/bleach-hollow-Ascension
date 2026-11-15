// C.458 proof (GDD v6.084 8절·17-4): 상태 화면 능력치 칸(숫자 + 실제 값, PC·폰) · 칸 상세(노력치 10당) · 테스트 패널 능력치 양방향 입력 ·
// 적 설정 창(내 기본 공격 n회 분량·공격 간격 초) · 수련장 강적 처치 = '계속'(흡수 없음) → 수련장 결과. 1배. 실행: node scripts/c458-proof.cjs [저장 폴더]
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const { startServer } = require('./c276-proof.cjs');

const OUT = path.resolve(process.argv[2] || path.join(__dirname, '..', 'docs/captures/c458'));
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
  await page.goto(u); await page.evaluate(() => localStorage.clear()); await page.goto(u); await wait(1200);
  await page.getByRole('button', { name: '새로 시작' }).click(); await wait(300);
  await page.locator('.bha-slot').first().click(); await page.getByRole('button', { name: '확인' }).click(); await wait(300);
  await page.locator('.bha-species__card').nth(0).click(); await wait(300);
  await page.getByRole('button', { name: '네', exact: true }).click(); await wait(400);
  const nm = page.locator('[data-ident="name"]');
  if (await nm.count()) { await nm.fill('권영'); await nm.press('Enter'); await wait(300); await page.locator('.bha-ident__gender[data-gender="male"]').click(); await page.locator('.bha-ident .bha-btn--primary').last().click(); }
  await wait(2500);
  await skipTut(page);
}
async function openTest(page, tabName) {
  await page.getByRole('button', { name: /더보기/ }).first().click({ timeout: 3000 }); await wait(400);
  await page.getByRole('button', { name: '테스트', exact: true }).first().click({ timeout: 3000 }); await wait(700);
  await page.locator('.bha-test-page .bha-viewtitle, .bha-test-page [aria-haspopup]').first().click({ timeout: 2000 }).catch(() => {}); await wait(300);
  await page.getByRole('option', { name: tabName }).or(page.getByRole('menuitemradio', { name: tabName })).or(page.getByRole('button', { name: tabName })).first().click({ timeout: 3000 }); await wait(600);
}
const reopen = async (page, url) => { await page.goto(`${url}?test=1`); await wait(1200); await page.getByRole('button', { name: /이어하기/ }).first().click({ timeout: 5000 }); await wait(2000); await skipTut(page); };
/** 능력치 칸이 칸(줄) 밖으로 넘치는가 */
const statFacts = (page) => page.evaluate(() => {
  const rows = [...document.querySelectorAll('.bha-stats > .bha-statrow[data-stat]')];
  return rows.map((r) => {
    const fs = (q) => { const n = r.querySelector(q); return n ? getComputedStyle(n).fontSize : null; };
    const a = r.getBoundingClientRect();
    const kids = [...r.querySelectorAll('*')].map((k) => k.getBoundingClientRect()).filter((b) => b.width > 0);
    const over = kids.some((b) => b.right > a.right + 1 || b.left < a.left - 1);
    return { stat: r.dataset.stat, text: r.textContent.replace(/\s+/g, ' ').trim(), h: Math.round(a.height), over, fsValue: fs('.bha-statrow__value'), fsReal: fs('.bha-statrow__real') };
  });
});

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const server = await startServer();
  const browser = await chromium.launch();
  const proof = { errors: [], shots: [], facts: {} };
  const F = proof.facts;
  try {
    for (const [tag, dev] of [['pc', PC], ['phone', PH]]) {
      const page = await browser.newPage(dev);
      page.on('pageerror', (e) => proof.errors.push(`${tag}: ${e.message.slice(0, 200)}`));
      const shot = async (name) => { await wait(300); await page.screenshot({ path: path.join(OUT, `${name}.png`) }); proof.shots.push(`${name}.png`); };
      await newGame(page, server.url);
      // ── 상태 화면 능력치 칸 ──
      await page.locator('.bha-room__status').first().click({ timeout: 4000 }); await wait(1000);
      F[`${tag}.stats`] = await statFacts(page);
      await page.locator('.bha-stats').first().scrollIntoViewIfNeeded().catch(() => {});
      await shot(`${tag === 'pc' ? '01' : '02'}-${tag}-status-stats`);
      if (tag === 'phone') { await page.close(); continue; }
      // 칸 상세 (공격속도)
      await page.locator('.bha-statrow[data-stat="aspd"] .bha-care__celltip').first().click(); await wait(600);
      F.detail = await page.evaluate(() => document.querySelector('.bha-pop')?.textContent.replace(/\s+/g, ' ').trim());
      await shot('03-pc-stat-detail');
      await page.keyboard.press('Escape').catch(() => {}); await wait(300);
      // ── 테스트 패널 능력치 양방향 ──
      await reopen(page, server.url);
      await openTest(page, '능력치');
      const real = page.locator('input[aria-label$="실제 값 (초에 1번)"]').first();
      F.before = { num: await page.locator('.bha-test__grid--3 input').nth(0).inputValue(), aspdReal: await real.inputValue() };
      await real.fill('0.5'); await real.dispatchEvent('change'); await wait(300);
      F.afterRealToNum = await page.evaluate(() => { const ins = [...document.querySelectorAll('.bha-test__grid--3 input')]; return ins.map((i) => `${i.getAttribute('aria-label')}=${i.value}`); });
      await page.getByRole('button', { name: '이 단계 최대' }).click(); await wait(300);
      F.afterTop = await page.evaluate(() => [...document.querySelectorAll('.bha-test__grid--3 input')].slice(0, 12).map((i) => `${i.getAttribute('aria-label')}=${i.value}`));
      await shot('04-pc-test-stats-two-way');
      // ── 적 설정 창 ──
      await page.locator('.bha-test-page .bha-viewtitle, .bha-test-page [aria-haspopup]').first().click({ timeout: 2000 }).catch(() => {}); await wait(300);
      await page.getByRole('option', { name: '바로 전투' }).or(page.getByRole('menuitemradio', { name: '바로 전투' })).first().click({ timeout: 3000 }); await wait(600);
      await page.getByRole('button', { name: '전투 들어가기' }).click(); await wait(1500);
      F.dialog = await page.evaluate(() => { const m = document.querySelector('.bha-testarena .bha-modal'); const l = document.querySelector('.bha-lcd'); const a = m.getBoundingClientRect(); const b = l.getBoundingClientRect(); return { inside: a.top >= b.top - 1 && a.bottom <= b.bottom + 1, scroll: m.scrollHeight > m.clientHeight + 1, inputs: [...m.querySelectorAll('input')].map((i) => `${i.getAttribute('aria-label')}=${i.value}`) }; });
      const modal = page.locator('.bha-testarena .bha-modal');
      await modal.locator('input[aria-label="체력 (내 기본 공격 n회)"]').fill('5');
      await modal.locator('input[aria-label="공격 간격 (초)"]').fill('0.5');
      await shot('05-pc-enemy-setup-units');
      await modal.getByRole('button', { name: '확인' }).click(); await wait(1200);
      F.arena = await page.evaluate(() => { const s = window.__bhaCombat; return { hpInAttacks: s.enemy.def.hpInAttacks, fixed: s.params.enemyAttackSecondsFixed }; });
      await page.locator('.bha-dev__btn[aria-label="취소"]').first().click().catch(() => {});
      // ── 수련장 강적 처치: 버튼 '계속' → 수련장 결과 ──
      await reopen(page, server.url);
      await page.locator('.bha-prop--altar').first().click(); await wait(1200);
      await page.locator('button').filter({ hasText: '스티치마우스' }).first().click(); await wait(2000);
      await skipTut(page);
      await page.evaluate(() => { const s = window.__bhaCombat; s.enemy.hp = 1; s.player.maxHp *= 100; s.player.hp = s.player.maxHp; });
      await wait(3500);
      F.practiceWinButton = await page.evaluate(() => [...document.querySelectorAll('.bha-battle-ov__actions button')].map((b) => b.textContent.trim()));
      await shot('06-pc-practice-win-continue');
      await page.locator('.bha-battle-ov__actions button').first().click(); await wait(1200);
      F.practiceResult = await page.evaluate(() => ({ buttons: [...document.querySelectorAll('button')].filter((b) => b.offsetParent).map((b) => b.textContent.trim()).filter(Boolean), absorbRow: document.body.innerText.includes('연습에서는 쓰지 않음') }));
      await page.getByRole('button', { name: '연습 메뉴로' }).click().catch(() => {}); await wait(800);
      F.backToPractice = await page.evaluate(() => document.body.innerText.includes('상대를 고르면 바로 전투가 시작된다'));
      await page.close();
    }
  } catch (e) { proof.errors.push(String(e).slice(0, 400)); }
  finally {
    fs.writeFileSync(path.join(OUT, 'proof.json'), JSON.stringify(proof, null, 2));
    await browser.close(); server.stop?.();
  }
  console.log(JSON.stringify(proof, null, 1));
  process.exit(0);
})();
