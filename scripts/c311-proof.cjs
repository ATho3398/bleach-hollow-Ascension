// C.311 proof (GDD 192장 1, 코딩217): 이어 하지 못한 원정 = 모험 실패 정산 → 방 안내 한 줄 캡처.
// 조건 2벌: pc = 844×390 / ph = 796×384 터치. 두 종족 × 경우(stale = 나간 뒤 40분, version = 옛 밸런스 버전) + 손상(corrupt, 호로 pc 1장). 1배.
// 흐름: 테스트 모드 새 세이브 → 저장소의 세이브에 원정 중간 저장(scratch JSON, 2바퀴째 전투 직전)을 넣고 시각/버전을 바꿈 → 다시 열어 [이어하기] → 방(안내 한 줄).
// 쓰기: node scripts/c304-proof.cjs <snaps.json> [저장 폴더]  (C304_URL=<주소> 이미 떠 있는 서버)
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const { startServer } = require('./c276-proof.cjs');

const ROOT = path.resolve(__dirname, '..');
const SNAPS = JSON.parse(fs.readFileSync(path.resolve(process.argv[2]), 'utf8'));
const OUT = path.resolve(process.argv[3] || path.join(ROOT, 'docs/captures/c304'));
if (process.env.C304_URL) process.env.C276_URL = process.env.C304_URL;
const FNAME = ['hollow', 'shinigami'];
const VIEW = {
  pc: { viewport: { width: 844, height: 390 }, deviceScaleFactor: 1 },
  ph: { viewport: { width: 796, height: 384 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true },
};
const KEY = 'bha-save-test';

async function fresh(page, url, fi) {
  const u = `${url}?test=1`;
  await page.goto(u); await page.evaluate(() => localStorage.clear()); await page.goto(u); await page.waitForTimeout(1200);
  await page.getByRole('button', { name: '새로 시작' }).click(); await page.waitForTimeout(300);
  await page.locator('.bha-slot').first().click(); await page.waitForTimeout(200);
  await page.getByRole('button', { name: '확인' }).click(); await page.waitForTimeout(300);
  await page.locator('.bha-species__card').nth(fi).click(); await page.waitForTimeout(300);
  await page.getByRole('button', { name: '시작', exact: true }).click(); await page.waitForTimeout(1800);
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const server = await startServer();
  const browser = await chromium.launch();
  const proof = { shots: {}, errors: [] };
  try {
    const cases = [];
    for (const fi of [0, 1]) for (const mode of ['pc', 'ph']) for (const kind of ['stale', 'version']) cases.push({ fi, mode, kind });
    cases.push({ fi: 0, mode: 'pc', kind: 'corrupt' });
    for (const { fi, mode, kind } of cases) {
      const tag = `${mode}-${FNAME[fi]}-${kind}`;
      const page = await browser.newPage(VIEW[mode]);
      page.on('pageerror', (e) => proof.errors.push(`${tag}: ${e.message.slice(0, 120)}`));
      await fresh(page, server.url, fi);
      const before = await page.evaluate((k) => { const s = JSON.parse(localStorage.getItem(k)); return { runs: s.runLog.runs.length, battles: s.runLog.battles.length, gold: s.shared.tradeCoins, collapsed: s.nest.collapsed }; }, KEY);
      await page.evaluate(([k, snap, kind]) => {
        const s = JSON.parse(localStorage.getItem(k));
        const a = JSON.parse(JSON.stringify(snap));
        if (kind === 'stale') a.savedAtMs = Date.now() - 40 * 60_000; // 40분 전 저장(나간 시각)
        else if (kind === 'version') { a.savedAtMs = Date.now() - 60_000; a.balanceVersion = a.balanceVersion - 1; } // 1분 전, 옛 밸런스
        else { a.savedAtMs = Date.now() - 60_000; a.exp.phase = 'nope'; } // 손상
        s.activeExpedition = a;
        s.lastScreen = 'expedition';
        localStorage.setItem(k, JSON.stringify(s));
      }, [KEY, SNAPS[FNAME[fi]], kind]);
      await page.goto(`${server.url}?test=1`); await page.waitForTimeout(1200);
      await page.getByRole('button', { name: '이어하기' }).click(); await page.waitForTimeout(1800);
      await page.screenshot({ path: path.join(OUT, `${tag}.png`) });
      const card = await page.evaluate(() => { const c = document.querySelector('.bha-confirm'); return c ? { title: c.querySelector('.bha-modal__title')?.textContent, body: c.querySelector('.bha-modal__body')?.textContent, box: (() => { const r = c.querySelector('.bha-modal').getBoundingClientRect(); return [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)]; })(), top: document.elementFromPoint(c.querySelector('.bha-modal').getBoundingClientRect().x + 10, c.querySelector('.bha-modal').getBoundingClientRect().y + 10)?.closest('.bha-confirm') !== null } : null; });
      await page.getByRole('button', { name: '확인' }).click().catch(() => {}); await page.waitForTimeout(400);
      if (tag === 'pc-hollow-stale') await page.screenshot({ path: path.join(OUT, `${tag}-after-card.png`) });
      const after = await page.evaluate((k) => {
        const s = JSON.parse(localStorage.getItem(k));
        const note = document.querySelector('.bha-room__note');
        const r = note?.getBoundingClientRect();
        const last = s.runLog.runs[s.runLog.runs.length - 1];
        return {
          screen: document.querySelector('.bha-room') ? 'room' : document.querySelector('.bha-exp') ? 'expedition' : 'other',
          note: note?.textContent ?? null, noteBox: r ? [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)] : null,
          active: s.activeExpedition, lastScreen: s.lastScreen, runs: s.runLog.runs.length, battles: s.runLog.battles.length, gold: s.shared.tradeCoins, collapsed: s.nest.collapsed,
          lastRun: last ? { endReason: last.endReason, abandoned: last.abandoned, outcome: last.outcome, laps: last.laps, gained: last.gained.length, lost: last.lost.length } : null,
        };
      }, KEY);
      proof.shots[tag] = { before, card, after };
      await page.close();
    }
  } finally {
    await browser.close();
    server.stop();
  }
  fs.writeFileSync(path.join(OUT, 'proof.json'), JSON.stringify(proof, null, 2));
  console.log(JSON.stringify(proof, null, 1).slice(0, 6000));
})();
