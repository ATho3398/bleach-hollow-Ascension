// C.306 proof (GDD 193장 1, 코딩218): ★1 권장(1단계 새 몸) 일반 적 전투 — 손 안 대는 판을 3초·14초·끝(결과 창)에 찍고 적 체력·시간을 기록한다.
// 조건: pc = 844×390 고정 / ph = 796×384 터치, 두 종족. 첫 원정 튜토리얼은 건너뛴 세이브(help.guides first-run = done).
// 쓰기: node scripts/c306-battle.cjs [저장 폴더]  (C306_URL=<주소> 이미 떠 있는 서버, C306_FACTIONS=0,1, C306_MODES=pc,ph)
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const { startServer } = require('./c276-proof.cjs');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.resolve(process.argv[2] || path.join(ROOT, 'docs/captures/c306'));
const FACTIONS = (process.env.C306_FACTIONS ?? '0,1').split(',').map(Number);
const MODES = (process.env.C306_MODES ?? 'pc,ph').split(',');
if (process.env.C306_URL) process.env.C276_URL = process.env.C306_URL;
const FNAME = ['hollow', 'shinigami'];
const VIEW = {
  pc: { viewport: { width: 844, height: 390 }, deviceScaleFactor: 1 },
  ph: { viewport: { width: 796, height: 384 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true },
};

async function fresh(page, url, fi) {
  const u = url; // 테스트 모드(능력치 전부 열림) 없이 진짜 새 세이브
  await page.goto(u); await page.evaluate(() => localStorage.clear()); await page.goto(u); await page.waitForTimeout(1200);
  await page.getByRole('button', { name: '새로 시작' }).click(); await page.waitForTimeout(300);
  await page.locator('.bha-slot').first().click(); await page.waitForTimeout(200);
  await page.getByRole('button', { name: '확인' }).click(); await page.waitForTimeout(300);
  await page.locator('.bha-species__card').nth(fi).click(); await page.waitForTimeout(300);
  await page.getByRole('button', { name: '시작', exact: true }).click(); await page.waitForTimeout(1800);
  // 첫 원정 튜토리얼·안내 카드를 본 것으로 (일반 ★1 전투를 바로 찍기 위해)
  await page.evaluate(() => {
    for (const k of Object.keys(localStorage)) {
      let s; try { s = JSON.parse(localStorage.getItem(k)); } catch { continue; }
      if (!s || typeof s !== 'object' || !s.help || !s.help.guides) continue;
      s.help.tutorialSeen = true;
      for (const id of Object.keys(s.help.guides)) s.help.guides[id] = 'done';
      s.help.guides['first-run'] = 'done';
      localStorage.setItem(k, JSON.stringify(s));
    }
  });
  await page.goto(u); await page.waitForTimeout(1200);
  await page.getByRole('button', { name: '이어하기' }).click().catch(() => {}); await page.waitForTimeout(1500);
  await page.locator('.bha-prop--outside').first().click(); await page.waitForTimeout(700);
  await page.locator('.bha-worldmap [data-place="adventure"]').first().click(); await page.waitForTimeout(2000);
}

const hud = (page) => page.evaluate(() => {
  const t = document.querySelector('.bha-battle .bha-v2time b')?.textContent ?? '';
  const hp = [...document.querySelectorAll('.bha-battle .bha-v2hp .bha-num')].map((e) => e.textContent.replace(/\s+/g, ''));
  return { timeLeft: Number(t), me: hp[0] ?? '', foe: hp[1] ?? '' }; // DOM 순서: 내 체력 막대 → 적 체력 막대
});

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const server = await startServer();
  const browser = await chromium.launch();
  const proof = { patch: 'C.306', shots: [], battles: [], errors: [] };
  try {
    for (const fi of FACTIONS) for (const mode of MODES) {
      const tag = `${FNAME[fi]}-${mode}`;
      const page = await browser.newPage(VIEW[mode]);
      page.on('pageerror', (e) => proof.errors.push(`${tag}: ${e.message.slice(0, 160)}`));
      const shot = async (name) => { await page.screenshot({ path: path.join(OUT, `${tag}-${name}.png`) }); proof.shots.push(`${tag}-${name}.png`); };
      await fresh(page, server.url, fi);
      await page.getByRole('button', { name: '★1', exact: true }).first().click().catch(() => {}); await page.waitForTimeout(300);
      await page.getByRole('button', { name: '출발', exact: true }).first().click(); await page.waitForTimeout(500);
      // 걷다가 첫 전투 (.bha-battle 이 생길 때까지)
      await page.locator('.bha-battle').first().waitFor({ timeout: 90_000 });
      const rec = { tag, start: null, at3: null, at14: null, end: null, result: null, endAt: null };
      rec.start = await hud(page);
      const untilElapsed = async (sec) => { for (let i = 0; i < 400; i++) { const h = await hud(page); if (!Number.isFinite(h.timeLeft) || 150 - h.timeLeft >= sec) return h; if (await page.locator('.bha-battle-ov--win, .bha-battle-ov--lose').count()) return h; await page.waitForTimeout(100); } return hud(page); };
      rec.at3 = await untilElapsed(3); await shot('battle-03s');
      rec.at14 = await untilElapsed(14); await shot('battle-14s');
      // 손 안 대고 끝까지
      const ov = page.locator('.bha-battle-ov--win, .bha-battle-ov--lose').first();
      await ov.waitFor({ timeout: 120_000 }).catch(() => {});
      rec.end = await hud(page);
      rec.result = (await page.locator('.bha-battle-ov--win').count()) ? 'won' : (await page.locator('.bha-battle-ov--lose').count()) ? 'lost' : 'unknown';
      await page.waitForTimeout(400);
      await shot('result');
      proof.battles.push(rec);
      console.log(tag, JSON.stringify(rec));
      await page.close();
    }
  } finally {
    fs.writeFileSync(path.join(OUT, 'proof.json'), JSON.stringify(proof, null, 1));
    await browser.close();
    server.stop();
  }
})();
