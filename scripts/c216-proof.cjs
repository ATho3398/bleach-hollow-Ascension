// C.216 (GDD 138장) proof: 전투 좌우 반전 — 내 캐릭터 오른쪽·적 왼쪽, 블록 왼쪽에서 생겨 오른쪽으로. 캡처 docs/captures/c216/
// 실행: node scripts/c216-proof.cjs (vite 를 띄운다, C216_URL=<주소> 면 그 주소)
// 장면: 두 종족 일반 전투 · 블록 흐르는 중 · 블록 공격 순간(모션·투사체) · 보스 전투(큰 몸) · 각본 튜토리얼 전투 카드
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'docs/captures/c216');
const PORT = 5316;

async function startServer() {
  if (process.env.C216_URL) return { url: process.env.C216_URL, stop: () => {} };
  const p = spawn('npx', ['vite', '--port', String(PORT), '--strictPort'], { cwd: ROOT, stdio: 'pipe' });
  const url = `http://localhost:${PORT}/`;
  for (let i = 0; i < 60; i++) {
    try { if ((await fetch(url)).ok) return { url, stop: () => p.kill() }; } catch { /* 아직 */ }
    await new Promise((r) => setTimeout(r, 500));
  }
  p.kill();
  throw new Error('vite 서버가 뜨지 않았다');
}

async function newGame(page, url, fi, test) {
  const q = test ? '?test=1' : '';
  await page.goto(`${url}${q}`);
  await page.evaluate(() => localStorage.clear());
  await page.goto(`${url}${q}`);
  await page.waitForTimeout(1200);
  await page.getByRole('button', { name: '새로 시작' }).click();
  await page.waitForTimeout(300);
  await page.locator('.bha-slot').first().click();
  await page.getByRole('button', { name: '확인' }).click();
  await page.waitForTimeout(300);
  await page.locator('.bha-species__card').nth(fi).click();
  await page.waitForTimeout(300);
  await page.getByRole('button', { name: '시작', exact: true }).click();
  await page.waitForTimeout(1500);
}

const lcd = (page) => page.locator('.bha-lcd');

async function openTest(page, tab) {
  for (let i = 0; i < 4 && (await page.locator('.bha-lcd [data-dev-layer]').count()); i++) await page.keyboard.press('Escape');
  await lcd(page).getByRole('button', { name: '더보기' }).click();
  await page.waitForTimeout(500);
  await page.locator('.bha-homedock__tray').getByRole('button', { name: '테스트' }).click();
  await page.waitForTimeout(700);
  await page.locator('.bha-lcd .bha-viewtitle__btn').first().click();
  await page.locator('.bha-viewtitle__list').getByRole('option', { name: tab }).click();
  await page.waitForTimeout(400);
}

/** 고르기 목록에서 group 묶음의 n번째(없으면 이름 포함) 항목 */
async function pick(page, aria, group, nth = 0) {
  await page.locator(`.bha-lcd button.bha-pick[aria-label="${aria}"]`).click();
  await page.waitForTimeout(200);
  const ok = await page.evaluate(({ group, nth }) => {
    const box = document.querySelector('.bha-pick__list');
    if (!box) return false;
    let inGroup = false;
    let k = 0;
    for (const n of box.children) {
      if (n.classList.contains('bha-pick__group')) { inGroup = n.textContent === group; continue; }
      if (inGroup && n.getAttribute('role') === 'option') { if (k++ === nth) { n.click(); return true; } }
    }
    return false;
  }, { group, nth });
  await page.waitForTimeout(300);
  return ok;
}

