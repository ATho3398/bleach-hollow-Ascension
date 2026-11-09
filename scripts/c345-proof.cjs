// C.345 proof: 지운 가짜 도트 그림 자리 404 전수 — 빌드본(vite preview)에서 호로 1·2단계 × 시작 외형·스킨 방(먹이 직후)·걷기·전투.
// 실행: npm run build → npx vite preview --port 5393 → node scripts/c345-proof.cjs http://localhost:5393/ . 캡처 docs/captures/c345/
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const OUT = path.resolve(__dirname, '../docs/captures/c345');
const URL = process.argv[2] || 'http://localhost:5393/';
const PC = { viewport: { width: 844, height: 390 }, deviceScaleFactor: 1 };
const PH = { viewport: { width: 796, height: 384 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true };

async function newHollow(page, url, look, tier = 0, skin = null) {
  const wait = (ms) => page.waitForTimeout(ms);
  await page.goto(`${url}?test=1`);
  await page.evaluate(() => localStorage.clear());
  await page.goto(`${url}?test=1`);
  await wait(1200);
  await page.getByRole('button', { name: '새로 시작' }).click();
  await wait(300);
  await page.locator('.bha-slot').first().click();
  await wait(200);
  await page.getByRole('button', { name: '확인' }).click();
  await wait(300);
  await page.locator('.bha-species__card').nth(0).click();
  await wait(300);
  await page.getByRole('button', { name: '시작', exact: true }).click();
  await wait(400);
  const input = page.locator('[data-ident="name"]');
  if (await input.count()) {
    await input.fill('시험');
    await page.locator('[data-ident="next"]').click();
    await wait(200);
    await page.locator('.bha-ident__gender').first().click();
    await page.locator('[data-ident="done"]').click();
  }
  await wait(1500);
  // 시작 외형 고정: 세이브 안 evolution.look 을 바꾸고 다시 불러온다
  const changed = await page.evaluate(({ look, tier, skin }) => {
    let n = 0;
    const fix = (o, sh) => { if (!o || typeof o !== 'object') return; if (o.evolution && 'look' in o.evolution) { o.evolution.look = look; o.evolution.tierIndex = tier; o.skin = skin; if (skin && o.shared?.cosmetics && !o.shared.cosmetics.includes('skin-' + skin)) o.shared.cosmetics.push('skin-' + skin); n++; } for (const v of Object.values(o)) fix(v); };
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i); const raw = localStorage.getItem(k);
      try { const j = JSON.parse(raw); const before = n; fix(j); if (n > before) localStorage.setItem(k, JSON.stringify(j)); } catch { /* */ }
    }
    return n;
  }, { look, tier, skin });
  await page.reload();
  await wait(1200);
  await page.getByRole('button', { name: '이어하기' }).click();
  await wait(3500);
  return changed;
}


(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();
  const proof = { cases: [], bad: [], errors: [] };
  const watch = (page, tag) => {
    page.on('response', (r) => { if (r.status() >= 400) proof.bad.push(`${tag} ${r.status()} ${r.url()}`); });
    page.on('requestfailed', (r) => proof.bad.push(`${tag} failed ${r.url()}`));
    page.on('pageerror', (e) => proof.errors.push(`${tag} ${e.message}`));
  };
  const broken = (page) => page.evaluate(() => [...document.querySelectorAll('img')].filter((i) => i.complete && i.getAttribute('src') && i.naturalWidth === 0).map((i) => i.getAttribute('src')));
  const cases = [];
  for (const tier of [0, 1]) for (const look of ['mantis', 'brute', 'ghoul', 'shackled']) cases.push({ tier, look, skin: null });
  for (const tier of [0, 1]) cases.push({ tier, look: 'mantis', skin: 'grandfisher' });
  for (const c of cases.filter((c) => !process.env.ONLY || process.env.ONLY === `t${c.tier + 1}-${c.look}`)) {
    const tag = `t${c.tier + 1}-${c.look}${c.skin ? '+' + c.skin : ''}`;
    const dev = c.tier ? PH : PC;
    const page = await browser.newPage(dev);
    watch(page, tag);
    await newHollow(page, URL, c.look, c.tier, c.skin);
    await page.locator('.bha-homedock [data-care="feed"]').first().click().catch(() => {});
    await page.waitForTimeout(500);
    const b = await broken(page);
    const me = await page.evaluate(() => { const r = document.querySelector('.bha-room'); return { rig: !!r?.querySelector('canvas.bha-rigcanvas'), imgs: [...(r?.querySelectorAll('img') ?? [])].map((i) => i.getAttribute('src')).filter((s) => /char|skin|rig/.test(s ?? '')) }; });
    proof.cases.push({ tag, broken: b, ...me });
    console.log(tag, JSON.stringify(b), JSON.stringify(me));
    if (tag === 't1-mantis') await page.screenshot({ path: path.join(OUT, `room-${tag}-pc.png`) });
    // 걷기·전투 (1단계 사마귀·2단계 거구만)
    if (tag === 't1-mantis' || tag === 't2-brute') try {
      await page.locator('.bha-homedock [data-care="feed"]').first().click().catch(() => {}); // 먹이 판 닫기
      await page.waitForTimeout(400);
      await page.locator('.bha-prop--outside').first().click();
      await page.waitForTimeout(900);
      await page.locator('.bha-worldmap [data-place="adventure"]').first().click();
      await page.waitForTimeout(2200);
      await page.locator('.bha-lcd').getByRole('button', { name: /^★1/ }).first().click();
      await page.waitForTimeout(400);
      await page.locator('.bha-lcd').getByRole('button', { name: '출발', exact: true }).first().click();
      await page.waitForTimeout(2500);
      proof.cases.push({ tag: tag + ' walk', broken: await broken(page) });
      if (tag === 't2-brute') await page.screenshot({ path: path.join(OUT, `${tag}-walk-phone.png`) });
      await page.locator('.bha-battle').waitFor({ timeout: 60_000 });
      await page.waitForTimeout(1500);
      proof.cases.push({ tag: tag + ' battle', broken: await broken(page) });
    } catch (e) { proof.errors.push(`${tag} walk: ${e.message.slice(0, 80)}`); await page.screenshot({ path: path.join(OUT, `${tag}-walk-fail.png`) });
    }
    await page.close();
  }
  await browser.close();
  fs.writeFileSync(path.join(OUT, 'proof.json'), JSON.stringify(proof, null, 2));
  console.log(JSON.stringify({ bad: proof.bad, errors: proof.errors, broken: proof.cases.filter((c) => c.broken.length) }, null, 1));
})();
