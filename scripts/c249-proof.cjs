// C.249 proof (GDD 170장): 종이인형 동작 게임 연결 — 방 홈 대기 · 온천 앉은 뒤 온천 자세 · 방 빈사 자세 · 전투 패배 쓰러짐 · 권/귀/참 블록 동작. 사신(C249_FI=1 기본).
// 실행: node scripts/c249-proof.cjs (C249_URL=<주소>, C249_OUT=<폴더>, C249_PART=room|battle|all, C249_BURST=1, C249_LOSEMS=150,350,…) — 캡처 docs/captures/c249/ (1배 844×390)
// 블록은 누른 뒤 다음 전투 틱에 나가 시점이 흔들려 C249_BURST=1(60ms 간격 10장)로 찍고 동작이 보이는 장을 골랐다(권 b1·참 b0·귀 b0), 패배는 체력 0 뒤 350ms 장.
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..');
const OUT = process.env.C249_OUT ?? path.join(ROOT, 'docs/captures/c249');
const PART = process.env.C249_PART ?? 'all';
const PORT = 5349;

async function startServer() {
  if (process.env.C249_URL) return { url: process.env.C249_URL, stop: () => {} };
  const p = spawn('npx', ['vite', '--port', String(PORT), '--strictPort'], { cwd: ROOT, stdio: 'pipe', detached: true });
  const url = `http://localhost:${PORT}/`;
  for (let i = 0; i < 60; i++) {
    try { if ((await fetch(url)).ok) return { url, stop: () => { try { process.kill(-p.pid); } catch { /* 이미 */ } } }; } catch { /* 아직 */ }
    await new Promise((r) => setTimeout(r, 500));
  }
  try { process.kill(-p.pid); } catch { /* */ }
  throw new Error('vite 서버가 뜨지 않았다');
}

async function skipTut(page) {
  for (let t = 0; t < 40 && (await page.locator('.bha-tut').count()); t++) {
    const go = page.locator('.bha-tut button.bha-btn--primary:not([disabled])').filter({ visible: true });
    if (await go.count()) await go.first().click({ timeout: 2000 }).catch(() => {});
    else await page.locator('.bha-lcd').first().click({ timeout: 2000 }).catch(() => {});
    await page.waitForTimeout(400);
  }
}

/** 저장의 지금 트랙을 고친다 */
async function patchSave(page, fn) {
  await page.evaluate((src) => {
    const f = new Function('t', 'shared', src);
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      const raw = localStorage.getItem(k);
      if (!raw || !raw.includes('"runLog"')) continue;
      const data = JSON.parse(raw);
      const walk = (o) => {
        if (!o || typeof o !== 'object') return;
        if (o.nest && o.help && o.runLog) f(o, o.shared);
        for (const v of Object.values(o)) walk(v);
      };
      walk(data);
      localStorage.setItem(k, JSON.stringify(data));
    }
  }, fn);
}

async function reopen(page) {
  await page.reload();
  await page.waitForTimeout(1500);
  const cont = page.getByRole('button', { name: '이어하기' });
  if (await cont.count()) { await cont.first().click().catch(() => {}); await page.waitForTimeout(500); }
  const slot = page.locator('.bha-slot').first();
  if (await slot.count()) { await slot.click().catch(() => {}); await page.getByRole('button', { name: '확인' }).click().catch(() => {}); await page.waitForTimeout(1500); }
  await skipTut(page);
}

