// GDD 202장 proof: 노력치 상한이 가득일 때 흡수 화면('스탯만'만 흐림 + 이유 한 줄, '둘 다'·'속성만'은 그대로) · 상태 화면 노력치 줄.
// 조건: pc = 844×390 마우스(호로) / ph = 796×384 터치(사신). 1배, 5장. 실행: node scripts/c334-proof.cjs [출력 폴더]
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const { startServer } = require('./c276-proof.cjs');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.resolve(process.argv[2] || path.join(ROOT, 'docs/captures/c334'));
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const VIEW = {
  pc: { viewport: { width: 844, height: 390 }, deviceScaleFactor: 1 },
  ph: { viewport: { width: 796, height: 384 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true },
};

/** 테스트 모드(?test=1) 새 게임 — c329-proof 와 같은 순서(이름·성별 단계 포함) */
async function newGame(page, url, fi) {
  await page.goto(`${url}?test=1`);
  await page.evaluate(() => localStorage.clear());
  await page.goto(`${url}?test=1`);
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
  await wait(400);
  const input = page.locator('[data-ident="name"]');
  if (await input.count()) {
    await input.fill('시험');
    await page.locator('[data-ident="next"]').click();
    await wait(200);
    await page.locator('.bha-ident__gender').first().click();
    await page.locator('[data-ident="done"]').click();
  }
  await wait(2500);
}

/** 저장의 지금 트랙을 고친다 (c280-proof 와 같은 방식) */
async function patchSave(page, src) {
  await page.evaluate((code) => {
    const f = new Function('t', 'shared', code);
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
  }, src);
}

async function reopen(page, url) {
  await page.goto(`${url}?test=1`);
  await wait(1500);
  const cont = page.getByRole('button', { name: '이어하기' });
  if (await cont.count()) { await cont.first().click().catch(() => {}); await wait(600); }
  const slot = page.locator('.bha-slot').first();
  if (await slot.count()) { await slot.click().catch(() => {}); await page.getByRole('button', { name: '확인' }).click().catch(() => {}); await wait(1500); }
}

const vis = (loc) => loc.filter({ visible: true });

/** 모험 ★1 출발 → 첫 전투가 끝나 흡수 화면이 뜰 때까지 (전투는 손 안 대도 평타로 끝난다) */
async function toAbsorb(page) {
  await page.locator('.bha-prop--outside').first().click({ timeout: 4000 });
  await wait(1000);
  await page.locator('.bha-worldmap [data-place="adventure"]').first().click({ timeout: 4000 });
  await wait(1800);
  for (let i = 0; i < 6 && (await page.locator('.bha-lcd [data-dev-layer]').count()); i++) { await page.keyboard.press('Escape'); await wait(250); }
  await page.locator('.bha-lcd').getByRole('button', { name: '★1', exact: true }).first().click({ timeout: 3000 }).catch(() => {});
  await wait(400);
  await page.locator('.bha-lcd').getByRole('button', { name: '출발', exact: true }).first().click({ timeout: 3000 }).catch(() => {});
  await wait(1200);
  for (let t = 0; t < 300 && !(await page.locator('.bha-absorb__actions--modes').count()); t++) {
    const depart = vis(page.getByRole('button', { name: /출발$/ }));
    if (await depart.count()) { await depart.first().click({ timeout: 2000 }).catch(() => {}); await wait(800); continue; }
    const eat = vis(page.getByRole('button', { name: /하러 가기$/ }));
    const layerGo = vis(page.locator('.bha-lcd [data-dev-layer] button.bha-btn--primary'));
    if (await eat.count()) await eat.first().click({ timeout: 2000 }).catch(() => {});
    else if (await layerGo.count()) await layerGo.first().click({ timeout: 2000 }).catch(() => {});
    await wait(500);
  }
  await wait(800);
}

const absorbState = (page) => page.evaluate(() => {
  const btns = [...document.querySelectorAll('.bha-absorb__actions--modes .bha-btn')].map((b) => {
    const r = b.getBoundingClientRect();
    return { mode: b.dataset.mode, label: b.textContent?.trim().slice(0, 12), disabled: b.getAttribute('aria-disabled') === 'true', on: b.classList.contains('is-on'), y: Math.round(r.y), h: Math.round(r.height) };
  });
  const go = document.querySelector('[data-absorb-go]');
  const gr = go?.getBoundingClientRect();
  return { btns, desc: [...document.querySelectorAll('.bha-absorb__desc p')].map((p) => p.textContent), go: go ? { label: go.textContent, mode: go.dataset.goMode, y: Math.round(gr.y), disabled: go.disabled || go.getAttribute('aria-disabled') === 'true' } : null };
});

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const srv = await startServer();
  const browser = await chromium.launch();
  const proof = { cases: {}, errors: [] };
  try {
    for (const [mode, fi, fname] of [['pc', 0, 'hollow'], ['ph', 1, 'shinigami']]) {
      const tag = `${mode}-${fname}`;
      if (process.argv[3] && process.argv[3] !== mode) continue; // 세 번째 인자 = pc / ph 만
      const page = await browser.newPage(VIEW[mode]);
      page.on('pageerror', (e) => proof.errors.push(`${tag}: ${e.message.slice(0, 160)}`));
      await newGame(page, srv.url, fi);
      // 1단계 노력치 상한(56)을 꽉 채운 상태: 모든 능력치 9 + 힘 +2 = 56
      await patchSave(page, `
        t.help.guides = { ...t.help.guides, 'first-run': 'done', 'home-intro': 'done', 'first-run-room': 'done', 'birth': 'done', 'recover': 'done' };
        t.evolution.tierIndex = 0;
        for (const k of Object.keys(t.evolution.ev)) { t.evolution.ev[k] = 9; if (t.evolution.carry) t.evolution.carry[k] = 0; }
        t.evolution.ev.atk += 2;
      `);
      await reopen(page, srv.url);
      // 상태 화면 (방 머리 위 상태 박스를 누르면 상태 화면 — 터치에서도 같음)
      await page.locator('.bha-room__status').first().click({ timeout: 4000 });
      await wait(1200);
      await page.mouse.move(2, 2);
      await wait(200);
      const status = await page.evaluate(() => document.querySelector('[data-ev-total]')?.textContent ?? null);
      await page.locator('[data-ev-total]').first().scrollIntoViewIfNeeded().catch(() => {});
      await page.screenshot({ path: path.join(OUT, `${tag}-2-status-ev.png`) });
      // 흡수 화면
      await reopen(page, srv.url);
      await toAbsorb(page);
      const shots = {};
      const modes = mode === 'pc' ? ['stat', 'both'] : ['stat'];
      for (const m of modes) {
        await page.locator(`.bha-absorb__actions--modes [data-mode="${m}"]`).click({ timeout: 3000, force: true }); // aria-disabled 는 Playwright 가 "not enabled" 로 보지만 실제로는 눌린다(흐림만)
        await wait(500);
        shots[m] = await absorbState(page);
        await page.screenshot({ path: path.join(OUT, `${tag}-1-absorb-${m}.png`) });
      }
      // '속성만'·'둘 다' 버튼은 흐리지 않고 [흡수] 버튼이 그대로 실행되나 — 둘 다 를 골라 실행해 블록 고르기 단계로 넘어가는지
      await page.locator('.bha-absorb__actions--modes [data-mode="both"]').click({ timeout: 3000 });
      await wait(300);
      await page.locator('[data-absorb-go]').click({ timeout: 3000 });
      await wait(800);
      const afterGo = await page.evaluate(() => ({ modesLeft: document.querySelectorAll('.bha-absorb__actions--modes').length, cands: document.querySelectorAll('.bha-cand').length, text: document.querySelector('.bha-lcd')?.textContent?.includes('블록을 고른다') ?? false }));
      proof.cases[tag] = { status, shots, afterGo };
      await page.close();
    }
  } finally {
    await browser.close();
    srv.stop();
  }
  fs.writeFileSync(path.join(OUT, 'proof.json'), JSON.stringify(proof, null, 2));
  console.log(JSON.stringify(proof, null, 1));
  process.exit(0);
})();
