// C.317·C.318 proof (GDD 197장 1·2, 코딩228; C.318 = 리스크 0 놓아주기·흡수 뒤 한 줄·연습 글도 숨김): 흡수 리스크 줄 — 바뀔 때만 / 첫 흡수 연습 = 전부 숨김. 갈래 버튼 높이·[흡수] 버튼 자리 그대로(173장 2).
// 조건: pc = 844×390 마우스, ph = 796×384 터치. 두 종족.
// ① 튜토리얼 첫 흡수: c279 처럼 안내를 진짜 마우스로 따라가 첫 흡수 연습 화면까지 → 캡처·실측 (튜토리얼 막힘도 센다)
// ② 평소 흡수: 테스트 모드 새 게임 → 모험 ★1 → 전투(적 체력 1) → 흡수 화면. 저장된 원정 리스크를 한계(100, 폭주 이미 함)로 고쳐 다시 열어 '안 바뀌는 갈래'가 섞인 판도 본다(정화·속성·능력치 = 그대로, 놓아주기 −1)
// 캡처 1배 docs/captures/c317/. 실행: node scripts/c317-proof.cjs (C317_URL=<주소>)
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
if (process.env.C317_URL) process.env.C276_URL = process.env.C317_URL;
const { startServer, newGame, snap } = require('./c276-proof.cjs');
const { pressPoint } = require('./c279-proof.cjs');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, process.env.C317_OUT ?? 'docs/captures/c318');
const CONDS = [
  { id: 'pc', ctx: { viewport: { width: 844, height: 390 }, deviceScaleFactor: 1 } },
  { id: 'ph', ctx: { viewport: { width: 796, height: 384 }, deviceScaleFactor: 1, hasTouch: true, isMobile: true } },
];

/** 갈래 버튼·리스크 줄·[흡수] 버튼 실측 */
const measure = (page) => page.evaluate(() => {
  const r = (e) => { const b = e.getBoundingClientRect(); return [Math.round(b.x), Math.round(b.y), Math.round(b.width), Math.round(b.height)]; };
  const modes = [...document.querySelectorAll('.bha-absorb__actions [data-mode]')].map((b) => {
    const risk = b.querySelector('.bha-absorb__risk');
    return { mode: b.dataset.mode, box: r(b), risk: risk && getComputedStyle(risk).visibility !== 'hidden' ? risk.textContent.trim() : null };
  });
  const go = document.querySelector('.bha-absorb__go');
  const desc = [...document.querySelectorAll('.bha-absorb__desc p')].map((p) => `${p.dataset.line}:${p.textContent.trim()}`);
  return { modes, go: go ? r(go) : null, desc };
});

