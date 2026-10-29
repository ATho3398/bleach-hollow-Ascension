// C.194 (GDD 120장 3): 실제 화면에서 발-그림자 차이·말풍선-머리 간격을 잰다 — 방·걷기·전투 × 종족·단계·진화체(이동 방식별 하나)·성별.
// 쓰는 법: 개발 서버(npx vite --port 5199)를 띄우고 `node scripts/foot-check/run.cjs [결과.json]`. 한 줄에 한 조합, 숫자 = 발 y − 그림자 y(px, 1배 844×390).
// 테스트 칸(?test 세이브 분리)에 세이브를 넣고 이어하기 → 방 측정·캐릭터 눌러 말풍선 → 모험·출발(걷기) / 더보기·테스트·바로 전투(전투).
// 단계가 높으면 출발하자마자 전투 칸이라 걷기가 비는(null) 조합이 있다. 같은 그림·같은 CSS 라 다른 조합 걷기 값으로 갈음한다.
// 자동 테스트(vitest)는 tests/c194.test.ts — 이 스크립트는 사람이 눈으로 확인할 때.
const { chromium } = require('playwright');
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '../..');
const URL = process.env.URL || 'http://localhost:5199/';
const ONLY = process.env.ONLY || 'room,walk,battle';
const SHOTS = process.env.SHOTS || '';
const forms = (() => { const d = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/data/evolution/forms.json'), 'utf8')); return Array.isArray(d) ? d : d.forms; })();
const combos = [];
for (const fac of ['shinigami', 'hollow'])
  for (let t = 0; t < 5; t++) {
    const seen = new Set();
    const ids = t === 0 ? [null] : forms.filter((f) => f.tier === t + 1 && !f.hidden && !seen.has(f.locomotion) && seen.add(f.locomotion)).map((f) => f.id);
    for (const form of ids) for (const gender of fac === 'shinigami' || t === 4 ? ['male', 'female'] : ['male']) combos.push({ fac, tier: t, gender, form });
  }
(async () => {

  const b = await chromium.launch();
  const rows = [];
  for (const c of combos) {
    const out = execSync(`npx vite-node scripts/foot-check/mksave.ts ${c.fac} ${c.tier} ${c.gender} ${c.form || ''}`, { cwd: ROOT }).toString();
    const { save } = JSON.parse(out.trim().split('\n').pop());
    const open = async () => {
      const ctx = await b.newContext({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 1 });
      const p = await ctx.newPage();
      await p.addInitScript(([v]) => { if (!sessionStorage.getItem('x')) { localStorage.setItem('bha-save-test', v); localStorage.setItem('bha-test-mode', '1'); sessionStorage.setItem('x', '1'); } }, [JSON.stringify(save)]);
      await p.addInitScript(fs.readFileSync(path.join(__dirname, 'measure.js'), 'utf8'));
      await p.goto(URL);
      await p.waitForTimeout(900);
      await p.click('text=이어하기'); await p.waitForTimeout(1500);
      return { ctx, p };
    };
    const r = { ...c };
    try {
      if (ONLY.includes('room') || ONLY.includes('walk')) {
        const { ctx, p } = await open();
        r.loco = await p.$eval('.bha-char', (e) => e.dataset.loco);
        r.room = await p.evaluate(() => window.__measure('.bha-char__frame--solo', '.bha-char__shadow'));
        await p.$eval('.bha-char', (e) => e.click()); await p.waitForTimeout(350);
        r.bubble = await p.evaluate(() => { const b = document.querySelector('.bha-room__bubble'); const s = document.querySelector('.bha-room__scene, .bha-scene') || b.parentElement; const br = b.getBoundingClientRect(); const sr = b.parentElement.getBoundingClientRect(); return { hidden: b.hidden, bottom: br.bottom, top: br.top, left: br.left, right: br.right, sceneTop: sr.top, side: b.className }; });
        r.room2 = await p.evaluate(() => window.__measure('.bha-char__frame--solo', '.bha-char__shadow'));
        if (SHOTS) await p.screenshot({ path: path.join(SHOTS, `room-${c.fac}-${c.tier + 1}-${c.gender}-${(c.form || 'base').replace(/:/g, '_')}.png`) });
        if (ONLY.includes('walk')) {
          await p.click('text=모험'); await p.waitForTimeout(800);
          await p.click('text=출발'); await p.waitForSelector('.bha-walker__img', { timeout: 3000 }).catch(() => {}); await p.waitForTimeout(250);
          r.walk = await p.evaluate(() => window.__measure('.bha-walker__img', '.bha-walker__shadow'));
          if (SHOTS) await p.screenshot({ path: path.join(SHOTS, `walk-${c.fac}-${c.tier + 1}-${c.gender}-${(c.form || 'base').replace(/:/g, '_')}.png`) });
        }
        await ctx.close();
      }
      if (ONLY.includes('battle')) {
        const { ctx, p } = await open();
        await p.click('[aria-label="더보기"]'); await p.waitForTimeout(300);
        await p.click('text=테스트'); await p.waitForTimeout(500);
        await p.click('.bha-viewtitle, [aria-haspopup]').catch(() => {}); await p.waitForTimeout(300); await p.click('[role=option]:has-text("바로 전투")'); await p.waitForTimeout(400);
        await p.click('text=전투 시작'); await p.waitForTimeout(2500);
        r.battle = await p.evaluate(() => window.__measure('.bha-hero__img', '.bha-hero__shadow'));
        r.battleLoco = await p.$eval('.bha-hero', (e) => e.dataset.loco).catch(() => null);
        if (SHOTS) await p.screenshot({ path: path.join(SHOTS, `battle-${c.fac}-${c.tier + 1}-${c.gender}-${(c.form || 'base').replace(/:/g, '_')}.png`) });
        await ctx.close();
      }
    } catch (e) { r.err = String(e).slice(0, 200); }
    const d = (m) => (m && m.foot != null && m.shadow != null ? +(m.foot - m.shadow).toFixed(1) : null);
    const bb = r.bubble, h = r.room2;
    const bub = bb && h ? (bb.hidden ? 'hidden' : (bb.side.includes('is-side') ? 'side' : 'above') + ' gap=' + (h.head - bb.bottom).toFixed(1) + ' inScene=' + (bb.top >= bb.sceneTop)) : '-';
    console.log(`bubble[${bub}] ` + `${c.fac} t${c.tier} ${c.gender} ${c.form || '-'} loco=${r.loco}/${r.battleLoco} room=${d(r.room)} walk=${d(r.walk)} battle=${d(r.battle)} ${r.err || ''}`);
    rows.push(r);
  }
  if (process.argv[2]) fs.writeFileSync(process.argv[2], JSON.stringify(rows, null, 1));
  await b.close();
})();