/** 전투 배치 측정: 나·적 그림 중심(LCD 기준 x), 그림 뒤집힘, 블록 칸 위치 */
const measure = () => {
  const o = document.querySelector('.bha-lcd')?.getBoundingClientRect() ?? { left: 0, top: 0 };
  const cx = (s) => { const e = document.querySelector(s); if (!e) return null; const r = e.getBoundingClientRect(); return Math.round(r.left - o.left + r.width / 2); };
  const tf = (s) => { const e = document.querySelector(s); return e ? getComputedStyle(e).transform : null; };
  const cells = [...document.querySelectorAll('.bha-v2tray__grid > .bha-v2cell')].map((c) => ({ sc: c.dataset.sc, x: Math.round(c.getBoundingClientRect().left - o.left), has: !!c.firstElementChild }));
  return {
    me: cx('.bha-unit--me .bha-unit__fig'), foe: cx('.bha-unit--foe .bha-unit__fig'),
    meHp: cx('.bha-unit--me .bha-v2hp'), foeHp: cx('.bha-unit--foe .bha-v2hp'),
    heroImg: tf('.bha-hero__img'), foeImg: tf('.bha-foe__img') ?? tf('.bha-foe__body > svg'),
    cellsDomOrder: cells.map((c) => `${c.sc}@${c.x}${c.has ? '*' : ''}`).join(' '),
  };
};

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const server = await startServer();
  const browser = await chromium.launch();
  const proof = { runs: [] };
  try {
    for (const [fi, faction] of process.env.C216_FACTION ? [[Number(process.env.C216_FACTION), ['hollow', 'shinigami'][Number(process.env.C216_FACTION)]]] : [[0, 'hollow'], [1, 'shinigami']]) {
      const p = faction === 'hollow' ? 'h' : 's';
      const run = { faction, battles: [], errors: [] };
      // ① 테스트 바로 전투: 일반 · 보스(몸 크기 단계별)
      const scenes = [
        { id: 'normal', foeGroup: '일반', form: null },
        { id: 'boss', foeGroup: '보스', form: { group: '3단계', nth: 0 } },
        { id: 'elite-t2', foeGroup: '강적', form: { group: '2단계', nth: 0 }, noShot: true },
        { id: 'normal-t4', foeGroup: '일반', form: { group: '4단계', nth: 0 }, noShot: faction === 'shinigami' },
      ];
      for (const sc of process.env.C216_SKIP_TEST ? [] : scenes) {
        const page = await browser.newPage({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 1 });
        page.on('pageerror', (e) => run.errors.push(e.message));
        await newGame(page, server.url, fi, true);
        if (sc.form) {
          await openTest(page, '진화체');
          const ok = await pick(page, '진화체', sc.form.group, sc.form.nth);
          if (ok) await lcd(page).getByRole('button', { name: '이 몸으로' }).click();
          await page.waitForTimeout(600);
          for (let i = 0; i < 4 && (await page.locator('.bha-lcd [data-dev-layer]').count()); i++) await page.keyboard.press('Escape');
          await page.keyboard.press('Escape');
          await page.waitForTimeout(600);
        }
        await openTest(page, '바로 전투');
        await pick(page, '상대', sc.foeGroup, 0);
        await lcd(page).getByRole('button', { name: '전투 시작' }).click();
        await page.locator('.bha-battle').waitFor({ timeout: 20_000 });
        // 첫 전투 자동 튜토리얼이 뜨면 닫는다
        await page.waitForTimeout(1500);
        for (let i = 0; i < 3 && (await page.locator('.bha-tut').count()); i++) { await page.keyboard.press('Escape'); await page.waitForTimeout(300); }
        await page.waitForTimeout(2500);
        const m = { id: sc.id, ...(await page.evaluate(measure)) };
        if (!sc.noShot) await page.screenshot({ path: path.join(OUT, `${p}-${sc.id}.png`) });
        if (sc.id === 'normal') {
          // 블록이 쌓인 뒤(흐르는 중)
          await page.waitForTimeout(3500);
          m.flow = await page.evaluate(measure);
          await page.screenshot({ path: path.join(OUT, `${p}-blocks-flow.png`) });
          // 블록 공격 순간 (가장 오래된 블록 = 칸 1 = 맨 오른쪽): 즉발 + 계열 연출
          const cell = page.locator('.bha-v2tray__grid > .bha-v2cell[data-sc="block.1"] .bha-block');
          if (await cell.count()) {
            await cell.click();
            await page.waitForTimeout(faction === 'hollow' ? 260 : 380);
            m.fx = await page.evaluate(() => [...document.querySelectorAll('.bha-afx')].map((n) => n.className.replace('bha-afx ', '')).join(', '));
            await page.screenshot({ path: path.join(OUT, `${p}-block-fx.png`) });
          }
          // 적 공격 순간(넉백 방향)
          await page.waitForTimeout(1200);
        }
        run.battles.push(m);
        await page.close();
      }
      // ② 각본 튜토리얼 전투 (첫 원정 첫 전투): 막기 카드·체력 카드
      if (faction === 'hollow' || process.env.C216_TUT_ALL) {
        const page = await browser.newPage({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 1 });
        page.on('pageerror', (e) => run.errors.push(e.message));
        await newGame(page, server.url, fi, false);
        const vis = (l) => l.filter({ visible: true });
        for (let t = 0; t < 80 && !(await page.locator('.bha-battle').count()); t++) {
          const layerGo = vis(page.locator('.bha-lcd [data-dev-layer] button.bha-btn--primary:not([disabled]):not([aria-disabled="true"])'));
          if (await layerGo.count()) await layerGo.first().click({ timeout: 2000 }).catch(() => {});
          else await page.locator('.bha-dev__btn[aria-label="확정"]').first().click({ timeout: 2000 }).catch(() => {}); // 안내가 가리키는 것(문·출발)을 기기 ✓ 로
          await page.waitForTimeout(700);
        }
        if (!(await page.locator('.bha-battle').count())) await page.screenshot({ path: path.join(OUT, `debug-${p}.png`) });
        await page.locator('.bha-battle').waitFor({ timeout: 60_000 });
        const dev = (name) => page.locator(`.bha-dev__btn[aria-label="${name}"]`).first();
        const want = { 4: 'tut-hurt', 5: 'tut-block' };
        run.tut = [];
        let last = null;
        for (let t = 0; t < 300; t++) {
          if (await page.locator('.bha-battle.is-tutkill').count()) break;
          const card = await page.evaluate(() => {
            const l = document.querySelector('.bha-tut[data-tutorial="script"]');
            if (!l) return null;
            const sel = document.querySelector('.bha-sel');
            const c = l.querySelector('.bha-tut__card')?.getBoundingClientRect();
            const o = document.querySelector('.bha-lcd').getBoundingClientRect();
            return { step: l.querySelector('.bha-tut__step')?.textContent ?? '', title: l.querySelector('.bha-tut__title')?.textContent ?? '', wait: l.hasAttribute('data-dev-pass'), sel: sel ? (sel.dataset.sc ?? '') : null, card: c ? Math.round(c.left - o.left + c.width / 2) : null };
          });
          if (card && card.step !== last) {
            last = card.step;
            run.tut.push(card);
            const name = want[run.tut.length];
            await page.waitForTimeout(400);
            if (name) await page.screenshot({ path: path.join(OUT, `${p}-${name}.png`) });
          }
          if (card) {
            if (card.wait && !(card.sel && (card.sel === 'guard' || String(card.sel).startsWith('block.')))) await dev('아래').click();
            else await dev('확정').click();
            await page.waitForTimeout(500);
          } else await page.waitForTimeout(300);
        }
        await page.close();
      }
      proof.runs.push(run);
    }
  } finally {
    await browser.close();
    server.stop();
  }
  fs.writeFileSync(path.join(OUT, 'proof.json'), JSON.stringify(proof, null, 2));
  console.log(JSON.stringify(proof, null, 2));
})();
