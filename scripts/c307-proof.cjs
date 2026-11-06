// C.307 proof (GDD 193장 2·3·11·12·19, 코딩219): 모험 준비(출발 체력·설명 말로·프리셋 판 자리)·타일 다 놓은 뒤 빈 칸·바퀴 끝 창(체력·이번 바퀴 얻은 것) 캡처 + 폰 기계 점검.
// 조건: pc = 844×390 / ph = 796×384 터치 / ph115 = 796×384 터치 + 글자 1.15배. 두 종족. 홈 체력 30%(출발 확인 창이 뜨게).
// 쓰기: node scripts/c307-proof.cjs [저장 폴더]  (C307_URL=<주소> 이미 떠 있는 서버 — 전 캡처는 옛 빌드 주소로, C307_FACTIONS=0,1, C307_MODES=pc,ph,ph115)
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const { startServer } = require('./c276-proof.cjs');
const { phoneInPage } = require('./ui-audit/phone-checks.cjs');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.resolve(process.argv[2] || path.join(ROOT, 'docs/captures/c307'));
const FACTIONS = (process.env.C307_FACTIONS ?? '0,1').split(',').map(Number);
const MODES = (process.env.C307_MODES ?? 'pc,ph,ph115').split(',');
if (process.env.C307_URL) process.env.C276_URL = process.env.C307_URL;
const FNAME = ['hollow', 'shinigami'];
const VIEW = {
  pc: { viewport: { width: 844, height: 390 }, deviceScaleFactor: 1 },
  ph: { viewport: { width: 796, height: 384 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true },
  ph115: { viewport: { width: 796, height: 384 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true },
};

async function patch(page, src) {
  await page.evaluate((code) => {
    const f = new Function('t', code);
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      const raw = localStorage.getItem(k);
      if (!raw || !raw.includes('"runLog"')) continue;
      const data = JSON.parse(raw);
      const walk = (o) => { if (!o || typeof o !== 'object') return; if (o.nest && o.help && o.runLog) f(o); for (const v of Object.values(o)) walk(v); };
      walk(data);
      localStorage.setItem(k, JSON.stringify(data));
    }
  }, src);
}
async function closeLayers(page) {
  for (let i = 0; i < 6 && (await page.locator('.bha-tut, .bha-lcd .bha-guide').count()); i++) {
    const go = page.locator('.bha-tut button.bha-btn--primary:not([disabled]), .bha-lcd .bha-guide button.bha-btn--primary').filter({ visible: true });
    if (await go.count()) await go.first().click({ timeout: 1500 }).catch(() => {}); else await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
  }
}
async function fresh(page, url, fi) {
  const u = `${url}?test=1`;
  await page.goto(u); await page.evaluate(() => localStorage.clear()); await page.goto(u); await page.waitForTimeout(1200);
  await page.getByRole('button', { name: '새로 시작' }).click(); await page.waitForTimeout(300);
  await page.locator('.bha-slot').first().click(); await page.waitForTimeout(200);
  await page.getByRole('button', { name: '확인' }).click(); await page.waitForTimeout(300);
  await page.locator('.bha-species__card').nth(fi).click(); await page.waitForTimeout(300);
  await page.getByRole('button', { name: '시작', exact: true }).click(); await page.waitForTimeout(1800);
  await patch(page, `t.nest.hpFraction = 0.3;`);
  await page.goto(u); await page.waitForTimeout(1200);
  await page.getByRole('button', { name: '이어하기' }).click().catch(() => {}); await page.waitForTimeout(1500);
  await page.locator('.bha-prop--outside').first().click(); await page.waitForTimeout(700);
  await page.locator('.bha-worldmap [data-place="adventure"]').first().click(); await page.waitForTimeout(1800);
  await closeLayers(page);
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
      const facts = {};
      const page = await browser.newPage(VIEW[mode]);
      if (mode === 'ph115') await page.addInitScript((k) => {
        const put = () => { const st = document.createElement('style'); st.textContent = `:root{${[['xs', 12], ['sm', 13], ['md', 14], ['lg', 16], ['xl', 18], ['2xl', 22], ['3xl', 28], ['4xl', 36], ['5xl', 48]].map(([n, v]) => `--bha-fs-${n}:${(v * k).toFixed(2)}px !important;`).join('')}}`; document.head.append(st); };
        if (document.head) put(); else document.addEventListener('DOMContentLoaded', put);
      }, 1.15);
      page.on('pageerror', (e) => issues.push({ shot: '-', kind: '스크립트 오류', key: e.message.slice(0, 100) }));
      const shot = async (name) => {
        await page.waitForTimeout(250);
        await page.screenshot({ path: path.join(OUT, `${tag}-${name}.png`) });
        if (mode !== 'pc') for (const r of await page.evaluate(phoneInPage)) issues.push({ shot: name, ...r });
      };
      const goY = () => page.evaluate(() => { const r = document.querySelector('.bha-lcd [data-sc="go"]')?.getBoundingClientRect(); return r ? [Math.round(r.x), Math.round(r.y)] : null; });
      await fresh(page, server.url, fi);
      await page.getByRole('button', { name: '★1', exact: true }).first().click().catch(() => {}); await page.waitForTimeout(300);
      facts.prepGo = await goY();
      facts.descText = await page.locator('.bha-lcd .bha-plan__descscroll').textContent().catch(() => null);
      facts.hp = await page.locator('.bha-lcd [data-depart-hp]').getAttribute('data-depart-hp').catch(() => null);
      await shot('1-prep');
      // ⓘ 설명 칸 숫자
      if (await page.locator('.bha-lcd .bha-plan__descinfo').count()) { await page.locator('.bha-lcd .bha-plan__descinfo').click(); await page.waitForTimeout(300); await shot('2-prep-info'); await page.keyboard.press('Escape'); await page.waitForTimeout(200); }
      const placeTab = page.locator('.bha-lcd [data-plan-side="place"]');
      if (await placeTab.count()) {
        await placeTab.click(); await page.waitForTimeout(300);
        facts.placeGo = await goY();
        await shot('3-place-0');
        for (let i = 0; i < 14; i++) {
          if (!(await page.locator('.bha-lcd .bha-road__cell.is-can').count())) {
            const card = page.locator('.bha-lcd .bha-tilecard').first();
            if (!(await card.count())) break;
            await card.click({ timeout: 2000 }).catch(() => {}); await page.waitForTimeout(150);
          }
          const empty = page.locator('.bha-lcd .bha-road__cell.is-can').first();
          if (!(await empty.count())) break;
          await empty.click({ timeout: 2000 }).catch(() => {}); await page.waitForTimeout(150);
        }
        // 다 놓은 뒤 남은 카드를 하나 골라 본다(빈 칸이 놓을 수 있게 안 변해야 한다)
        await page.locator('.bha-lcd .bha-tilecard').first().click({ timeout: 1500 }).catch(() => {}); await page.waitForTimeout(200);
        facts.full = await page.evaluate(() => ({ dim: document.querySelectorAll('.bha-lcd .bha-road__cell.is-full').length, can: document.querySelectorAll('.bha-lcd .bha-road__cell.is-can').length, count: document.querySelector('.bha-lcd .bha-plan__line .bha-num')?.textContent, note: document.querySelector('.bha-lcd .bha-road__note')?.textContent }));
        await shot('4-place-full');
        await page.locator('.bha-lcd [data-plan-side="prep"]').click(); await page.waitForTimeout(300);
      } else issues.push({ shot: 'prep', kind: '탭 없음', key: '[타일 배치] 탭이 없다' });
      // [출발] → 체력 확인 창
      await page.getByRole('button', { name: '출발', exact: true }).first().click(); await page.waitForTimeout(500);
      facts.confirm = await page.locator('.bha-lcd [data-dev-layer]').filter({ visible: true }).textContent().catch(() => null);
      await shot('5-depart-confirm');
      const yes = page.locator('.bha-lcd [data-dev-layer] .bha-btn').filter({ hasText: '출발' });
      if (await yes.count()) { await yes.first().click(); await page.waitForTimeout(1200); }
      // 바퀴 끝 창: 저장된 원정을 길 끝 칸으로 옮기고 이번 바퀴 얻은 것을 넣은 뒤 이어하기 (호로 = 뽑기 있는 창, 사신 = 뽑기 없는 창: tilesLocked)
      await page.waitForTimeout(800);
      await patch(page, `const e = t.activeExpedition && (t.activeExpedition.exp ?? t.activeExpedition); if (e) { e.pos = e.slots.length - 1; e.phase = 'moving'; e.pending = null; e.queuedBattle = null; e.hpFraction = 0.27; e.victoriesThisLap = 3; e.foodLoot = [...(e.foodLoot ?? []), { food: 'snack', lap: e.lap }, { food: 'snack', lap: e.lap }]; e.goldLoot = [...(e.goldLoot ?? []), { amount: 45, lap: e.lap }]; ${fi === 1 && !process.env.C307_DRAFT_BOTH ? 'e.tilesLocked = true;' : ''} }`);
      await page.reload(); await page.waitForTimeout(1500);
      await page.getByRole('button', { name: '이어하기' }).click().catch(() => {}); await page.waitForTimeout(1500);
      for (let t = 0; t < 80; t++) {
        if (await page.getByRole('button', { name: '귀환', exact: true }).filter({ visible: true }).count()) break;
        const layerGo = page.locator('.bha-lcd [data-dev-layer] button.bha-btn--primary').filter({ visible: true });
        if (await layerGo.count()) await layerGo.first().click({ timeout: 1500 }).catch(() => {});
        await page.waitForTimeout(400);
      }
      facts.lap = await page.evaluate(() => ({ hp: document.querySelector('.bha-lcd [data-lap-hp]')?.getAttribute('data-lap-hp') ?? null, gain: document.querySelector('.bha-lcd [data-lap-gain]')?.textContent ?? null, mult: document.querySelector('.bha-lcd [data-continue-mult]')?.textContent ?? null }));
      facts.lapLayout = await page.evaluate(() => {
        const r = (q) => { const e = document.querySelector(q); if (!e) return null; const b = e.getBoundingClientRect(); return [Math.round(b.top), Math.round(b.bottom)]; };
        const body = document.querySelector('.bha-lcd .bha-lapend > .bha-win-body');
        return { sheet: r('.bha-lcd .bha-lapend'), body: r('.bha-lcd .bha-lapend > .bha-win-body'), bodyScroll: body ? [body.scrollHeight, body.clientHeight] : null, cards: r('.bha-lcd .bha-draft__row'), road: r('.bha-lcd .bha-nestsheet__body .bha-road'), note: r('.bha-lcd .bha-nestsheet__body .bha-road__noterow'), syn: r('.bha-lcd .bha-nestsheet__body .bha-road__synline'), foot: r('.bha-lcd .bha-lapend > .bha-continue'), btn: r('.bha-lcd .bha-lapend .bha-grid2'), notes: r('.bha-lcd .bha-lapend .bha-continue__notes') };
      });
      await shot('6-lapend');
      if (await page.locator('.bha-lcd .bha-continue__info').count()) { await page.locator('.bha-lcd .bha-continue__info').click(); await page.waitForTimeout(300); await shot('7-lapend-info'); }
      await page.close();
      const kinds = {};
      for (const i of issues) kinds[i.kind] = (kinds[i.kind] ?? 0) + 1;
      sum.push({ tag, kinds, facts, issues });
      console.log(tag, JSON.stringify(kinds), JSON.stringify(facts));
    }
  } finally {
    const file = path.join(OUT, 'proof.json');
    const old = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')).filter((o) => !sum.some((n) => n.tag === o.tag)) : [];
    fs.writeFileSync(file, JSON.stringify([...old, ...sum], null, 1));
    await browser.close();
    server.stop();
  }
})();