async function walkModes(page) {
  const out = [];
  for (const m of ['both', 'trait', 'stat', 'none']) {
    const b = page.locator(`.bha-absorb__actions [data-mode="${m}"]`).first();
    if (!(await b.count())) continue;
    await b.click({ force: true }).catch(() => {});
    await page.waitForTimeout(250);
    out.push({ pick: m, ...(await measure(page)) });
  }
  return out;
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const srv = await startServer();
  const browser = await chromium.launch();
  const proof = { runs: {}, errors: [], shots: [] };
  const shot = async (page, name) => { await page.waitForTimeout(400); await page.screenshot({ path: path.join(OUT, `${name}.png`) }); proof.shots.push(`${name}.png`); };
  try {
    for (const c of CONDS) for (const fi of [0, 1]) {
      const fname = fi === 0 ? 'hollow' : 'shinigami';
      const key = `${c.id}-${fname}`;
      const res = { tutorial: null, normal: null, normalMixed: null, stuck: 0 };
      proof.runs[key] = res;
      const ctx = await browser.newContext(c.ctx);
      const page = await ctx.newPage();
      page.on('pageerror', (e) => proof.errors.push(`${key}: ${e.message}`));
      const click = async (x, y) => { if (c.id === 'ph') await page.touchscreen.tap(x, y); else await page.mouse.click(x, y); };
      // ① 튜토리얼 첫 흡수
      if (!process.env.C317_SKIP_TUT) try {
        await newGame(page, srv.url, fi);
        let fails = 0;
        for (let i = 0; i < 500 && !(await page.locator('.bha-tutabsorb .bha-absorb__go').count()); i++) {
          const pt = await pressPoint(page);
          if (!pt || pt.kind === 'wait') { await page.waitForTimeout(300); continue; }
          const before = JSON.stringify(await snap(page));
          await click(pt.x, pt.y);
          await page.waitForTimeout(500);
          const after = JSON.stringify(await snap(page));
          if (after === before) { fails++; if (fails === 3) res.stuck++; } else fails = 0;
        }
        await page.waitForTimeout(800);
        res.tutorial = { first: await measure(page) };
        // 안내 카드를 끝까지 넘긴 뒤 화면 그대로 (pc 만 — 캡처 10장 이내)
        for (let i = 0; i < 6 && (await page.locator('.bha-tut[data-tut-guard]').count()); i++) {
          const pt = await pressPoint(page);
          if (pt && pt.kind === 'next') await click(pt.x, pt.y);
          await page.waitForTimeout(500);
        }
        res.tutorial.afterGuide = await measure(page);
        if (c.id === 'pc') await shot(page, `${key}-1b-tutorial-absorb-noguide`);
        res.tutorial.walk = await walkModes(page);
      } catch (e) { proof.errors.push(`${key} tutorial: ${String(e.message).split('\n')[0]}`); }
      // ② 평소 흡수 (테스트 모드)
      try {
        const url = `${srv.url}?test=1`;
        await newGame(page, url, fi);
        await page.waitForTimeout(2500);
        await page.locator('.bha-prop--outside').first().click();
        await page.waitForTimeout(900);
        await page.locator('.bha-worldmap [data-place="adventure"]').first().click();
        await page.waitForTimeout(2200);
        await page.locator('.bha-lcd').getByRole('button', { name: '★1', exact: true }).first().click();
        await page.waitForTimeout(400);
        await page.locator('.bha-lcd').getByRole('button', { name: '출발', exact: true }).first().click();
        await page.locator('.bha-battle').waitFor({ timeout: 90_000 });
        for (let t = 0; t < 160 && !(await page.locator('.bha-absorbv2 .bha-absorb__go').count()); t++) {
          await page.evaluate(() => { const s = window.__bhaCombat; if (s && s.enemy) s.enemy.hp = Math.min(s.enemy.hp, 1); });
          const go = page.getByRole('button', { name: /하러 가기$|결과 보기/ });
          if (await go.count()) await go.first().click().catch(() => {});
          await page.waitForTimeout(500);
        }
        await page.waitForTimeout(800);
        res.normal = { first: await measure(page) };
        res.normal.walk = await walkModes(page); // 마지막 = 놓아주기 골라진 상태 (리스크 0 → 놓아주기 줄 없음, C.318)
        await shot(page, `${key}-2-absorb-risk0-release`);
        // 리스크를 소수로 고친 판 (나가는 순간 저장되므로, 처음 화면에 나간 뒤 고쳐 다시 연다)
        await page.goto(url);
        await page.waitForTimeout(1200);
        const patched = await page.evaluate(() => {
          let n = 0;
          for (let i = 0; i < localStorage.length; i++) {
            const k = localStorage.key(i);
            const raw = localStorage.getItem(k);
            if (!raw || !raw.includes('"absorbOffer"')) continue;
            const d = JSON.parse(raw);
            const walk = (o) => { if (!o || typeof o !== 'object') return; if ('absorbOffer' in o && 'risk' in o && o.absorbOffer) { o.risk = 100; o.breakthrough = o.breakthrough ?? { lap: 1, cell: 0 }; n++; } for (const v of Object.values(o)) walk(v); };
            walk(d);
            localStorage.setItem(k, JSON.stringify(d));
          }
          return n;
        });
        res.patched = patched;
        if (patched) {
          await page.goto(url);
          await page.waitForTimeout(1200);
          await page.getByRole('button', { name: '이어하기' }).first().click();
          for (let t = 0; t < 30 && !(await page.locator('.bha-absorbv2 .bha-absorb__go').count()); t++) await page.waitForTimeout(300);
          await page.waitForTimeout(800);
          await page.locator('.bha-absorb__actions [data-mode="stat"]').first().click({ force: true }).catch(() => {});
          res.normalMixed = { first: await measure(page) };
          res.normalMixed.walk = await walkModes(page);
          // 능력치 흡수 실행 → 흡수 뒤 한 줄(토스트)에 리스크 부분 없음 (C.318)
          await page.locator('.bha-absorb__actions [data-mode="stat"]').first().click({ force: true }).catch(() => {});
          await page.waitForTimeout(250);
          await page.locator('.bha-absorb__go').first().click({ force: true });
          await page.waitForTimeout(500);
          res.normalMixed.toast = await page.evaluate(() => [...document.querySelectorAll('.bha-toast')].map((t) => t.textContent.trim()));
          await page.screenshot({ path: path.join(OUT, `${key}-3-after-absorb-toast.png`) });
          proof.shots.push(`${key}-3-after-absorb-toast.png`);
        }
      } catch (e) { proof.errors.push(`${key} normal: ${String(e.message).split('\n')[0]}`); }
      console.log(key, JSON.stringify({ stuck: res.stuck, t: res.tutorial?.afterGuide, n: res.normal?.walk?.at(-1), toast: res.normalMixed?.toast }));
      await ctx.close();
    }
  } finally {
    fs.writeFileSync(path.join(OUT, 'proof.json'), JSON.stringify(proof, null, 1));
    await browser.close();
    srv.stop();
  }
  console.log('errors', proof.errors);
})();
