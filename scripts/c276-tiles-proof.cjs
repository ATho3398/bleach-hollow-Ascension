// C.276 보충 proof (GDD 180장 1, 마스터AE 요청): 진화 뒤에 뜨는 타일 안내도 같은 입력 막기인지 — 방 '타일 3장'(tile-intro) · 모험 준비 [준비]/[타일 배치](tile-plan) · 상점 타일 뽑기(tile-draw).
// 새 게임 뒤 세이브를 '첫 진화 직후'(타일 열림·시작 타일 3장·타일 안내 대기, 첫 모험·회복 안내 끝)로 고쳐 다시 연다. 단계마다 c276-proof 와 같은 3가지(다른 곳 누름·◀·▼6번). 두 종족.
// 캡처 1배 844×390 docs/captures/c276/ : {종족}-6-tile-plan · {종족}-7-tile-draw. 결과 docs/captures/c276/proof-tiles.json. 실행: node scripts/c276-tiles-proof.cjs
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const { startServer, press, newGame, snap, probe } = require('./c276-proof.cjs');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'docs/captures/c276');
const FACTIONS = (process.env.C276_FACTIONS ?? '0,1').split(',').map(Number);

/** 세이브를 첫 진화 직후처럼 (GDD 64장 1번 grantStarterTiles 와 같은 값) */
async function afterFirstEvolution(page) {
  await page.evaluate(() => {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      const raw = localStorage.getItem(k);
      if (!raw || !raw.includes('"runLog"')) continue;
      const data = JSON.parse(raw);
      const walk = (o) => {
        if (!o || typeof o !== 'object') return;
        if (o.nest && o.help && o.runLog) {
          for (const g of Object.keys(o.help.guides)) o.help.guides[g] = 'done';
          Object.assign(o.help.guides, { birth: 'done', 'home-intro': 'done', 'first-run': 'done', 'first-run-room': 'done', recover: 'done', 'tile-intro': 'pending', 'tile-plan': 'pending' });
          delete o.help.guides['tile-draw'];
          o.tiles.unlocked = true;
          for (const id of ['prey-nest-a', 'elite-den-a', 'rest-a']) o.tiles.collection[id] = (o.tiles.collection[id] ?? 0) + 1;
          o.shared.tradeCoins = 5000;
          Object.assign(o.nest, { hunger: 80, condition: 80, hpFraction: 1, spa: null, careRequest: null, collapsed: false, collapsedAt: 0, weakened: false, tired: false, dead: false });
        }
        for (const v of Object.values(o)) walk(v);
      };
      walk(data);
      localStorage.setItem(k, JSON.stringify(data));
    }
  });
}

async function reopen(page) {
  await page.reload();
  await page.waitForTimeout(1500);
  const cont = page.getByRole('button', { name: '이어하기' });
  if (await cont.count()) { await cont.first().click().catch(() => {}); await page.waitForTimeout(600); }
  const slot = page.locator('.bha-slot').first();
  if (await slot.count()) { await slot.click().catch(() => {}); await page.getByRole('button', { name: '확인' }).click().catch(() => {}); await page.waitForTimeout(1500); }
}

/** 안내가 떠 있는 동안: 검사 한 번(처음 보는 카드만) 뒤 ✓ 로 다음 */
async function walkGuide(page, res, shotFor, shot) {
  for (let i = 0; i < 30; i++) {
    const s = await snap(page);
    if (!s?.tut) return;
    const key = `${s.screen}|${s.tut}|${s.step}|${s.title}`;
    if (!res.seen.has(key)) {
      res.seen.add(key);
      await page.waitForTimeout(300);
      res.probes.push(await probe(page, key, shotFor(s), shot));
    }
    await press(page, 'ok', 600);
  }
}

const click = async (page, selector, wait = 900) => { await page.locator(selector).first().click({ timeout: 3000 }); await page.waitForTimeout(wait); };

