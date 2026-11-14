// C.457 proof (GDD v6.083 17-4): 테스트 모드 — 적 설정 창 · 적 등장/처치 뒤 창 다시 · 붕옥 재료 버튼과 강화 · 특수던전 연속 입장(회귀).
// 기기 844×390 1배 + 폰 796×384(적 설정 창 잘림 확인). 실행: node scripts/c457-proof.cjs [저장 폴더]
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const { startServer } = require('./c276-proof.cjs');

const OUT = path.resolve(process.argv[2] || path.join(__dirname, '..', 'docs/captures/c457'));
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
/** 창(.bha-modal)이 화면(LCD) 안에 다 들어오는가 */
const fits = (page) => page.evaluate(() => {
  const m = document.querySelector('.bha-testarena .bha-modal');
  const lcd = document.querySelector('.bha-lcd');
  if (!m || !lcd) return null;
  const a = m.getBoundingClientRect(); const b = lcd.getBoundingClientRect();
  return { modal: [Math.round(a.top), Math.round(a.bottom), Math.round(a.height)], lcd: [Math.round(b.top), Math.round(b.bottom)], inside: a.top >= b.top - 1 && a.bottom <= b.bottom + 1, scroll: m.scrollHeight > m.clientHeight + 1, buttons: [...m.querySelectorAll('.bha-modal__actions button')].map((x) => x.textContent.trim()) };
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
      // ── 적 설정 창 ──
      await openTest(page, '바로 전투');
      await page.getByRole('button', { name: '전투 들어가기' }).click(); await wait(1500);
      F[`${tag}.dialog`] = await fits(page);
      F[`${tag}.emptyFoe`] = await page.evaluate(() => !!document.querySelector('.bha-unit--foe.is-empty'));
      await shot(`${tag === 'pc' ? '01' : '02'}-${tag}-enemy-setup`);
      if (tag === 'phone') { await page.close(); continue; }
      // 공격 안 함 + 체력 50% 로 확인
      const modal = page.locator('.bha-testarena .bha-modal');
      // 적 종류 고르기 목록이 창 위에서 열리고 고를 수 있는가 (두 번째 항목)
      await modal.locator('.bha-pick').first().click(); await wait(500);
      const opt = page.getByRole('option').nth(1);
      F.pickOpen = await page.getByRole('option').count();
      await opt.click({ timeout: 3000 }).catch((e) => proof.errors.push('pick ' + e.message.slice(0, 900))); await wait(400);
      F.pickedFoe = await modal.locator('.bha-pick').first().textContent();
      await modal.getByRole('tab', { name: '안 함' }).click();
      await modal.locator('input[aria-label="체력 배율 %"]').fill('50');
      await modal.getByRole('button', { name: '확인' }).click(); await wait(1500);
      F.appeared = await page.evaluate(() => { const s = window.__bhaCombat; return { enemy: s.enemy.def.id, hp: Math.round(s.enemy.maxHp), passive: s.params.enemyPassive, immortal: s.params.enemyImmortal, empty: !!document.querySelector('.bha-unit--foe.is-empty'), dialog: !!document.querySelector('.bha-testarena'), notice: document.querySelector('.bha-notice')?.textContent }; });
      await shot('03-pc-enemy-appeared');
      const hp0 = await page.evaluate(() => window.__bhaCombat.player.hp);
      await wait(4000);
      F.playerHpUnchanged = await page.evaluate((h) => window.__bhaCombat.player.hp >= h, hp0);
      await page.evaluate(() => { window.__bhaCombat.enemy.hp = 1; });
      await wait(3000);
      F.afterKill = await page.evaluate(() => ({ dialog: !!document.querySelector('.bha-testarena'), empty: !!document.querySelector('.bha-unit--foe.is-empty'), note: document.querySelector('.bha-testarena .bha-test__note')?.textContent, notice: document.querySelector('.bha-notice')?.textContent }));
      await shot('04-pc-dialog-again-after-kill');
      // 창 닫기 → 빈 자리 [적 설정] → 다시 열기 → 나가기
      await page.locator('.bha-testarena').getByRole('button', { name: '창 닫기' }).click(); await wait(500);
      F.slotShown = await page.locator('.bha-testarena__slot').isVisible();
      F.slotHit = await page.evaluate(() => { const b = document.querySelector('.bha-testarena__slot'); const r = b.getBoundingClientRect(); const t = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return { rect: [r.left, r.top, r.width, r.height].map(Math.round), top: t ? `${t.tagName}.${t.className}` : null, inert: !!b.closest('[inert]') }; });
      await page.locator('.bha-testarena__slot').click(); await wait(500);
      F.reopened = await page.locator('.bha-testarena').count();
      await page.locator('.bha-testarena').getByRole('button', { name: '나가기' }).click(); await wait(1000);
      F.exitedToPanel = await page.locator('.bha-test-page').count();
      // ── 붕옥 재료 버튼 ──
      await page.evaluate(() => {}); // 패널 그대로
      await page.locator('.bha-test-page .bha-viewtitle, .bha-test-page [aria-haspopup]').first().click({ timeout: 2000 }).catch(() => {}); await wait(300);
      await page.getByRole('option', { name: '붕옥·초월자' }).or(page.getByRole('menuitemradio', { name: '붕옥·초월자' })).first().click({ timeout: 3000 }); await wait(600);
      F.matBefore = await page.evaluate(() => document.querySelector('.bha-test-page')?.innerText.match(/고순도[^\n]*/)?.[0]);
      await page.getByRole('button', { name: /재료 각 \+100/ }).click(); await wait(700);
      F.matAfter = await page.evaluate(() => document.querySelector('.bha-test-page')?.innerText.match(/고순도[^\n]*/)?.[0]);
      await shot('05-pc-hogyoku-material-button');
      // 붕옥 강화 화면: 방의 붕옥 → 개발 → 강화 1번
      // 방으로: 다시 열어 이어하기 (테스트 칸 그대로)
      const reopen = async () => { await page.goto(`${server.url}?test=1`); await wait(1200); await page.getByRole('button', { name: /이어하기/ }).first().click({ timeout: 5000 }); await wait(2000); await skipTut(page); };
      await reopen();
      F.afterReopen = await page.evaluate(() => ({ props: [...document.querySelectorAll('.bha-prop')].map((n) => n.className), btns: [...document.querySelectorAll('button')].filter((b) => b.offsetParent).map((b) => b.textContent.trim()).filter(Boolean).slice(0, 12) }));
      await page.locator('.bha-prop--hogyoku').first().click({ timeout: 5000 }); await wait(900);
      await page.locator('[data-sel="shard"]').first().click({ timeout: 3000 }).catch(() => {}); await wait(400);
      F.devBefore = await page.evaluate(() => document.querySelector('[data-sel="shard"]')?.textContent.replace(/\s+/g, ' ').trim());
      await page.locator('[data-sc="hogyoku-develop"]').first().click({ timeout: 3000 }).catch(() => {}); await wait(900);
      F.devAfter = await page.evaluate(() => document.querySelector('[data-sel="shard"]')?.textContent.replace(/\s+/g, ' ').trim());
      F.devDetail = await page.evaluate(() => document.querySelector('.bha-hgdetail')?.textContent.replace(/\s+/g, ' ').trim().slice(0, 200));
      await shot('06-pc-hogyoku-develop');
      // ── 특수던전 보스전 두 번 연속 입장 (회귀) ──
      await reopen();
      await page.locator('.bha-prop--outside').first().click(); await wait(900);
      await page.locator('.bha-worldmap [data-place="tower"]').first().click(); await wait(1000);
      await page.locator('button').filter({ hasText: '보스' }).first().click(); await wait(800);
      F.special = [];
      for (let k = 0; k < 2; k++) {
        await page.locator('[data-go="boss"]').first().click(); await wait(1500);
        await page.evaluate(() => { const s = window.__bhaCombat; s.enemy.hp = 1; s.player.maxHp *= 100; s.player.hp = s.player.maxHp; });
        await wait(4000);
        await page.getByRole('button', { name: /포식하러 가기/ }).filter({ visible: true }).first().click({ timeout: 3000 }).catch(() => {}); await wait(1200);
        await page.getByRole('button', { name: '특수던전' }).filter({ visible: true }).first().click({ timeout: 3000 }).catch(() => {}); await wait(1200);
        F.special.push(await page.evaluate(() => [...document.querySelectorAll('.bha-sdg__left, [data-go]')].map((n) => n.textContent.trim() + (n.disabled ? ' [disabled]' : ''))));
      }
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
