// C.287 proof (GDD 183장 화면 D, 코딩202): 리디자인 v2 — 흡수(갈래·특성 고르기·[내 상태] 창) · 결과(승리/패배) · 진화 연출·결과. 두 종족, 테스트 모드(?test=1).
// 흡수 = 진짜 모험 ★1 전투(적 체력을 1로 줄여 빨리 이김). 결과 = 그 모험 저장을 되살려 resultView 를 직접 그림(승리 톤·패배 톤). 진화 = 테스트 패널 '다음 진화'.
// 캡처 1배 844×390 docs/captures/c287/ + 버튼 위치·글자 넘침 실측 proof.json
// 실행: node scripts/c287-proof.cjs (C287_URL=<주소>, C287_FACTIONS=0,1)
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'docs/captures/c287');
const PORT = 5387;
const FACTIONS = (process.env.C287_FACTIONS ?? '0,1').split(',').map(Number);

async function startServer() {
  if (process.env.C287_URL) return { url: process.env.C287_URL, stop: () => {} };
  const p = spawn('npx', ['vite', '--port', String(PORT), '--strictPort'], { cwd: ROOT, stdio: 'pipe', detached: true });
  const url = `http://localhost:${PORT}/`;
  for (let i = 0; i < 60; i++) {
    try { if ((await fetch(url)).ok) return { url, stop: () => { try { process.kill(-p.pid); } catch { /* */ } } }; } catch { /* */ }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error('vite 서버가 뜨지 않았다');
}

/** LCD 안 보이는 글자 요소 중 가로로 잘린 것 */
const overflowInPage = () => [...document.querySelectorAll('.bha-lcd button, .bha-lcd .bha-chip, .bha-lcd .bha-num, .bha-lcd [class*="__name"], .bha-lcd [class*="__label"], .bha-lcd .bha-title')]
  .filter((e) => {
    const r = e.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) return false;
    const cs = getComputedStyle(e);
    return e.scrollWidth > e.clientWidth + 1 && cs.overflowX !== 'visible' && cs.textOverflow !== 'ellipsis';
  })
  .map((e) => `${String(e.className).split(' ')[0]} '${(e.textContent || '').trim().slice(0, 16)}' ${e.scrollWidth}>${e.clientWidth}`);
