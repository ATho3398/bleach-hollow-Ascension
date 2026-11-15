// C.420 proof (GDD v6.004 3-2·14-3, 코딩277): 방 상태 박스 = 상태이상 0~3개에도 박스가 모든 줄을 감싸고 x·폭 불변 · 상태 화면 상태이상 블록 · 홈 [소모품] 줄. 캡처 1배 docs/captures/c420/.
// 실행: node scripts/c420-proof.cjs <주소> [저장 폴더]   (vite 서버는 따로 띄운다)
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..');
const PC = { viewport: { width: 844, height: 390 }, deviceScaleFactor: 1 };
const PH = { viewport: { width: 796, height: 384 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function skipTut(page) {
  for (let t = 0; t < 40 && (await page.locator('.bha-tut').count()); t++) {
    const go = page.locator('.bha-tut button.bha-btn--primary:not([disabled])').filter({ visible: true });
    if (await go.count()) await go.first().click({ timeout: 2000 }).catch(() => {});
    else await page.locator('.bha-lcd').first().click({ timeout: 2000 }).catch(() => {});
    await wait(400);
  }
}
async function patchSave(page, src) {
  await page.evaluate((src) => {
    const f = new Function('t', 'shared', src);
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      const raw = localStorage.getItem(k);
      if (!raw || !raw.includes('"runLog"')) continue;
      const data = JSON.parse(raw);
      let sh = null;
      const find = (o) => { if (!o || typeof o !== 'object' || sh) return; if (o.food && o.items && o.wanderer) { sh = o; return; } for (const v of Object.values(o)) find(v); };
      find(data);
      const walk = (o) => {
        if (!o || typeof o !== 'object') return;
        if (o.nest && o.help && o.runLog) f(o, o.shared ?? sh);
        for (const v of Object.values(o)) walk(v);
      };
      walk(data);
      localStorage.setItem(k, JSON.stringify(data));
    }
  }, src);
}
async function reopen(page) {
  await page.reload();
  await wait(1500);
  const cont = page.getByRole('button', { name: /이어하기|불러오기/ });
  if (await cont.count()) { await cont.first().click().catch(() => {}); await wait(500); }
  const slot = page.locator('.bha-slot').first();
  if (await slot.count()) { await slot.click().catch(() => {}); await page.getByRole('button', { name: '확인' }).click().catch(() => {}); await wait(1500); }
  await skipTut(page);
}
async function newGame(page, url, fi) {
  const u = `${url}?test=1`;
  await page.goto(u);
  await page.evaluate(() => localStorage.clear());
  await page.goto(u);
  await wait(1200);
  await page.getByRole('button', { name: '새로 시작' }).click();
  await wait(300);
  await page.locator('.bha-slot').first().click();
  await page.getByRole('button', { name: '확인' }).click();
  await wait(300);
  await page.locator('.bha-species__card').nth(fi).click();
  await wait(300);
  await page.getByRole('button', { name: '네', exact: true }).click();
  await wait(400);
  const nm = page.locator('[data-ident="name"]');
  if (await nm.count()) {
    await nm.fill(fi === 0 ? '권영' : 'Rukia');
    await nm.press('Enter');
    await wait(300);
    await page.locator('.bha-ident__gender[data-gender="male"]').click();
    await page.locator('.bha-ident .bha-btn--primary').last().click();
  }
}

const PV = { viewport: { width: 384, height: 796 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true }; // 세로로 든 폰 (GDD 14절: 화면을 90° 돌려 표시)
const MODES = [
  ...(process.env.ONLY_PC ? [] : [{ id: 'ph', ctx: PH, shots: ['room2', 'status', 'items'] }]),
  ...(process.env.ONLY_PC ? [] : [{ id: 'pv', ctx: PV, shots: ['room2'] }]),
  { id: 'pc', ctx: PC, shots: ['room2'] },
];
const SETS = { 0: 't.nest.collapsed=false; t.nest.tired=false; t.nest.weakened=false;', 1: 't.nest.collapsed=true; t.nest.collapsedAt=Date.now()-3600e3; t.nest.tired=false; t.nest.weakened=false;', 2: 't.nest.collapsed=true; t.nest.collapsedAt=Date.now()-3600e3; t.nest.tired=true; t.nest.condition=15; t.nest.weakened=false;', 3: 't.nest.collapsed=true; t.nest.collapsedAt=Date.now()-3600e3; t.nest.tired=true; t.nest.condition=15; t.nest.weakened=true;' };
const boxCheck = (page) => page.evaluate(() => {
  const box = document.querySelector('.bha-room__chips > .bha-room__status');
  const b = box.getBoundingClientRect();
  const rows = [...box.querySelectorAll('.bha-room__gauge')].map((r) => r.getBoundingClientRect());
  const inside = rows.every((r) => r.left >= b.left - 0.5 && r.right <= b.right + 0.5 && r.top >= b.top - 0.5 && r.bottom <= b.bottom + 0.5);
  const kids = [...box.querySelectorAll('.bha-room__gauge *')].every((e) => { const q = e.getBoundingClientRect(); return q.width === 0 || (q.left >= b.left - 0.5 && q.right <= b.right + 0.5); });
  const name = box.querySelector('.bha-room__name')?.getBoundingClientRect();
  const nr = name ? [name.left, name.top, name.right, name.bottom].map((v) => Math.round(v)) : null;
  // 박스 위 끝·가로 자리 (화면 좌표 — 세로 폰은 90° 돌아가 있어 위 끝이 오른쪽 끝)
  const portrait = innerHeight > innerWidth;
  const anchor = portrait ? [Math.round(b.right), Math.round(b.top), Math.round(b.height)] : [Math.round(b.left), Math.round(b.top), Math.round(b.width)];
  const sc = document.querySelector('.bha-room__scene'); const vars = ['--chip-h', '--state-h', '--note-lift'].map((k) => sc.style.getPropertyValue(k)).join(' ') + (box.parentElement.classList.contains('is-tight') ? ' tight' : '');
  return { vars, nameRect: nr, anchor, side: box.parentElement.classList.contains('is-side'), x: Math.round(b.left * 10) / 10, w: Math.round(b.width * 10) / 10, h: Math.round(b.height), rows: rows.length, inside, kidsInside: kids, hints: box.querySelectorAll('.bha-room__gaugehint').length, nameCx: name ? Math.round((name.left + name.width / 2) * 10) / 10 : null, boxCx: Math.round((b.left + b.width / 2) * 10) / 10 };
});

async function run(url, out) {
  fs.mkdirSync(out, { recursive: true });
  const browser = await chromium.launch();
  const proof = { checks: {}, shots: [], errors: [] };
  try {
    for (const mode of MODES) {
      const ctx = await browser.newContext(mode.ctx);
      const page = await ctx.newPage();
      page.on('pageerror', (e) => proof.errors.push(`${mode.id}: ${e.message.slice(0, 160)}`));
      const shot = async (name, n) => {
        if (!mode.shots.includes(name)) return;
        const file = `${n}-${mode.id}-${name}.png`;
        await page.screenshot({ path: path.join(out, file) });
        proof.shots.push(file);
      };
      const c = (proof.checks[mode.id] = { box: {} });
      await newGame(page, url, 0);
      await wait(2500);
      await skipTut(page);
      const base = `
        t.help.guides = { ...t.help.guides, 'first-run': 'done', 'home-intro': 'done', 'first-run-room': 'done', 'birth': 'done', 'recover': 'done' };
        t.nest.spa = null; t.nest.careRequest = null; t.nest.hunger = 40; t.nest.condition = 60; t.nest.risk = 0; t.nest.dead = false;
        shared.items = { ...shared.items, 'med-cure': 2, 'med-energy': 1, calm: 1, 'heal-patch': 3, 'battle-haste': 1 };
        shared.unlocks = { ...(shared.unlocks || {}), battleItem: Date.now() };
      `;
      for (const k of [0, 1, 2, 3]) {
        await patchSave(page, base + SETS[k]);
        await reopen(page);
        await wait(1500);
        c.box[k] = await boxCheck(page);
        if (k === 2) await shot('room2', mode.id === 'ph' ? '01' : mode.id === 'pv' ? '02' : '03');
      }
      if (mode.id === 'ph') {
        // 상태 화면 상태이상 블록 (3개)
        await page.locator('.bha-room__chips > .bha-room__status').click();
        await wait(1200);
        c.blocks = await page.evaluate(() => [...document.querySelectorAll('.bha-care__ailmentlist > .bha-nest__state')].map((r) => {
          const b = r.getBoundingClientRect();
          const i = r.querySelector('.bha-info')?.getBoundingClientRect();
          const lines = [...r.querySelectorAll('.bha-nest__statetext > span')].map((s) => s.textContent);
          return { w: Math.round(b.width), h: Math.round(b.height), infoRightGap: i ? Math.round(b.right - i.right) : null, lines };
        }));
        await shot('status', '04');
        await page.goBack().catch(() => {});
        await reopen(page);
        await wait(1200);
        // 홈 [소모품]
        c.dock = await page.evaluate(() => [...document.querySelectorAll('.bha-homedock__care > button')].map((b) => `${b.textContent.trim()}:${Math.round(b.getBoundingClientRect().width)}`));
        await page.locator('.bha-homedock [data-dock="items"]').click();
        await wait(400);
        const list = () => page.evaluate(() => [...document.querySelectorAll('.bha-homedock__tray--items .bha-homedock__item')].map((b) => `${b.dataset.item}|${b.textContent}|${b.disabled ? 'off' : 'on'}`));
        c.itemsBefore = await list();
        await shot('items', '05');
        await page.locator('.bha-homedock__item[data-item="med-cure"]').click();
        await wait(1200);
        c.itemsAfter = await list();
        c.trayOpen = await page.locator('.bha-homedock__tray--items').isVisible();
        c.collapsedAfter = await page.evaluate(() => document.querySelector('.bha-room__chips > .bha-room__status').getAttribute('aria-label'));
        await page.screenshot({ path: path.join(out, '06-ph-items-used.png') });
        proof.shots.push('06-ph-items-used.png');
      }
      await ctx.close();
    }
  } catch (e) {
    proof.errors.push(String(e && e.stack || e).slice(0, 400));
  } finally {
    await browser.close();
  }
  fs.writeFileSync(path.join(out, 'proof.json'), JSON.stringify(proof, null, 1));
  console.log(JSON.stringify(proof, null, 1).slice(0, 8000));
}
run(process.argv[2], path.resolve(process.argv[3] || path.join(ROOT, 'docs/captures/c420')));
