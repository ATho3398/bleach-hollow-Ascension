// C.262 (GDD 178장 보충) proof: 전투 블록 생성 게이지 · 봉인 덮개 삭제 · 강조는 그림 모양대로. 캡처 docs/captures/c262/
// 덤(GDD 176장 22 같은 종류): 상태 화면 '노멀 피해' 줄 · 사신 4단계 진화 이유 오타. EXTRA=1 이면 그 캡처만
// 실행: node scripts/c261-proof.cjs [before] (vite 를 띄운다, C262_URL=<주소> 면 그 주소). before = 해방 오라 '전' 캡처만
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'docs/captures/c262');
const PORT = 5362;
const BEFORE = process.argv[2] === 'before';

async function startServer() {
  if (process.env.C262_URL) return { url: process.env.C262_URL, stop: () => {} };
  const p = spawn('npx', ['vite', '--port', String(PORT), '--strictPort'], { cwd: ROOT, stdio: 'pipe' });
  const url = `http://localhost:${PORT}/`;
  for (let i = 0; i < 60; i++) {
    try { if ((await fetch(url)).ok) return { url, stop: () => p.kill() }; } catch { /* 아직 */ }
    await new Promise((r) => setTimeout(r, 500));
  }
  p.kill();
  throw new Error('vite 서버가 뜨지 않았다');
}

async function newGame(page, url, fi) {
  await page.goto(`${url}?test=1`);
  await page.evaluate(() => localStorage.clear());
  await page.goto(`${url}?test=1`);
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
  await page.locator('.bha-viewtitle__list').getByRole('option', { name: tab, exact: true }).click();
  await page.waitForTimeout(400);
}
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
async function battle(page, url, fi, form, group = '일반', nth = 0) {
  await newGame(page, url, fi);
  if (form) {
    await openTest(page, '진화체');
    const ok = await pick(page, '진화체', form, 0);
    if (ok) await lcd(page).getByRole('button', { name: '이 몸으로' }).click();
    await page.waitForTimeout(600);
    for (let i = 0; i < 4 && (await page.locator('.bha-lcd [data-dev-layer]').count()); i++) await page.keyboard.press('Escape');
    await page.keyboard.press('Escape');
    await page.waitForTimeout(600);
  }
  await openTest(page, '바로 전투');
  await pick(page, '상대', group, nth);
  await lcd(page).getByRole('button', { name: '전투 시작' }).click();
  await page.locator('.bha-battle').waitFor({ timeout: 20_000 });
  await page.waitForTimeout(1500);
  for (let i = 0; i < 3 && (await page.locator('.bha-tut').count()); i++) { await page.keyboard.press('Escape'); await page.waitForTimeout(300); }
  // 적이 죽지 않게(캡처 동안) 적 체력을 크게
  await page.evaluate(() => { const s = window.__bhaCombat; if (s) { s.enemy.maxHp *= 50; s.enemy.hp = s.enemy.maxHp; } });
}
const spawnInfo = () => {
  const s = window.__bhaCombat;
  const pill = document.querySelector('.bha-v2role--spawn');
  const o = document.querySelector('.bha-lcd').getBoundingClientRect();
  const r = (q) => { const e = document.querySelector(q); if (!e) return null; const b = e.getBoundingClientRect(); return { x: Math.round(b.left - o.left), y: Math.round(b.top - o.top), w: Math.round(b.width) }; };
  return { state: pill?.dataset.state, fill: pill?.querySelector('.bha-v2role__bar i')?.style.width, label: pill?.getAttribute('aria-label'), tray: s?.tray.length, cap: s?.params.trayCapacity, spawnTimer: s?.spawnTimer, sealTicks: s?.sealTicks,
    pill: r('.bha-v2role--spawn'), guard: r('.bha-v2role--guard'), item: r('.bha-v2role--item'), gear: r('.bha-v2role--gear'),
    cellsVisible: [...document.querySelectorAll('.bha-v2tray__grid .bha-block')].filter((b) => b.getBoundingClientRect().width > 0).length,
    veil: document.querySelectorAll('.bha-v2tray__veil').length };
};


const probe = async (page) => {
  const out = [];
  for (let i = 0; i < 40; i++) {
    out.push(await page.evaluate(() => { const b = document.querySelector('.bha-unit--foe .bha-foe__body'); const f = b.closest('.bha-foe'); return `${f.className.replace('bha-foe','').trim()}|${getComputedStyle(b).filter.slice(0, 60)}`; }));
    await page.waitForTimeout(100);
  }
  const c = {};
  for (const x of out) c[x] = (c[x] || 0) + 1;
  return c;
};

