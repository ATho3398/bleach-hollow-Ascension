// C.470 proof (GDD v6.096·v6.097 8-5·14·15-2): 아쥬커스 진화체 = 능력치별 모델 · 진화체 도감 모델 8칸·색 칩·실제 그림. PC 844×390 1배 + 폰 796×384
// 실행: node scripts/c470-proof.cjs [저장 폴더]
// 발견 상태는 세이브를 직접 만든다(진짜 진화 판정·테스트 모드 setForm 으로 lookDex 기록) → 슬롯 1 에 써서 [이어하기].
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const { startServer } = require('./c276-proof.cjs');

const OUT = path.resolve(process.argv[2] || path.join(__dirname, '..', 'docs/captures/c470'));
const PC = { viewport: { width: 844, height: 390 }, deviceScaleFactor: 1 };
const PHONE = { viewport: { width: 796, height: 384 }, deviceScaleFactor: 1 };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const proof = {};

/** 세이브 만들기 → 슬롯 1 → 이어하기 */
async function loadMade(page, url, factionId) {
  await page.goto(url); await page.evaluate(() => localStorage.clear()); await wait(300);
  const made = await page.evaluate(async (fid) => {
    const g = await import('/src/game.ts');
    const tm = await import('/src/engine/testMode.ts');
    const ss = await import('/src/saveSlots.ts');
    const s = g.newSaveData(fid, Date.now());
    tm.fillAllUnlocked(s);
    s.name = '권영'; s.gender = 'male';
    s.formDex = ['t2:base', 't4:fire:physical', 't4:water:special', 'h4:frenzy', 'h3:fail'];
    s.lookDex = [];
    // 짐승형(방어 1위) 흙 → 거미형(정신력 1위) 불·노멀·물 (마지막 = 지금 몸)
    tm.setCustomStats(s, { def: 300 }); tm.setForm(s, 't3:earth');
    tm.setCustomStats(s, { spr: 400 }); tm.setForm(s, 't3:fire'); tm.setForm(s, 't3:normal'); tm.setForm(s, 't3:water');
    tm.setForm(s, 'h3:fail'); tm.setForm(s, 't3:water');
    ss.writeSlotSave(localStorage, s, 1);
    ss.touchSlot(localStorage, 1);
    return { formDex: s.formDex, lookDex: s.lookDex, look: s.evolution.look, formId: s.evolution.formId };
  }, factionId);
  await page.goto(url); await wait(1200);
  await page.getByRole('button', { name: '이어하기' }).click(); await wait(2500);
  return made;
}
async function openDex(page) {
  await page.locator('button[aria-label="책장"]').first().click({ timeout: 4000 }); await wait(1200);
}
const shot = async (page, name) => { await page.screenshot({ path: path.join(OUT, name) }); console.log('  ', name); };
async function scrollGridTo(page, text) {
  await page.evaluate((t) => {
    const g = document.querySelector('.bha-dexgrid');
    const cap = [...document.querySelectorAll('.bha-dexgrid__cap')].find((c) => c.textContent.startsWith(t));
    if (g && cap) g.scrollTop = cap.offsetTop - g.offsetTop - 2;
  }, text);
  await wait(400);
}
const dexInfo = (page) => page.evaluate(() => ({
  sub: document.querySelector('.bha-dex-page .bha-lcdhead__sub, .bha-dex-page small, .bha-dex-page [class*="sub"]')?.textContent?.trim() ?? null,
  caps: [...document.querySelectorAll('.bha-dexgrid__cap')].map((c) => c.textContent),
  models: [...document.querySelectorAll('.bha-dexcard--model')].map((c) => ({ name: c.querySelector('.bha-dexcard__name')?.textContent, model: c.dataset.model ?? null, badge: c.querySelector('.bha-itemcard__badge')?.textContent ?? null, img: c.querySelector('img')?.getAttribute('src') ?? null, look: c.querySelector('.bha-dexart')?.dataset.look ?? null })),
  firstCards: [...document.querySelectorAll('.bha-dexcard:not(.bha-dexcard--model)')].slice(0, 4).map((c) => ({ name: c.querySelector('.bha-dexcard__name')?.textContent, img: c.querySelector('img')?.getAttribute('src') ?? null, look: c.querySelector('.bha-dexart')?.dataset.look ?? null })),
}));

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const server = await startServer();
  const browser = await chromium.launch();
  try {
    const only = process.env.ONLY;
    // ── 호로: 도감 · 상세 색 칩 · 다른 단계 · 상태 화면 ──
    if (!only || only === 'dex') {
      const ctx = await browser.newContext(PC);
      const page = await ctx.newPage();
      proof.hollowSave = await loadMade(page, server.url, 'hollow');
      await wait(5000); // 도감 보상 알림이 상태 박스(진화체 이름)를 덮지 않게
      proof.roomStatusName = await page.locator('.bha-room__status').first().innerText().catch(() => null);
      await shot(page, '01-room-name.png');
      await openDex(page);
      await scrollGridTo(page, '아쥬커스');
      proof.hollowDex = await dexInfo(page);
      await shot(page, '02-dex-hollow-ajuchas.png');
      await page.locator('.bha-dexcard--model[data-model="wyrm"]').click(); await wait(800);
      proof.detailChips = await page.evaluate(() => [...document.querySelectorAll('.bha-dexdetail__chips .bha-skinpick__chip')].map((b) => ({ form: b.dataset.form, text: b.textContent, disabled: b.disabled, on: b.classList.contains('is-on') })));
      proof.detailName = await page.locator('.bha-itemmodal__name').first().textContent();
      await shot(page, '03-dex-detail-wyrm-water.png');
      await page.locator('.bha-dexdetail__chips .bha-skinpick__chip[data-form="t3:fire"]').click(); await wait(600);
      proof.detailFireArt = await page.locator('.bha-itemmodal__art .bha-dexart').first().getAttribute('data-look');
      await shot(page, '04-dex-detail-wyrm-fire.png');
      await page.locator('.bha-itemmodal__close').first().click(); await wait(500);
      await scrollGridTo(page, '길리안');
      await shot(page, '05-dex-hollow-top.png');
      await scrollGridTo(page, '바스트로데');
      await shot(page, '06-dex-hollow-tier4.png');
      await ctx.close();
    }
    // ── 폰 796×384 도감 ──
    if (!only || only === 'dex') {
      const ctx = await browser.newContext(PHONE);
      const page = await ctx.newPage();
      await loadMade(page, server.url, 'hollow');
      await openDex(page);
      await scrollGridTo(page, '아쥬커스');
      await shot(page, '08-phone-dex.png');
      await ctx.close();
    }
    // ── 사신 도감 (그대로) ──
    if (!only || only === 'dex') {
      const ctx = await browser.newContext(PC);
      const page = await ctx.newPage();
      proof.shinSave = await loadMade(page, server.url, 'shinigami');
      await openDex(page);
      await scrollGridTo(page, '평대원');
      proof.shinDex = await dexInfo(page);
      await shot(page, '09-dex-shinigami.png');
      await ctx.close();
    }
    // ── 진화 결과 화면: 테스트 모드 새 게임 → [다음 진화] 두 번 (2 → 3단계) ──
    if (!only || only === 'evolve') {
      const ctx = await browser.newContext(PC);
      const page = await ctx.newPage();
      const u = `${server.url}?test=1`;
      await page.goto(u); await page.evaluate(() => localStorage.clear()); await page.goto(u); await wait(1200);
      await page.getByRole('button', { name: '새로 시작' }).click(); await wait(300);
      await page.locator('.bha-slot').first().click();
      await page.getByRole('button', { name: '확인' }).click(); await wait(300);
      await page.locator('.bha-species__card').nth(0).click(); await wait(300);
      await page.getByRole('button', { name: '네', exact: true }).click(); await wait(400);
      const nm = page.locator('[data-ident="name"]');
      if (await nm.count()) {
        await nm.fill('권영'); await nm.press('Enter'); await wait(300);
        await page.locator('.bha-ident__gender[data-gender="male"]').click();
        await page.locator('.bha-ident .bha-btn--primary').last().click();
      }
      await wait(2500);
      for (let t = 0; t < 40 && (await page.locator('.bha-tut').count()); t++) {
        const go = page.locator('.bha-tut button.bha-btn--primary:not([disabled])').filter({ visible: true });
        if (await go.count()) await go.first().click({ timeout: 2000 }).catch(() => {});
        else await page.locator('.bha-lcd').first().click({ timeout: 2000 }).catch(() => {});
        await wait(400);
      }
      // 테스트 칸 몸 = 2단계 길리안으로 (테스트 칸은 전체 해금 4단계로 시작) → [진화] 탭 [다음 진화] 한 번 = 2 → 3단계
      for (let n = 1; n < 2; n++) {
        await page.getByRole('button', { name: /더보기/ }).first().click({ timeout: 3000 }); await wait(400);
        await page.getByRole('button', { name: '테스트', exact: true }).first().click({ timeout: 3000 }); await wait(700);
        await page.locator('.bha-test-page button[aria-label="진화체"]').first().click({ timeout: 3000 }).catch(() => {}); await wait(400);
        const opt = page.getByRole('option', { name: /^길리안/ });
        if (await opt.count()) await opt.first().click({ timeout: 3000 });
        else await page.locator('.bha-test-page select').nth(1).selectOption('t2:base').catch(() => {});
        await wait(300);
        await page.getByRole('button', { name: '이 몸으로' }).first().click({ timeout: 3000 }); await wait(800);
        // 블록 칸 1 에 블록 하나 (장착 없음 = 망한 진화체가 되지 않게)
        await page.getByRole('button', { name: /^테스트 · / }).first().click({ timeout: 3000 }); await wait(400);
        await page.getByRole('option', { name: '블록', exact: true }).first().click({ timeout: 3000 }); await wait(600);
        await page.locator('.bha-test-page button[aria-label="블록 칸 1"]').first().click({ timeout: 3000 }); await wait(400);
        await page.getByRole('option').nth(1).click({ timeout: 3000 }); await wait(300);
        await page.getByRole('button', { name: '적용', exact: true }).first().click({ timeout: 3000 }); await wait(600);
        // 허기·컨디션 = 좋음 (돌봄 실패 = 망한 진화체가 되지 않게)
        await page.getByRole('button', { name: /^테스트 · / }).first().click({ timeout: 3000 }); await wait(400);
        await page.getByRole('option', { name: '둥지·시간', exact: true }).first().click({ timeout: 3000 }); await wait(600);
        await page.locator('.bha-test-page input[aria-label="허기"]').fill('30');
        await page.locator('.bha-test-page input[aria-label="컨디션"]').fill('90');
        await page.getByRole('button', { name: '적용', exact: true }).first().click({ timeout: 3000 }); await wait(600);
        await page.getByRole('button', { name: /^테스트 · / }).first().click({ timeout: 3000 }); await wait(400);
        await page.getByRole('option', { name: '진화', exact: true }).or(page.getByRole('menuitemradio', { name: '진화', exact: true })).or(page.getByRole('button', { name: '진화', exact: true })).first().click({ timeout: 3000 });
        await wait(600);
        await page.getByRole('button', { name: '다음 진화' }).first().click({ timeout: 3000 }).catch(async (e) => { await page.screenshot({ path: path.join(process.env.DBG || OUT, `dbg-${n}.png`) }); throw e; });
        // 연출 → 결과 ('새 진화체:' 줄)
        for (let k = 0; k < 30 && !(await page.locator('.bha-evolve__new').filter({ visible: true }).count()); k++) {
          const skip = page.getByRole('button', { name: /건너뛰기|넘기기|다음/ }).filter({ visible: true });
          if (await skip.count()) await skip.first().click({ timeout: 1500 }).catch(() => {});
          else await page.mouse.click(422, 200);
          await wait(500);
        }
        await wait(800);
        if (n === 1) {
          proof.evolveNew = await page.locator('.bha-evolve__new').first().textContent();
          await shot(page, '10-evolve-result.png');
        }
        const ok = page.getByRole('button', { name: /확인|닫기|계속/ }).filter({ visible: true });
        if (await ok.count()) await ok.last().click({ timeout: 2000 }).catch(() => {});
        await wait(1500);
      }
      await ctx.close();
    }
  } finally {
    const pf = path.join(OUT, 'proof.json');
    const prev = fs.existsSync(pf) ? JSON.parse(fs.readFileSync(pf, 'utf8')) : {};
    fs.writeFileSync(pf, JSON.stringify({ ...prev, ...proof }, null, 2));
    await browser.close();
    server.stop();
  }
  console.log(JSON.stringify(proof, null, 1).slice(0, 3000));
})().catch((e) => { console.error(e); process.exit(1); });
