// C.314 proof (GDD 194장 ①~⑤, 코딩224): 튜토리얼 각본 전투 3번째 카드에서
// A) 자리 비움(visibilitychange·blur) → 복귀 → 일시정지 창(카드·강조 틀 숨김, [계속]/[설정]이 맨 위) → [계속] → 같은 카드가 다시 뜬다
// B) 새 버전 창이 뜨면 카드가 숨고 [다시 시작]·[나중에]가 맨 위에서 눌리며 창·버튼이 판(LCD) 안에 들어간다 → [나중에] → 같은 카드
// 두 종족 × PC 844×390(마우스) · 폰 796×384(터치). 캡처 1배 docs/captures/c314/. 실행: node scripts/c314-proof.cjs (C314_URL=<주소>)
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
if (process.env.C314_URL) process.env.C276_URL = process.env.C314_URL;
const { startServer, press, newGame, snap } = require('./c276-proof.cjs');
const { setAway, awayLook, pressPoint } = require('./c279-proof.cjs');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'docs/captures/c314');
const DEVICES = [
  { id: 'pc', viewport: { width: 844, height: 390 }, touch: false },
  { id: 'phone', viewport: { width: 796, height: 384 }, touch: true },
];

/** 각본 전투 3번째 카드가 뜰 때까지 안내대로 누른다 (c279 와 같은 방식, 간단히) */
async function toScriptCard3(page, tap) {
  for (let i = 0; i < 500; i++) {
    const s = await snap(page);
    if (!s) { await page.waitForTimeout(200); continue; }
    if (s.tut === 'script' && /3 \//.test(s.step ?? '')) return s;
    if (s.tut) {
      await page.waitForTimeout(300);
      const pt = await pressPoint(page);
      if (!pt || pt.kind === 'wait') { await page.waitForTimeout(300); continue; }
      await tap(pt.x, pt.y);
      await page.waitForTimeout(pt.kind === 'target' ? 1200 : 400);
      continue;
    }
    if (s.screen.includes('room')) {
      if (s.screen.includes('worldmap')) await press(page, 'back', 800);
      else await page.waitForTimeout(250);
      continue;
    }
    if (s.screen === 'none' || s.screen.includes('bha-exp')) { await page.waitForTimeout(250); continue; }
    await press(page, 'ok', 300);
  }
  return null;
}

/** 새 버전 창: 카드 숨김 · 버튼이 맨 위 · 창과 버튼이 판(LCD) 안 */
const updateLook = (page) => page.evaluate(() => {
  const vis = (e) => { if (!e) return false; const r = e.getBoundingClientRect(); const cs = getComputedStyle(e); return r.width > 2 && r.height > 2 && cs.visibility !== 'hidden' && cs.display !== 'none'; };
  const layer = document.querySelector('.bha-update');
  if (!layer) return { open: false };
  const card = layer.querySelector('.bha-update__card').getBoundingClientRect();
  const lcd = (document.querySelector('.bha-lcd') ?? document.body).getBoundingClientRect();
  const btns = [...layer.querySelectorAll('button')].map((b) => {
    const r = b.getBoundingClientRect();
    const t = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return { label: b.textContent.trim(), top: !!t && b.contains(t), inCard: r.left >= card.left - 0.5 && r.right <= card.right + 0.5, x: r.left + r.width / 2, y: r.top + r.height / 2 };
  });
  return {
    open: true,
    cardShown: [...document.querySelectorAll('.bha-tut .bha-tut__card')].filter(vis).length,
    inLcd: card.left >= lcd.left - 0.5 && card.right <= lcd.right + 0.5 && card.top >= lcd.top - 0.5 && card.bottom <= lcd.bottom + 0.5,
    btns,
  };
});

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const srv = await startServer();
  const browser = await chromium.launch();
  const proof = { runs: [], errors: [], shots: [] };
  try {
    for (const dev of DEVICES) {
      for (const fi of [0, 1]) {
        const fname = fi === 0 ? 'hollow' : 'shinigami';
        const ctx = await browser.newContext({ viewport: dev.viewport, deviceScaleFactor: 1, hasTouch: dev.touch, isMobile: dev.touch });
        const page = await ctx.newPage();
        page.on('pageerror', (e) => proof.errors.push(`${dev.id}/${fname}: ${e.message}`));
        const tap = (x, y) => (dev.touch ? page.touchscreen.tap(x, y) : page.mouse.click(x, y));
        const shot = async (name) => { const f = `${dev.id}-${fname}-${name}.png`; await page.screenshot({ path: path.join(OUT, f) }); proof.shots.push(f); };
        const r = { device: dev.id, faction: fname };
        proof.runs.push(r);
        await newGame(page, srv.url, fi);
        const s0 = await toScriptCard3(page, tap);
        if (!s0) { r.error = '각본 전투 3번째 카드에 못 닿음'; await ctx.close(); continue; }
        await page.waitForTimeout(600);
        r.card = { step: s0.step, title: s0.title };
        const same = async () => { const s = await snap(page); const l = await awayLook(page); return s?.step === s0.step && s?.title === s0.title && (l?.cardShown ?? 0) > 0; };
        // A) 자리 비움 → 복귀
        await setAway(page, true);
        await page.waitForTimeout(500);
        await setAway(page, false);
        await page.waitForTimeout(700);
        const paused = await awayLook(page);
        r.away = { paused };
        await shot('1-away-paused');
        if (paused?.pause) { await tap(paused.x, paused.y); await page.waitForTimeout(1000); }
        const back = await awayLook(page);
        r.away.pauseClosed = !!back && !back.pause;
        r.away.sameCard = await same();
        await shot('2-resumed-card');
        r.away.ok = !!paused?.pause && paused.cardShown === 0 && paused.holeShown === 0 && paused.contTop === true && paused.settTop === true && r.away.pauseClosed && r.away.sameCard;
        // B) 새 버전 창 (폰만 캡처 — 10장 이내)
        await page.evaluate(async () => (await import('/src/pwa.ts')).markUpdateReadyForTest());
        await page.waitForTimeout(500);
        const up = await updateLook(page);
        r.update = { look: up };
        if (dev.touch) await shot('3-update');
        const later = up.btns?.find((b) => b.label.includes('나중에'));
        if (later) { await tap(later.x, later.y); await page.waitForTimeout(800); }
        r.update.closed = !(await page.evaluate(() => !!document.querySelector('.bha-update')));
        r.update.sameCard = await same();
        r.update.ok = up.open && up.cardShown === 0 && up.inLcd && up.btns.every((b) => b.top && b.inCard) && r.update.closed && r.update.sameCard;
        r.ok = r.away.ok && r.update.ok;
        console.log(JSON.stringify(r));
        await ctx.close();
      }
    }
  } catch (e) {
    proof.errors.push(String((e && e.stack) || e));
  } finally {
    await browser.close();
    srv.stop();
  }
  proof.summary = { runs: proof.runs.length, ok: proof.runs.filter((x) => x.ok).length };
  fs.writeFileSync(path.join(OUT, 'proof.json'), JSON.stringify(proof, null, 2));
  console.log(JSON.stringify(proof.summary), proof.errors.slice(0, 5));
})();
