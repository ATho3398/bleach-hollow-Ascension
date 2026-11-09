// C.352 proof (GDD 213장, 코딩249): 튜토리얼 모험 준비(타일 안내 tile-plan)가 새 [타일 배치] 창 위에서 도는지 + 막히는 곳 0.
// 새 게임 → 세이브를 첫 진화 직후(타일 열림·시작 타일 3장·tile-plan 대기)로 → 방 → 월드맵 → 모험 → 안내 카드마다 c276 점검 3가지
// (다른 곳 누름 무시·◀ 무시·▼6번 초점 = 카드·대상만) + 대상이 보이는지. 끝 = [배치하기] 뒤 [타일 배치] 탭에서 타일 한 장 놓기.
// 조건 4벌: 호로/사신 × PC 844×390 / 폰 796×384 터치. 캡처(1배) docs/captures/c352/: hollow-phone-tile-plan · shinigami-pc-tile-plan ·
// hollow-pc-normal-plan(안내 끝난 뒤 다시 연 일반 모험 준비 [타일 배치]) · hollow-pc-next(안내 끝 → 타일 한 장 놓음). 결과 proof.json.
// 실행: node scripts/c352-proof.cjs
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const { startServer, press, newGame, snap, probe } = require('./c276-proof.cjs');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'docs/captures/c352');
const VIEW = {
  pc: { viewport: { width: 844, height: 390 }, deviceScaleFactor: 1 },
  phone: { viewport: { width: 796, height: 384 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true },
};
const RUNS = [['hollow', 0, 'phone'], ['shinigami', 1, 'pc'], ['hollow', 0, 'pc'], ['shinigami', 1, 'phone']];

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
          Object.assign(o.help.guides, { 'tile-intro': 'done', 'tile-plan': 'pending' });
          o.tiles.unlocked = true;
          for (const id of ['prey-nest-a', 'elite-den-a', 'rest-a']) o.tiles.collection[id] = (o.tiles.collection[id] ?? 0) + 1;
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

const click = async (page, selector, wait = 900) => { await page.locator(selector).first().click({ timeout: 3000 }); await page.waitForTimeout(wait); };

/** 지금 탭·안내 대상이 보이는지 */
const planState = (page) => page.evaluate(() => {
  const app = document.querySelector('.bha-lcd .bha-app.bha-plan');
  const vis = (q) => [...document.querySelectorAll(q)].some((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && !e.closest('[hidden]'); });
  return {
    place: !!app?.classList.contains('is-place'),
    tab: document.querySelector('.bha-plan__modetabs .is-on')?.textContent?.trim() ?? null,
    targets: { tabs: vis('.bha-plan__modetabs'), hand: vis('[data-help="plan.hand"]'), road: vis('[data-help="plan.road"]'), preset: vis('.bha-plan__side') },
    placed: [...document.querySelectorAll('.bha-plan__minicell')].filter((c) => /is-(prey|elite|env|rest)/.test(c.className)).length,
    roadTiles: document.querySelectorAll('[data-help="plan.road"] .bha-road__cell.is-filled, [data-help="plan.road"] [data-tile]').length,
  };
}).catch(() => null);

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const srv = await startServer();
  const browser = await chromium.launch();
  const proof = { runs: {}, errors: [], shots: [] };
  const shot = async (page, name) => { await page.screenshot({ path: path.join(OUT, `${name}.png`) }); proof.shots.push(`${name}.png`); };
  try {
    for (const [fname, fi, mode] of RUNS) {
      const key = `${fname}-${mode}`;
      const page = await browser.newPage(VIEW[mode]);
      page.on('pageerror', (e) => proof.errors.push(`${key}: ${e.message}`));
      const res = { probes: [], states: [], path: [] };
      proof.runs[key] = res;
      await newGame(page, srv.url, fi);
      await page.waitForTimeout(2500);
      await afterFirstEvolution(page);
      await reopen(page);
      await click(page, '.bha-prop--outside', 1800);
      await click(page, '.bha-worldmap [data-place="adventure"]', 2500);
      for (let t = 0; t < 20 && !(await snap(page))?.tut; t++) await page.waitForTimeout(250);
      res.path.push(`plan: ${(await snap(page))?.screen} ${(await snap(page))?.tut}`);
      const want = { tabs: 'tabs', '가진 타일': 'hand', '길에 놓기': 'road', '조합': 'road', '배치 프리셋': 'preset' };
      const seen = new Set();
      for (let i = 0; i < 12; i++) {
        const s = await snap(page);
        if (!s?.tut) break;
        const label = `${s.step}|${s.title}`;
        if (!seen.has(label)) {
          seen.add(label);
          await page.waitForTimeout(300);
          const st = await planState(page);
          const tgt = s.title === '타일 배치 탭' ? 'tabs' : want[s.title];
          res.states.push({ label, ...st, targetVisible: tgt ? st.targets[tgt] : null });
          if (s.title === '가진 타일' && ((fname === 'hollow' && mode === 'phone') || (fname === 'shinigami' && mode === 'pc'))) await shot(page, `${key}-tile-plan`);
          res.probes.push(await probe(page, `${key} ${label}`, null, shot));
        }
        await press(page, 'ok', 700);
      }
      // 안내 끝([배치하기]) → [타일 배치] 탭 그대로, 기기 ✓ 로 첫 카드 고르고 길 빈 칸에 놓기 (마우스로)
      const after = await planState(page);
      res.path.push(`after guide: place=${after.place} tab=${after.tab}`);
      await page.locator('[data-help="plan.hand"] .bha-tilecard, [data-help="plan.hand"] button').first().click({ timeout: 3000 }).catch((e) => res.path.push(`hand click fail ${e.message.slice(0, 60)}`));
      await page.waitForTimeout(400);
      await page.locator('[data-help="plan.road"] .bha-road__cell:not(.is-nest), [data-help="plan.road"] button').nth(1).click({ timeout: 3000 }).catch((e) => res.path.push(`road click fail ${e.message.slice(0, 60)}`));
      await page.waitForTimeout(600);
      const placed = await planState(page);
      res.path.push(`placed after guide: ${placed.placed}`);
      res.placedOk = placed.placed >= 1;
      if (key === 'hollow-pc') await shot(page, `${key}-next`);
      // 다시 열기 = 일반 모험 준비 (안내 끝, [준비] 탭으로 열림) → [타일 배치] 탭 눌러 같은 창
      await press(page, 'back', 1200);
      for (let t = 0; t < 3 && !(await page.locator('.bha-lcd .bha-worldmap').count()); t++) await press(page, 'back', 900);
      if (!(await page.locator('.bha-lcd .bha-worldmap').count())) await click(page, '.bha-prop--outside', 1800);
      await click(page, '.bha-worldmap [data-place="adventure"]', 2500);
      const normal0 = await planState(page);
      res.normal = { opensPrep: !normal0.place, tut: (await snap(page))?.tut ?? null };
      await page.locator('.bha-plan__modetabs [data-plan-side="place"]').click();
      await page.waitForTimeout(600);
      res.normal.placeTab = (await planState(page)).place;
      if (key === 'hollow-pc') await shot(page, `${key}-normal-plan`);
      await page.close();
    }
  } catch (e) {
    proof.errors.push(String((e && e.stack) || e));
  } finally {
    await browser.close();
    srv.stop();
  }
  const all = Object.values(proof.runs).flatMap((r) => r.probes);
  const states = Object.values(proof.runs).flatMap((r) => r.states);
  proof.summary = {
    probes: all.length, ok: all.filter((p) => p.ok).length, failed: all.filter((p) => !p.ok).map((p) => p.label),
    cardsOnPlaceTab: states.filter((s) => s.place).length, cards: states.length, targetsVisible: states.filter((s) => s.targetVisible).length,
    placedAfterGuide: Object.values(proof.runs).filter((r) => r.placedOk).length, runs: Object.keys(proof.runs).length,
    normalOpensPrep: Object.values(proof.runs).filter((r) => r.normal?.opensPrep && !r.normal?.tut && r.normal?.placeTab).length,
  };
  fs.writeFileSync(path.join(OUT, 'proof.json'), JSON.stringify(proof, null, 2));
  console.log(JSON.stringify(proof.summary, null, 2), proof.errors.slice(0, 3), JSON.stringify(Object.fromEntries(Object.entries(proof.runs).map(([k, v]) => [k, v.path]))));
})();