(async () => {
  const srv = await startServer();
  const browser = await chromium.launch();
  const proof = { factions: {}, errors: [], shots: [] };
  const shot = async (page, name) => { await page.screenshot({ path: path.join(OUT, `${name}.png`) }); proof.shots.push(`${name}.png`); };
  try {
    for (const fi of FACTIONS) {
      const fname = fi === 0 ? 'hollow' : 'shinigami';
      const page = await browser.newPage({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 1 });
      page.on('pageerror', (e) => proof.errors.push(`${fname}: ${e.message}`));
      const res = { probes: [], seen: new Set(), path: [] };
      proof.factions[fname] = res;
      await newGame(page, srv.url, fi);
      await page.waitForTimeout(2500);
      await afterFirstEvolution(page);
      await reopen(page);
      // ① 방: 타일 안내(tile-intro)
      for (let t = 0; t < 30 && !(await snap(page))?.tut; t++) await page.waitForTimeout(250);
      res.path.push(`room: ${(await snap(page))?.tut}`);
      await walkGuide(page, res, () => null, shot);
      // ② 모험 준비: 방 → 월드맵 → 모험 → 준비 화면의 tile-plan 안내([준비] → [타일 배치])
      await click(page, '.bha-prop--outside', 1800);
      await click(page, '.bha-worldmap [data-place="adventure"]', 2500);
      for (let t = 0; t < 20 && !(await snap(page))?.tut; t++) await page.waitForTimeout(250);
      res.path.push(`depart: ${(await snap(page))?.screen} ${(await snap(page))?.tut}`);
      // [준비]/[타일 배치] 탭을 직접 눌러 본다 (안내 중이라 안 바뀌어야 함)
      res.tabs = [];
      for (const name of ['타일 배치', '준비']) {
        const tab = page.locator('.bha-lcd button, .bha-lcd [role="tab"]').filter({ hasText: name }).first();
        const box = await tab.boundingBox().catch(() => null);
        if (!box) { res.tabs.push({ name, found: false }); continue; }
        const before = await snap(page);
        const html0 = await page.evaluate(() => document.querySelector('.bha-lcd .bha-app')?.className + '|' + [...document.querySelectorAll('.bha-lcd [aria-selected="true"], .bha-lcd [aria-pressed="true"], .bha-lcd .is-active')].map((e) => e.textContent.trim().slice(0, 10)).join(','));
        await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
        await page.waitForTimeout(700);
        const after = await snap(page);
        const html1 = await page.evaluate(() => document.querySelector('.bha-lcd .bha-app')?.className + '|' + [...document.querySelectorAll('.bha-lcd [aria-selected="true"], .bha-lcd [aria-pressed="true"], .bha-lcd .is-active')].map((e) => e.textContent.trim().slice(0, 10)).join(','));
        res.tabs.push({ name, found: true, unchanged: html0 === html1 && before.step === after.step && before.tut === after.tut, state: html1 });
      }
      let planShot = false;
      await walkGuide(page, res, (s) => (s.tut === 'tile-plan' && !planShot ? ((planShot = true), `${fname}-6-tile-plan`) : null), shot);
      // ③ 상점: 준비 화면에서 나와 월드맵 → 시장 → 상점 → 타일 탭 → 타일 뽑기 → 산다 → 카드 [확인] → tile-draw 안내
      for (let t = 0; t < 4 && !(await page.locator('.bha-lcd .bha-worldmap').count()); t++) await press(page, 'back', 900);
      res.path.push(`back: ${(await snap(page))?.screen}`);
      if (!(await page.locator('.bha-lcd .bha-worldmap').count())) await click(page, '.bha-prop--outside', 1800);
      await click(page, '.bha-worldmap [data-place="market"]', 2500);
      res.path.push(`market: ${(await snap(page))?.screen}`);
      await page.getByText('소모품 상점', { exact: true }).first().click();
      await page.waitForTimeout(1500);
      await page.locator('.bha-lcd [role="tab"]').filter({ hasText: '타일' }).first().click();
      await page.waitForTimeout(800);
      await page.locator('.bha-lcd').getByText('타일 뽑기', { exact: true }).first().click();
      await page.waitForTimeout(900);
      await shot(page, `_dialog-${fname}`);
      // 상세 창의 사기 버튼(가격 버튼)
      await page.locator('.bha-itemdialog [data-act], .bha-itemdialog .bha-itemmodal__acts button').first().click();
      await page.waitForTimeout(900);
      const confirmBtn = page.getByRole('button', { name: /^(확인|사기|산다)/ });
      if (await confirmBtn.count()) { await confirmBtn.first().click().catch(() => {}); await page.waitForTimeout(1500); }
      await shot(page, `_card-${fname}`);
      // 카드 [확인] → tile-draw 안내
      for (let t = 0; t < 6 && !(await snap(page))?.tut; t++) {
        const ok = page.locator('.bha-draw button').filter({ hasText: '확인' });
        if (await ok.count()) await ok.first().click().catch(() => {});
        await page.waitForTimeout(800);
      }
      res.path.push(`shop: ${(await snap(page))?.screen} ${(await snap(page))?.tut}`);
      let drawShot = false;
      await walkGuide(page, res, (s) => (s.tut === 'tile-draw' && !drawShot ? ((drawShot = true), `${fname}-7-tile-draw`) : null), shot);
      fs.writeFileSync(path.join(OUT, 'proof-tiles.json'), JSON.stringify(proof, (k, v) => (v instanceof Set ? [...v] : v), 2));
      await page.close();
    }
  } catch (e) {
    proof.errors.push(String((e && e.stack) || e));
  } finally {
    await browser.close();
    srv.stop();
  }
  const all = Object.values(proof.factions).flatMap((f) => f.probes);
  const tabs = Object.values(proof.factions).flatMap((f) => f.tabs ?? []);
  proof.summary = { tabTouches: tabs.length, tabTouchesIgnored: tabs.filter((t) => t.unchanged).length, probes: all.length, ok: all.filter((p) => p.ok).length, failed: all.filter((p) => !p.ok).map((p) => p.label), labels: all.map((p) => p.label) };
  fs.writeFileSync(path.join(OUT, 'proof-tiles.json'), JSON.stringify(proof, (k, v) => (v instanceof Set ? [...v] : v), 2));
  console.log(JSON.stringify(proof.summary, null, 2), proof.errors.slice(0, 3), JSON.stringify(Object.fromEntries(Object.entries(proof.factions).map(([k, v]) => [k, v.path]))));
})();