async function extra(browser, url) {
  const out = {};
  // 상태 화면 피해 줄 (호로)
  let page = await browser.newPage({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 1 });
  await newGame(page, url, 0);
  for (let i = 0; i < 4 && (await page.locator('.bha-lcd [data-dev-layer]').count()); i++) await page.keyboard.press('Escape');
  await page.locator('.bha-room__status').click();
  await page.waitForTimeout(700);
  const rowsAt = page.locator('[data-elem-dmg]').first();
  if (await rowsAt.count()) await rowsAt.scrollIntoViewIfNeeded();
  await page.waitForTimeout(300);
  out.statusRows = await page.evaluate(() => [...document.querySelectorAll('[data-elem-dmg]')].map((r) => r.getAttribute('aria-label')));
  await lcd(page).screenshot({ path: path.join(OUT, 'h-status-normal-damage.png') });
  await page.close();
  // 사신 4단계 진화 이유
  page = await browser.newPage({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 1 });
  await newGame(page, url, 1);
  await openTest(page, '진화체');
  const ok = await pick(page, '진화체', '3단계', 0);
  if (ok) await lcd(page).getByRole('button', { name: '이 몸으로' }).click();
  await page.waitForTimeout(600);
  for (let i = 0; i < 4 && (await page.locator('.bha-lcd [data-dev-layer]').count()); i++) await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(600);
  // 특성이 없으면 실패 진화라 이유 줄이 안 나온다: 특성 칸 1·2에 하나씩
  await openTest(page, '특성');
  for (const [k, n] of [[1, 1], [2, 2]]) {
    const b = page.locator(`.bha-lcd button.bha-pick[aria-label="특성 칸 ${k}"]`);
    if (!(await b.count())) continue;
    await b.click();
    await page.waitForTimeout(200);
    await page.evaluate((n) => { const o = [...document.querySelectorAll('.bha-pick__list [role="option"]')]; o[n]?.click(); }, n);
    await page.waitForTimeout(200);
  }
  await lcd(page).getByRole('button', { name: '적용' }).click();
  await page.waitForTimeout(400);
  for (let i = 0; i < 4 && (await page.locator('.bha-lcd [data-dev-layer]').count()); i++) await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(600);
  await openTest(page, '진화');
  await lcd(page).getByRole('button', { name: '다음 진화' }).click();
  const shown = () => page.evaluate(() => [...document.querySelectorAll('.bha-evolve__line')].filter((l) => +getComputedStyle(l).opacity > 0.95).map((l) => l.textContent));
  for (let i = 0; i < 200; i++) { const t = await shown(); if (t.some((x) => /수석 대원 자리/.test(x))) break; await page.waitForTimeout(50); }
  out.reason = await shown();
  await lcd(page).screenshot({ path: path.join(OUT, 's-evolve-t4-reason.png') });
  await page.close();
  return out;
}
(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const server = await startServer();
  const browser = await chromium.launch();
  const proof = { runs: [] };
  try {
    if (process.env.EXTRA) { proof.extra = await extra(browser, server.url); }
    else for (const [fi, faction] of [[0, 'hollow'], [1, 'shinigami']]) {
      for (const [group, nth] of [['일반', Number(process.env.NTH || 2)], ['보스', 0]]) {
        const page = await browser.newPage({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 1 });
        await battle(page, server.url, fi, null, group, nth);
        const name = await page.evaluate(() => document.querySelector('.bha-v2foehead')?.textContent);
        proof.runs.push({ faction, group, name, samples: await probe(page) });
        proof.runs[proof.runs.length - 1].anims = [];
        for (let k = 0; k < 30; k++) {
          proof.runs[proof.runs.length - 1].anims.push(await page.evaluate(() => document.querySelector('.bha-unit--foe').getAnimations({ subtree: true }).filter((a) => a.effect?.getKeyframes?.().some((k) => /invert/.test(k.filter ?? ''))).map((a) => `${a.playState}@${Math.round(a.currentTime)}/${a.effect.getTiming().duration}r${a.playbackRate}`).join(',')));
          await page.waitForTimeout(100);
        }
        if (process.env.SHOT) {
          // 피격 흰 깜빡임(GDD 26-4c, Web Animation filter)이 없는 순간 = 평소 강조, 있는 순간 = 피격
          const blinking = () => page.evaluate(() => document.querySelector('.bha-unit--foe').getAnimations({ subtree: true }).some((a) => a.effect?.getKeyframes?.().some((k) => /invert\(1\)/.test(k.filter ?? ''))));
          // 캡처 순간엔 내 자동 공격을 멈춰 깜빡임이 끼지 않게 (적 강조만 본다)
          await page.evaluate(() => { window.__bhaCombat.player.attackTimer = 1e9; });
          await page.waitForTimeout(600);
          for (let i = 0; i < 100 && (await blinking()); i++) await page.waitForTimeout(20);
          await lcd(page).screenshot({ path: path.join(OUT, `${faction[0]}-${group === '보스' ? 'boss' : 'normal'}-${process.env.SHOT}.png`) });
          if (faction === 'hollow' && group === '일반') {
            for (let i = 0; i < 300 && !(await blinking()); i++) await page.waitForTimeout(10);
            await lcd(page).screenshot({ path: path.join(OUT, `h-normal-${process.env.SHOT}-hitblink.png`) });
          }
        }
        await page.close();
      }
    }
  } finally {
    await browser.close();
    server.stop();
  }
  fs.writeFileSync(path.join(OUT, process.env.EXTRA ? 'proof-extra.json' : `probe-${process.env.SHOT || 'x'}.json`), JSON.stringify(proof, null, 2));
  console.log(JSON.stringify(proof, null, 1));
  process.exit(0);
})();
