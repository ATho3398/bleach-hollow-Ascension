// C.348 size proof (GDD 206장 보충): 적 덩치·내 몸이 같이 나오는 화면 전수 — 화면상 그림 키·도트 한 칸 px 실측(차 2% 안).
// 실행: npx vite build → npx vite preview --port 5394 → node scripts/c348-size.cjs http://localhost:5394/  (SHOT=1 이면 캡처)
// 측정: 종이인형 캔버스(.bha-rigcanvas)·정지 그림(img)의 불투명 픽셀 범위 → 화면 키, 같은 색이 이어지는 가로 길이의 최빈값 → 도트 한 칸(캔버스 px) × 화면 배율.
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const OUT = path.resolve(__dirname, '../docs/captures/c348');
const URL = process.argv[2] || 'http://localhost:5394/';
const DEV = {
  pc: { viewport: { width: 844, height: 390 }, deviceScaleFactor: 1 },
  phone: { viewport: { width: 796, height: 384 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true },
};
const SAVE_KEY = 'bha-save-test';
const wait = (page, ms) => page.waitForTimeout(ms);
const shots = [];

async function newGame(page, fi, patch) {
  await page.goto(`${URL}?test=1`);
  await page.evaluate(() => localStorage.clear());
  await page.goto(`${URL}?test=1`);
  await wait(page, 1200);
  await page.getByRole('button', { name: '새로 시작' }).click();
  await wait(page, 300);
  await page.locator('.bha-slot').first().click();
  await wait(page, 200);
  await page.getByRole('button', { name: '확인' }).click();
  await wait(page, 300);
  await page.locator('.bha-species__card').nth(fi).click();
  await wait(page, 300);
  await page.getByRole('button', { name: '시작', exact: true }).click();
  await wait(page, 400);
  const input = page.locator('[data-ident="name"]');
  if (await input.count()) {
    await input.fill('시험');
    await page.locator('[data-ident="next"]').click();
    await wait(page, 200);
    await page.locator('.bha-ident__gender').first().click();
    await page.locator('[data-ident="done"]').click();
  }
  await wait(page, 1800);
  await page.evaluate(({ key, patch }) => {
    const s = JSON.parse(localStorage.getItem(key));
    if (patch.look !== undefined) s.evolution.look = patch.look;
    if (patch.tier !== undefined) s.evolution.tierIndex = patch.tier;
    if (patch.dex) s.enemyDex = patch.dex;
    localStorage.setItem(key, JSON.stringify(s));
  }, { key: SAVE_KEY, patch });
  await page.goto(`${URL}?test=1`);
  await wait(page, 1200);
  await page.getByRole('button', { name: '이어하기' }).click().catch(() => {});
  await wait(page, 2500);
}

/** 한 그림(캔버스/이미지)의 화면 키·도트 한 칸 */
const measureIn = (page, sels) => page.evaluate((sels) => {
  // 걸음 흔들림(회전)이 화면 상자를 부풀리지 않게, 재는 순간만 몸 상자 애니메이션을 끈다(그림 배율은 그대로)
  const calm = document.createElement('style');
  calm.textContent = '.bha-walker__body,.bha-foe__body,.bha-hero__lift,.bha-hero__body{animation:none!important}';
  document.head.append(calm);
  void document.body.offsetHeight;
  const one = (sel) => {
    const node = document.querySelector(sel);
    if (!node) return null;
    let c = node;
    let kind = 'rig';
    if (node.tagName === 'IMG') {
      kind = 'still';
      if (!node.naturalWidth) return { sel, kind, broken: true };
      c = document.createElement('canvas');
      c.width = node.naturalWidth; c.height = node.naturalHeight;
      c.getContext('2d').drawImage(node, 0, 0);
    }
    const r = node.getBoundingClientRect();
    const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
    const W = c.width, H = c.height;
    let top = -1, bot = -1, minx = W, maxx = -1;
    const runs = new Map();
    for (let y = 0; y < H; y++) {
      let any = false, run = 0, prev = -1;
      for (let x = 0; x < W; x++) {
        const i = (y * W + x) * 4;
        const a = d[i + 3];
        const v = a > 40 ? (d[i] << 16) | (d[i + 1] << 8) | d[i + 2] : -1;
        if (a > 40) { any = true; if (x < minx) minx = x; if (x > maxx) maxx = x; }
        if (v === prev) run++;
        else { if (prev >= 0 && run > 0) runs.set(run, (runs.get(run) ?? 0) + 1); run = 1; prev = v; }
      }
      if (prev >= 0 && run > 0) runs.set(run, (runs.get(run) ?? 0) + 1);
      if (any) { if (top < 0) top = y; bot = y; }
    }
    const cell = [...runs.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 0;
    const k = r.height / H;
    const cls = node.className && typeof node.className === 'string' ? node.className : '';
    // stillH = 정지 그림(still/<외형>.png, 캔버스와 같은 좌표) 몸 키 — 자세와 무관한 '키'. 화면 키 = stillH × k
    const STILL_H = { 8: 232, 4: 324 };
    let flip = 1;
    for (let e = node; e; e = e.parentElement) { const t = getComputedStyle(e).transform; if (t && t !== 'none' && new DOMMatrix(t).a < 0) flip = -flip; }
    const kx = r.width / W;
    const left = flip > 0 ? r.left + minx * kx : r.right - (maxx + 1) * kx;
    const right = flip > 0 ? r.left + (maxx + 1) * kx : r.right - minx * kx;
    return { sel, kind, cls, canvasH: H, boxH: +r.height.toFixed(1), poseH: +((bot - top + 1) * k).toFixed(1), keyH: kind === 'rig' ? +((STILL_H[cell] ?? 0) * k).toFixed(1) : +((bot - top + 1) * k).toFixed(1), cellSrc: cell, dotPx: +(cell * k).toFixed(2), left: +left.toFixed(1), right: +right.toFixed(1), figW: +(right - left).toFixed(1) };
  };
  const out = Object.fromEntries(Object.entries(sels).map(([n, s]) => [n, one(s)]));
  calm.remove();
  return out;
}, sels);

const ratio = (a, b) => (a && b && a.keyH && b.keyH ? { key: +(a.keyH / b.keyH).toFixed(4), dot: +(a.dotPx / b.dotPx).toFixed(4), pose: +(a.poseH / b.poseH).toFixed(4) } : null);

async function shot(page, name) {
  if (!process.env.SHOT) return;
  const file = `${name}.png`;
  await page.screenshot({ path: path.join(OUT, file) });
  shots.push(file);
}

async function testBattle(page, foeName, floor) {
  await page.getByRole('button', { name: '더보기' }).first().click({ timeout: 4000 });
  await wait(page, 400);
  await page.getByRole('button', { name: '테스트' }).first().click({ timeout: 4000 });
  await wait(page, 600);
  await page.locator('.bha-viewtitle button').first().click({ timeout: 4000 });
  await wait(page, 400);
  await page.getByText('바로 전투', { exact: true }).first().click({ timeout: 4000 });
  await wait(page, 500);
  await page.getByRole('button', { name: '상대' }).first().click({ timeout: 4000 });
  await wait(page, 400);
  await page.locator('[role="option"]').filter({ visible: true }).filter({ hasText: foeName }).first().click();
  await wait(page, 300);
  if (floor) {
    await page.getByRole('button', { name: '탑 층' }).first().click({ timeout: 4000 });
    await wait(page, 300);
    await page.locator('[role="option"]').filter({ visible: true }).filter({ hasText: new RegExp(`^${floor}층$`) }).first().click();
    await wait(page, 300);
  }
  await page.getByRole('button', { name: '전투 시작' }).click({ timeout: 4000 });
  await page.locator('.bha-battle').waitFor({ timeout: 60_000 });
  await wait(page, 1500);
}

const HERO = '.bha-hero .bha-rigcanvas, .bha-hero img.bha-hero__img';
const FOE = '.bha-unit .bha-foe .bha-rigcanvas, .bha-unit .bha-foe img.bha-foe__img';

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();
  const proof = { note: 'keyH = 화면 그림 키(px, 정지 자세 몸 키 × 화면 배율), poseH = 그 순간 자세의 키, dotPx = 도트 한 칸(px), ratio = 적/나 (key·dot 이 기준, pose 는 동작 차이 참고)', runs: [], errors: [] };
  const add = (run) => { proof.runs.push(run); console.log(JSON.stringify(run)); };
  const BODIES = [
    { id: 'hollow-base', fi: 0, patch: {} },
    { id: 'hollow-brute', fi: 0, patch: { look: 'brute' } },
    { id: 'shinigami', fi: 1, patch: {} },
  ];
  for (const devName of Object.keys(DEV)) {
    for (const b of BODIES) {
      // ── 걷기: 조우 전 · 조우(적이 다가와 섬) ──
      {
        const page = await browser.newPage(DEV[devName]);
        page.on('pageerror', (e) => proof.errors.push(e.message));
        await newGame(page, b.fi, b.patch);
        await page.locator('.bha-prop--outside').first().click();
        await wait(page, 700);
        await page.locator('.bha-worldmap [data-place="adventure"]').first().click();
        await wait(page, 2000);
        await page.getByRole('button', { name: '★1', exact: true }).first().click().catch(() => {});
        await wait(page, 300);
        await page.getByRole('button', { name: '출발', exact: true }).first().click();
        await wait(page, 1500);
        const pre = await measureIn(page, { hero: '.bha-walker .bha-rigcanvas, .bha-walker img.bha-walker__img' });
        add({ screen: 'walk-pre', dev: devName, body: b.id, ...pre });
        // 다가와 선 순간(도착 → 전투 진입은 곧바로라 기다리지 않고 바로 잰다)
        // 적이 길에 나타나면 → 멈출 때까지(is-arrived 또는 위치가 3프레임 그대로) 매 프레임 보고 바로 잰다
        const arrived = await page.waitForSelector('.bha-ahead .bha-foe', { state: 'attached', timeout: 150_000 }).then(() => page.evaluate(() => new Promise((res) => {
          let last = null, same = 0;
          const f = () => {
            const a = document.querySelector('.bha-ahead .bha-foe');
            if (!a) return res(false);
            const x = a.getBoundingClientRect().left;
            if (a.closest('.bha-ahead').classList.contains('is-arrived')) return res(true);
            if (last !== null && Math.abs(x - last) < 0.1) { if (++same >= 3) return res(true); } else same = 0;
            last = x;
            requestAnimationFrame(f);
          };
          f();
        }))).catch(() => false);
        const m = await measureIn(page, { hero: '.bha-walker .bha-rigcanvas, .bha-walker img.bha-walker__img', foe: '.bha-ahead .bha-foe .bha-rigcanvas, .bha-ahead .bha-foe img.bha-foe__img' });
        const kind = await page.evaluate(() => document.querySelector('.bha-ahead')?.dataset.ahead ?? null);
        if (b.id === 'hollow-base' || b.id === 'shinigami') await shot(page, `walk-encounter-${b.id}-${devName}`);
        const gap = m.foe && m.hero ? { px: +(m.hero.left - m.foe.right).toFixed(1), perBodyW: +((m.hero.left - m.foe.right) / ((m.hero.figW + m.foe.figW) / 2)).toFixed(3) } : null;
        const edges = await page.evaluate(() => {
          const sc = document.querySelector('.bha-walk')?.getBoundingClientRect();
          const box = (s) => { const e = document.querySelector(s); if (!e) return null; const r = e.getBoundingClientRect(); return { l: r.left, r: r.right, t: r.top, b: r.bottom }; };
          return { scene: sc ? { l: sc.left, r: sc.right, t: sc.top, b: sc.bottom } : null, chips: box('.bha-exp__chips'), hp: box('.bha-exp__hp') };
        });
        add({ screen: 'walk-encounter', dev: devName, body: b.id, aheadKind: kind, arrived, ...m, ratio: ratio(m.foe, m.hero), gap, insideScene: !!(edges.scene && m.hero && m.foe && m.hero.right <= edges.scene.r + 0.5 && m.foe.left >= edges.scene.l - 0.5), edges });
        await page.close();
      }
      // ── 전투: 일반(짐승형) · 강적(본크러셔) · 보스 · 탑 층 ──
      const fights = process.env.ONLY === 'walk' ? [] : b.id === 'hollow-base' || b.id === 'hollow-brute'
        ? [['짐승형', null, 'normal'], ['본크러셔', null, 'elite'], ['갑각형', 3, 'tower']]
        : [['짐승형', null, 'normal']];
      if (b.id === 'hollow-base' && devName === 'pc') fights.push(['보스', null, 'boss']);
      for (const [foeName, floor, tag] of fights) {
        const page = await browser.newPage(DEV[devName]);
        page.on('pageerror', (e) => proof.errors.push(e.message));
        await newGame(page, b.fi, b.patch);
        try {
          if (tag === 'boss') {
            // 보스 = 목록의 보스 묶음 첫 항목
            await page.getByRole('button', { name: '더보기' }).first().click({ timeout: 4000 });
            await wait(page, 400);
            await page.getByRole('button', { name: '테스트' }).first().click({ timeout: 4000 });
            await wait(page, 600);
            await page.locator('.bha-viewtitle button').first().click({ timeout: 4000 });
            await wait(page, 400);
            await page.getByText('바로 전투', { exact: true }).first().click({ timeout: 4000 });
            await wait(page, 500);
            await page.getByRole('button', { name: '상대' }).first().click({ timeout: 4000 });
            await wait(page, 400);
            await page.locator('[role="option"]').filter({ visible: true }).last().click();
            await wait(page, 300);
            await page.getByRole('button', { name: '전투 시작' }).click({ timeout: 4000 });
            await page.locator('.bha-battle').waitFor({ timeout: 60_000 });
            await wait(page, 1500);
          } else await testBattle(page, foeName, floor);
          const enemy = await page.evaluate(() => window.__bhaCombat?.enemy?.def?.id ?? window.__bhaCombat?.enemy?.id ?? null);
          const m = await measureIn(page, { hero: HERO, foe: FOE });
          add({ screen: `battle-${tag}`, dev: devName, body: b.id, enemy, ...m, ratio: ratio(m.foe, m.hero) });
          if ((tag === 'normal' && (b.id === 'shinigami' || b.id === 'hollow-brute') && devName === 'pc') || (tag === 'tower' && b.id === 'hollow-base' && devName === 'phone')) await shot(page, `battle-${tag}-${b.id}-${devName}`);
        } catch (e) {
          add({ screen: `battle-${tag}`, dev: devName, body: b.id, error: String(e.message).slice(0, 120) });
        }
        await page.close();
      }
    }
    // ── 적 도감 상세(덩치 적) ──
    if (process.env.ONLY !== 'walk') {
      const page = await browser.newPage(DEV[devName]);
      page.on('pageerror', (e) => proof.errors.push(e.message));
      const DEX = { 'normal-basic': { seen: 3, kills: 2, absorbs: { both: 1, trait: 0, stat: 0, none: 1 }, where: 'ground:outskirts', firstAt: 1 }, 'fire-heavy-seal': { seen: 2, kills: 1, absorbs: { both: 1, trait: 0, stat: 0, none: 0 }, where: 'ground:canyon', firstAt: 1 } };
      await newGame(page, 0, { dex: DEX });
      try {
        await page.locator('.bha-prop--book').first().click();
        await wait(page, 800);
        await page.locator('.bha-viewtitle__btn').first().click();
        await wait(page, 300);
        await page.locator('.bha-viewtitle__item', { hasText: '적 도감' }).click();
        await wait(page, 600);
        const rows = page.locator('.bha-mdrow:not(.is-unknown)');
        await rows.first().click();
        await wait(page, 500);
        const a = await measureIn(page, { foe: '.bha-edex__art--hero img' });
        const all = await page.evaluate(() => [...document.querySelectorAll('.bha-edex__art--row img')].filter((i) => i.naturalWidth).length);
        add({ screen: 'dex-detail', dev: devName, body: 'enemy-brute', ...a, rowImgs: all });
        if (devName === 'pc') await shot(page, `dex-detail-${devName}`);
      } catch (e) {
        add({ screen: 'dex-detail', dev: devName, error: String(e.message).slice(0, 120) });
      }
      await page.close();
    }
  }
  await browser.close();
  fs.writeFileSync(path.join(OUT, `size-proof${process.env.ONLY ? '-' + process.env.ONLY : ''}${process.env.SHOT ? '' : '-draft'}.json`), JSON.stringify({ ...proof, shots }, null, 2));
})();