const screens = (page) => page.evaluate(() => [...document.querySelectorAll('.bha-lcd .bha-app')].map((e) => e.className.replace('bha-app ', '')).join('|'));
/** 캐릭터 그림(종이인형 캔버스 → img src) 이 그려졌는지 + 클래스 */
const charInfo = (page, sel) => page.evaluate((s) => {
  const c = document.querySelector(s);
  if (!c) return null;
  const img = c.querySelector('img');
  return { cls: c.className, rig: !!img && (img.src || '').startsWith('data:image'), anim: [...c.classList].filter((x) => x.startsWith('has-anim')).length };
}, sel);

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const srv = await startServer();
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 1 });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const proof = { shots: [], errors, trace: [] };
  const shot = async (name) => { await page.screenshot({ path: path.join(OUT, `${name}.png`) }); proof.shots.push(`${name}.png`); };
  try {
    await page.goto(`${srv.url}?test=1`);
    await page.evaluate(() => localStorage.clear());
    await page.goto(`${srv.url}?test=1`);
    await page.waitForTimeout(1200);
    await page.getByRole('button', { name: '새로 시작' }).click();
    await page.waitForTimeout(300);
    await page.locator('.bha-slot').first().click();
    await page.getByRole('button', { name: '확인' }).click();
    await page.waitForTimeout(300);
    await page.locator('.bha-species__card').nth(Number(process.env.C249_FI ?? 1)).click();
    await page.waitForTimeout(300);
    await page.getByRole('button', { name: '시작', exact: true }).click();
    await page.waitForTimeout(2000);
    await skipTut(page);
    // 튜토리얼 끝 · 체력 반 · 평소 상태
    await patchSave(page, `
      t.help.guides = { ...t.help.guides, 'first-run': 'done', 'home-intro': 'done', 'first-run-room': 'done', 'birth': 'done', 'recover': 'done' };
      t.nest.hunger = 20; t.nest.condition = 80; t.nest.hpFraction = 0.5; t.nest.spa = null;
      t.nest.collapsed = false; t.nest.collapsedAt = 0; t.nest.weakened = false; t.nest.tired = false; t.nest.dead = false;
    `);
    await reopen(page);
    if (PART !== 'battle') {
      await page.waitForTimeout(1200);
      proof.trace.push(['room', await screens(page), await charInfo(page, '.bha-room .bha-char')]);
      await shot('00-room-homeidle');
      // 온천: 방 → 밖(월드맵) → 온천, 앉은 뒤 온천 자세
      await page.locator('.bha-room .bha-prop--outside').first().click({ timeout: 4000 });
      await page.waitForTimeout(1200);
      await page.locator('.bha-worldmap [data-place="spa"]').click({ timeout: 4000 });
      await page.waitForTimeout(5000);
      proof.trace.push(['spa', await screens(page), await charInfo(page, '.bha-spa__char'), await page.evaluate(() => document.querySelector('.bha-spa__actor')?.className)]);
      await shot('01-spa-bath');
      // 방 빈사: 빈사 상태로 저장을 고쳐 다시 연다
      await patchSave(page, `t.nest.spa = null; t.nest.collapsed = true; t.nest.collapsedAt = Date.now(); t.nest.hpFraction = 0.05;`);
      await reopen(page);
      await page.waitForTimeout(1500);
      proof.trace.push(['room-dying', await screens(page), await charInfo(page, '.bha-room .bha-char')]);
      await shot('02-room-dying');
      await patchSave(page, `t.nest.collapsed = false; t.nest.collapsedAt = 0; t.nest.hpFraction = 0.5;`);
      await reopen(page);
    }
    if (PART !== 'room') {
      const openBattleTab = async () => {
        await page.getByRole('button', { name: '더보기' }).first().click({ timeout: 4000 });
        await page.waitForTimeout(400);
        await page.getByRole('button', { name: '테스트' }).first().click({ timeout: 4000 });
        await page.waitForTimeout(600);
        await page.locator('.bha-viewtitle button').first().click({ timeout: 4000 });
        await page.waitForTimeout(400);
        await page.getByText('바로 전투', { exact: true }).first().click({ timeout: 4000 });
        await page.waitForTimeout(500);
      };
      const pickLast = async (label) => {
        await page.getByRole('button', { name: label }).first().click({ timeout: 4000 });
        await page.waitForTimeout(400);
        const opts = page.locator('[role="option"]').filter({ visible: true });
        const n = await opts.count();
        const txt = n ? await opts.nth(n - 1).textContent() : null;
        if (n) await opts.nth(n - 1).click();
        await page.waitForTimeout(300);
        return txt;
      };
      const heroHp = () => page.evaluate(() => {
        const t = [...document.querySelectorAll('.bha-meter, [class*="hp"]')].map((e) => (e.textContent || '').trim()).filter((s) => /^\d+ \/ \d+$/.test(s));
        return t;
      });
      // ① 권·참·귀 블록: 쉬운 상대(기본) — 블록이 나오면 눌러 동작 중간을 찍는다
      await openBattleTab();
      await page.getByRole('button', { name: '전투 시작' }).click({ timeout: 4000 });
      await page.waitForTimeout(1500);
      const done = {};
      const names = { '권': '04-block-gwon-straight', '참': '05-block-cham-attack', '귀': '06-block-gwi-skill' };
      for (let i = 0; i < 120 && Object.keys(done).length < 3; i++) {
        const blocks = await page.evaluate(() => [...document.querySelectorAll('.bha-block')].map((b, k) => ({ k, text: (b.textContent || '').trim() })));
        const want = blocks.find((b) => names[b.text[0]] && !done[b.text[0]]);
        if (want) {
          await page.locator('.bha-block').nth(want.k).click({ timeout: 2000 }).catch(() => {});
          // 누른 뒤 전투 틱에 공격이 나간다 — 정한 시점(C249_HITMS) 한 장, 또는 C249_BURST 면 60ms 간격 10장
          if (process.env.C249_BURST) for (let f = 0; f < 10; f++) { await page.waitForTimeout(60); await shot(`${names[want.text[0]]}-b${f}`); }
          else { await page.waitForTimeout(Number(process.env.C249_HITMS ?? 230)); await shot(names[want.text[0]]); }
          done[want.text[0]] = want.text;
          await page.waitForTimeout(1200);
        } else await page.waitForTimeout(500);
      }
      proof.trace.push(['blocks', done]);
      // ② 패배: 가장 센 상대 · 가장 높은 난이도 → 체력 0 이 되면 쓰러짐(끝 자세 유지)
      await page.goBack().catch(() => {});
      await reopen(page);
      await openBattleTab();
      proof.trace.push(['foe', await pickLast('상대'), await pickLast('난이도')]);
      await page.getByRole('button', { name: '전투 시작' }).click({ timeout: 4000 });
      let lost = false;
      for (let i = 0; i < 1000 && !lost; i++) {
        await page.waitForTimeout(60);
        const hp = await heroHp();
        if (hp.some((s) => s.startsWith('0 /'))) lost = true;
      }
      // 쓰러지는 동작(0.9초)과 결과 창 사이 — 몇 장 찍어 둔다(C249_LOSEMS 로 한 장만)
      const loseAt = (process.env.C249_LOSEMS ?? '350').split(',').map(Number);
      let last = 0;
      for (const ms of loseAt) {
        await page.waitForTimeout(ms - last);
        last = ms;
        await shot(loseAt.length > 1 ? `03-battle-lose-down-${ms}` : '03-battle-lose-down');
      }
      proof.trace.push(['lost', lost, await heroHp(), await screens(page)]);
    }
  } finally {
    fs.writeFileSync(path.join(OUT, 'proof.json'), JSON.stringify(proof, null, 2));
    await browser.close();
    srv.stop();
  }
  console.log(JSON.stringify(proof));
  process.exit(0);
})();
