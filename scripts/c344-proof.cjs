// C.344 proof (GDD 208장, 코딩242): 값이 바뀌는 동안 상태창 보임(그냥 대화는 잠깐 숨김 — 208장 0) · 말풍선은 상태창·버튼과 안 겹침 · 바뀌는 막대·아이콘만 깜빡임(.is-changing).
// 모드: pc-h = 844×390 마우스 호로 · ph-s = 796×384 터치 사신 · ph115 = 폰 호로 + 글자 1.15배(겹침 실측만). 캡처 1배 docs/captures/c344/.
// 실행: node scripts/c344-proof.cjs <주소> [저장 폴더]   (vite 서버는 따로 띄운다)
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..');
const PC = { viewport: { width: 844, height: 390 }, deviceScaleFactor: 1 };
const PH = { viewport: { width: 796, height: 384 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true };
const MODES = [
  { id: 'pc-h', fi: 0, ctx: PC, shots: ['feed', 'walk'] },
  { id: 'ph-s', fi: 1, ctx: PH, shots: ['feed', 'bag', 'walk'] },
  { id: 'ph115', fi: 0, ctx: PH, scale: 1.15, shots: ['feed115'] },
];
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
  await page.getByRole('button', { name: '시작', exact: true }).click();
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
/** 방: 상태창 보임 · 말풍선 자리 · 겹침 · 깜빡이는 줄 */
const roomState = (page) => page.evaluate(() => {
  const R = (e) => { if (!e) return null; const r = e.getBoundingClientRect(); return r.width && r.height ? { l: Math.round(r.left), t: Math.round(r.top), r: Math.round(r.right), b: Math.round(r.bottom) } : null; };
  const hit = (a, b) => a && b && a.l < b.r && a.r > b.l && a.t < b.b && a.b > b.t;
  const q = (s) => document.querySelector(`.bha-lcd ${s}`);
  const status = q('.bha-room__chips .bha-room__status');
  const info = q('.bha-room__chips .bha-room__statusinfo');
  const bubble = q('.bha-room__bubble');
  const bubbleShown = bubble && !bubble.hidden ? R(bubble) : null;
  const buttons = [...document.querySelectorAll('.bha-lcd .bha-prop, .bha-lcd .bha-homedock button, .bha-lcd .bha-room__hud button')].map((b) => ({ name: (b.getAttribute('aria-label') || b.textContent || '').trim().slice(0, 12), r: R(b) })).filter((b) => b.r);
  const boxes = { status: R(status), info: R(info) };
  const overlaps = [];
  if (bubbleShown) for (const [k, r] of Object.entries(boxes)) if (hit(bubbleShown, r)) overlaps.push(`bubble×${k}`);
  if (bubbleShown) for (const b of buttons) if (hit(bubbleShown, b.r)) overlaps.push(`bubble×${b.name}`);
  for (const b of buttons) for (const [k, r] of Object.entries(boxes)) if (hit(b.r, r)) overlaps.push(`${k}×${b.name}`);
  return {
    statusVisible: !!status && getComputedStyle(status.parentElement).visibility === 'visible' && !!R(status),
    bubble: bubbleShown ? { text: bubble.textContent, side: bubble.classList.contains('is-side'), left: bubble.classList.contains('is-left'), rect: bubbleShown } : null,
    toast: [...document.querySelectorAll('.bha-toast')].map((t) => t.textContent.trim()),
    blinking: [...document.querySelectorAll('.bha-lcd .is-changing[data-gauge]')].map((e) => e.dataset.gauge),
    notBlinking: [...document.querySelectorAll('.bha-lcd [data-gauge]:not(.is-changing)')].map((e) => e.dataset.gauge),
    rows: [...document.querySelectorAll('.bha-lcd .bha-room__status .bha-room__gauge')].map((g) => `${g.dataset.gauge ?? 'state'}:${g.querySelector('.bha-room__gaugenum')?.textContent}`),
    overlaps,
  };
});

async function run(url, out) {
  fs.mkdirSync(out, { recursive: true });
  const browser = await chromium.launch();
  const prevFile = path.join(out, 'proof.json');
  const proof = process.env.ONLY && fs.existsSync(prevFile) ? JSON.parse(fs.readFileSync(prevFile, 'utf8')) : { checks: {}, shots: [], errors: [] }; // ONLY = 그 모드만 다시 찍어 합친다
  try {
    for (const mode of MODES.filter((m) => !process.env.ONLY || process.env.ONLY.split(',').includes(m.id))) {
      const ctx = await browser.newContext(mode.ctx);
      const page = await ctx.newPage();
      if (mode.scale) await page.addInitScript((k) => {
        const put = () => {
          const st = document.createElement('style');
          st.textContent = `:root{${[['xs', 12], ['sm', 13], ['md', 14], ['lg', 16], ['xl', 18], ['2xl', 22], ['3xl', 28], ['4xl', 36], ['5xl', 48]].map(([n, v]) => `--bha-fs-${n}:${(v * k).toFixed(2)}px !important;`).join('')}}`;
          document.head.append(st);
        };
        if (document.head) put(); else document.addEventListener('DOMContentLoaded', put);
      }, mode.scale);
      page.on('pageerror', (e) => proof.errors.push(`${mode.id}: ${e.message.slice(0, 160)}`));
      const shot = async (name) => {
        if (!mode.shots.includes(name)) return;
        const file = `${mode.id}-${name}.png`;
        await page.screenshot({ path: path.join(out, file) });
        proof.shots.push(file);
      };
      const c = (proof.checks[mode.id] = {});
      await newGame(page, url, mode.fi);
      await wait(2500);
      await skipTut(page);
      await patchSave(page, `
        t.help.guides = { ...t.help.guides, 'first-run': 'done', 'home-intro': 'done', 'first-run-room': 'done', 'birth': 'done', 'recover': 'done' };
        t.nest.hpFraction = 0.4; t.nest.spa = null; t.nest.careRequest = null; t.nest.hunger = 70; t.nest.condition = 45;
        t.nest.collapsed = false; t.nest.collapsedAt = 0; t.nest.weakened = false; t.nest.tired = false; t.nest.dead = false; t.nest.feedLog = [];
        for (const k of Object.keys(shared.food)) shared.food[k] = 5;
      `);
      await reopen(page);
      await wait(1500);
      c.before = await roomState(page);
      // ① 방 먹이 주기 직후 (차오르는 중 0.35초): 상태창 보임 + 말풍선 따로 + 깜빡이는 막대
      await page.locator('.bha-homedock [data-care="feed"]').first().click();
      await wait(300);
      await page.locator('.bha-homedock__food:not([disabled])').first().click();
      await wait(350);
      c.feedMid = await roomState(page);
      await shot(mode.scale ? 'feed115' : 'feed');
      await wait(1300); // 차오름 끝(0.8) + 깜빡임 3번(0.75) 지난 뒤
      c.feedAfter = await roomState(page);
      // 혼잣말(캐릭터 누름) — 상태창 그대로, 말풍선 자리
      await page.locator('.bha-lcd .bha-char').first().click().catch(() => {});
      await wait(300);
      c.talk = await roomState(page);
      if (mode.scale) { await ctx.close(); continue; }
      // ② 방 가방 사용 (폰 사신): 체력 포션 → 상태창 창이 떠 체력만 깜빡임
      if (mode.shots.includes('bag')) {
        await patchSave(page, `t.nest.feedLog = []; t.nest.condition = 40; t.nest.risk = 30; shared.items = { ...(shared.items || {}), wake: 2, calm: 2 };`);
        c.bagPatched = await page.evaluate(() => Object.keys(localStorage).filter((k) => (localStorage.getItem(k) || '').includes('"wake":2')));
        await reopen(page);
        await wait(1500);
        await page.locator('.bha-lcd .bha-prop--chest').first().click({ timeout: 4000 }).catch(() => {});
        await wait(900);
        // 가방 [소모품] 탭 → [약] 칸 → 각성제(컨디션 오름)
        let used = false;
        await page.locator('.bha-lcd [role="tab"]').filter({ hasText: '소모품' }).first().click().catch(() => {});
        await wait(300);
        await page.locator('.bha-lcd [role="tab"]').filter({ hasText: '약' }).first().click().catch(() => {});
        await wait(300);
        const card = page.locator('.bha-lcd [data-item="wake"]');
        if (await card.count()) {
          await card.first().click().catch(() => {});
          await wait(400);
          const use = page.getByRole('button', { name: '사용', exact: true });
          if (await use.count()) { await use.first().click().catch(() => {}); used = true; }
        }
        c.bagUsed = used;
        if (!used) c.bagDebug = await page.evaluate(() => ({ items: [...document.querySelectorAll('[data-item]')].map((e) => e.dataset.item).slice(0, 40), tabs: [...document.querySelectorAll('[role="tab"]')].map((e) => e.textContent.trim()), screen: document.querySelector('.bha-lcd')?.className }));
        await wait(350);
        c.bag = await page.evaluate(() => ({
          fx: !!document.querySelector('.bha-actfx'),
          blinking: [...document.querySelectorAll('.bha-actfx .is-changing[data-gauge]')].map((e) => e.dataset.gauge),
          notBlinking: [...document.querySelectorAll('.bha-actfx [data-gauge]:not(.is-changing)')].map((e) => e.dataset.gauge),
          toast: [...document.querySelectorAll('.bha-toast')].map((t) => t.textContent.trim()),
        }));
        await shot('bag');
        await wait(2000);
        await page.keyboard.press('Escape').catch(() => {});
        await wait(600);
      }
      // ③ 걷기 휴식: 모험 출발 → 저장된 원정을 휴식 단계(배부름·컨디션·체력 낮음)로 바꿔 이어하기 → 휴식이 끝나는 순간(판 막대 차오름 + 깜빡임)
      if (mode.shots.includes('walk') && !process.env.SKIPWALK) {
        await patchSave(page, `t.nest.hpFraction = 0.6; t.nest.condition = 50; t.nest.hunger = 55; t.nest.weakened = false; t.nest.tired = false;`);
        await reopen(page);
        await wait(1200);
        await page.locator('.bha-lcd .bha-prop--outside').first().click({ timeout: 4000 }).catch(() => {});
        await wait(900);
        await page.locator('.bha-worldmap [data-place="adventure"]').first().click({ timeout: 4000 }).catch(() => {});
        await wait(1800);
        await skipTut(page);
        // 휴식 타일(rest-a)을 길 첫 빈칸에 놓고 출발 → 그 칸에서 쉬고(10초) 끝나는 순간 판 막대가 차오르며 깜빡인다
        const placeTab = page.locator('.bha-lcd [data-plan-side="place"]');
        if (await placeTab.count()) { await placeTab.click(); await wait(300); }
        c.restCard = await page.locator('.bha-lcd .bha-tilecard[data-tile="rest-a"]').count();
        if (c.restCard) {
          await page.locator('.bha-lcd .bha-tilecard[data-tile="rest-a"]').first().click();
          await wait(200);
          await page.locator('.bha-lcd .bha-road__cell.is-can').first().click().catch(() => {});
          await wait(200);
        }
        const prepTab = page.locator('.bha-lcd [data-plan-side="prep"]');
        if (await prepTab.count()) { await prepTab.click(); await wait(300); }
        await page.getByRole('button', { name: '★1', exact: true }).first().click().catch(() => {});
        await wait(300);
        await page.getByRole('button', { name: '출발', exact: true }).first().click({ timeout: 4000 }).catch(() => {});
        await wait(500);
        let seen = null;
        for (let i = 0; i < 600 && !seen; i++) {
          await wait(100);
          const k = await page.evaluate(() => [...document.querySelectorAll('.bha-lcd .is-changing[data-gauge]')].map((e) => e.dataset.gauge));
          if (k.length) seen = k;
        }
        await wait(300);
        c.walk = { blinking: seen, notBlinking: await page.evaluate(() => [...document.querySelectorAll('.bha-lcd [data-gauge]:not(.is-changing)')].map((e) => e.dataset.gauge)) };
        await shot('walk');
      }
      await ctx.close();
    }
  } finally {
    await browser.close();
  }
  fs.writeFileSync(path.join(out, 'proof.json'), JSON.stringify(proof, null, 1));
  console.log(JSON.stringify(proof, null, 0).slice(0, 6000));
}

run(process.argv[2], path.resolve(process.argv[3] || path.join(ROOT, 'docs/captures/c344')));