/** 글자 12px 미만 · 버튼 높이 36 미만 (보이는 것만) */
const sizeCheck = () => {
  const small = [...document.querySelectorAll('.bha-lcd *')].filter((e) => e.childNodes.length && [...e.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim()) && e.getBoundingClientRect().width > 1 && parseFloat(getComputedStyle(e).fontSize) < 12).map((e) => `${String(e.className).split(' ')[0]} ${getComputedStyle(e).fontSize} '${e.textContent.trim().slice(0, 12)}'`);
  const lowBtn = [...document.querySelectorAll('.bha-lcd button')].filter((b) => { const r = b.getBoundingClientRect(); return r.width > 1 && r.height < 35.5 && !b.closest('.bha-dev__btns'); }).map((b) => `${(b.textContent || b.getAttribute('aria-label') || '').trim().slice(0, 12)} ${Math.round(b.getBoundingClientRect().height)}`);
  return { small: small.slice(0, 10), lowBtn };
};

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const srv = await startServer();
  const browser = await chromium.launch();
  const proof = { shots: [], overflow: {}, size: {}, goY: {}, errors: [] };
  try {
    for (const fi of FACTIONS) {
      const fname = fi === 0 ? 'hollow' : 'shinigami';
      const page = await browser.newPage({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 1 });
      page.on('pageerror', (e) => proof.errors.push(`${fname}: ${e.message}`));
      const wait = (ms) => page.waitForTimeout(ms);
      const shot = async (name) => {
        await wait(400);
        const file = `${fname}-${name}.png`;
        await page.screenshot({ path: path.join(OUT, file) });
        proof.shots.push(file);
        proof.overflow[file] = await page.evaluate(overflowInPage);
        proof.size[file] = await page.evaluate(sizeCheck);
        console.log(file, proof.overflow[file].length, JSON.stringify(proof.size[file]));
      };
      const step = async (label, fn) => { try { await fn(); } catch (e) { proof.errors.push(`${fname} ${label}: ${String(e.message).split('\n')[0]}`); } };
      await page.goto(`${srv.url}?test=1`);
      await page.evaluate(() => localStorage.clear());
      await page.goto(`${srv.url}?test=1`);
      await wait(1200);
      await page.getByRole('button', { name: '새로 시작' }).click();
      await wait(300);
      await page.locator('.bha-slot').first().click();
      await wait(200);
      await page.getByRole('button', { name: '확인' }).click();
      await wait(300);
      await page.locator('.bha-species__card').nth(fi).click();
      await wait(300);
      await page.getByRole('button', { name: '시작', exact: true }).click();
      await wait(2500);
      await step('진화', async () => {
        // 테스트 칸은 4단계라 1단계로 되돌린 뒤 '다음 진화' (c280 과 같은 방식: 저장 JSON 을 고쳐 다시 연다)
        await page.evaluate(() => {
          for (let i = 0; i < localStorage.length; i++) {
            const k = localStorage.key(i);
            const raw = localStorage.getItem(k);
            if (!raw || !raw.includes('"evolution"') || !raw.includes('"meta"')) continue;
            const d = JSON.parse(raw);
            const ts = [d, ...(Array.isArray(d.tracks) ? d.tracks : Object.values(d.tracks ?? {}))].filter((t) => t && t.evolution);
            for (const t of ts) { t.evolution.tierIndex = 0; t.evolution.formId = null; t.evolution.formHistory = []; t.evolution.look = null; }
            localStorage.setItem(k, JSON.stringify(d));
          }
        });
        await page.reload();
        await wait(1200);
        await page.getByRole('button', { name: '이어하기' }).first().click();
        await wait(2500);
        for (let i = 0; i < 4 && (await page.locator('.bha-lcd [data-dev-layer]').count()); i++) { await page.keyboard.press('Escape'); await wait(250); }
        await page.locator('.bha-lcd').getByRole('button', { name: '더보기' }).click();
        await wait(500);
        await page.locator('.bha-homedock__tray').getByRole('button', { name: '테스트' }).click();
        await wait(700);
        await page.locator('.bha-lcd .bha-viewtitle__btn').first().click();
        await page.locator('.bha-viewtitle__list').getByRole('option', { name: '진화', exact: true }).click();
        await wait(400);
        await page.getByRole('button', { name: '다음 진화' }).click({ timeout: 4000 });
        await wait(1900);
        await shot('6-evolve-lines');
        await wait(2600);
        await shot('7-evolve-result');
      });
      // 방으로: 다시 열고 [이어하기]
      await page.goto(`${srv.url}?test=1`);
      await wait(1200);
      await page.getByRole('button', { name: '이어하기' }).first().click();
      await wait(2500);
      await step('흡수', async () => {
        await page.locator('.bha-prop--outside').first().click();
        await wait(900);
        await page.locator('.bha-worldmap [data-place="adventure"]').first().click();
        await wait(2200);
        await page.locator('.bha-lcd').getByRole('button', { name: '★1', exact: true }).first().click();
        await wait(400);
        await page.locator('.bha-lcd').getByRole('button', { name: '출발', exact: true }).first().click();
        await page.locator('.bha-battle').waitFor({ timeout: 90_000 });
        for (let t = 0; t < 120 && !(await page.locator('.bha-absorbv2').count()); t++) {
          await page.evaluate(() => { const s = window.__bhaCombat; if (s && s.enemy) s.enemy.hp = Math.min(s.enemy.hp, 1); });
          const go = page.getByRole('button', { name: /하러 가기$|결과 보기/ });
          if (await go.count()) await go.first().click().catch(() => {});
          await wait(500);
        }
        await wait(800);
        // [○○하기] 버튼 y: 갈래 4개를 차례로 골라도 같은 자리 (GDD 173장 2)
        const ys = [];
        for (const m of ['both', 'trait', 'stat', 'none']) {
          await page.locator(`.bha-absorbv2 [data-mode="${m}"]`).click();
          await wait(150);
          ys.push(await page.evaluate(() => { const r = document.querySelector('.bha-absorb__go').getBoundingClientRect(); return [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)].join(','); }));
        }
        proof.goY[fname] = ys;
        await page.locator('.bha-absorbv2 [data-mode="both"]').click();
        await wait(150);
        await page.locator('.bha-absorb__go').focus();
        await shot('1-absorb');
        await page.locator('[data-absorb-me]').click();
        await wait(500);
        await shot('3-absorb-status');
        await page.keyboard.press('Escape');
        await wait(400);
        await page.locator('.bha-absorb__go').click();
        await wait(600);
        await shot('2-absorb-pick');
      });
      // 결과: 지금 모험 저장을 되살려 결과 화면을 그린다 (승리 톤 / 패배 톤)
      const drawResult = async (reason) => page.evaluate(async (reason) => {
        let snap = null;
        for (let i = 0; i < localStorage.length; i++) {
          const raw = localStorage.getItem(localStorage.key(i));
          if (!raw || !raw.includes('"activeExpedition"')) continue;
          try { const d = JSON.parse(raw); const a = d.activeExpedition ?? d.tracks?.find?.((t) => t.activeExpedition)?.activeExpedition; if (a) snap = a; } catch { /* */ }
        }
        if (!snap) return 'no-snapshot';
        const { restoreExpedition } = await import('/src/engine/expedition/snapshot.ts');
        const { getFaction } = await import('/src/data/factions/index.ts');
        const { resultView } = await import('/src/ui/resultView.ts');
        const r = restoreExpedition(snap);
        if (!r.ok) return `restore ${r.reason}`;
        const exp = r.exp;
        exp.endReason = reason;
        exp.phase = 'ended';
        exp.outcome = reason === 'battle-lost' ? 'defeated' : 'returned';
        resultView(document.querySelector('.bha-lcd__view'), getFaction(exp.factionId), exp, 42, () => {}, { newTraits: 1, evolvedTo: reason === 'returned' ? '?' : null, newTitles: [] });
        return 'ok';
      }, reason);
      await step('결과 승리', async () => { proof[`${fname}-result-win`] = await drawResult('returned'); await shot('4-result-win'); });
      await step('결과 패배', async () => { proof[`${fname}-result-lose`] = await drawResult('battle-lost'); await shot('5-result-lose'); });
      await page.close();
    }
  } catch (e) {
    proof.errors.push(String((e && e.stack) || e));
  } finally {
    await browser.close();
    srv.stop();
  }
  fs.writeFileSync(path.join(OUT, 'proof.json'), JSON.stringify(proof, null, 2));
  console.log(JSON.stringify(proof.errors, null, 1), JSON.stringify(proof.goY));
})();
