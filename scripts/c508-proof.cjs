// C.508 proof (점검 1119 게임 버그): PC 844×390 + 폰 796×384, 1배.
// 01 다시 켠 뒤 다시 뜬 진화 미루기 창 · 02 스택 칩 설명(봉수대 봉화) · 03 공화 공허 블록 글자·꺼짐 안내 · 04 영왕 빈 자리 + 상태창 · 05 첫 포식 튜토리얼 카드 자리
// 실행: node scripts/c508-proof.cjs [저장 폴더]   (C508_ONLY=1,3 처럼 일부만)
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const { startServer, newGame } = require('./c276-proof.cjs');

const OUT = path.resolve(process.argv[2] || path.join(__dirname, '..', 'docs/captures/c508'));
const PC = { viewport: { width: 844, height: 390 }, deviceScaleFactor: 1 };
const PHONE = { viewport: { width: 796, height: 384 }, deviceScaleFactor: 1, hasTouch: true, isMobile: true };
const ONLY = (process.env.C508_ONLY || '1,2,3,4,5').split(',').map(Number);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

/** 세이브를 슬롯 1에 쓰고 이어하기. build(s, mods) 가 세이브를 고친다 (브라우저 안) */
async function seed(page, url, test, factionId, build, arg = {}) {
  const q = test ? '?test=1' : '';
  await page.goto(`${url}${q}`);
  await page.evaluate(() => localStorage.clear());
  await page.evaluate(async ({ test, factionId, build, arg }) => {
    const m = {
      g: await import('/src/game.ts'), fa: await import('/src/engine/evolution/formAbilities.ts'), fd: await import('/src/data/evolution/index.ts'),
      ev: await import('/src/engine/evolution/evolution.ts'), tm: await import('/src/engine/testMode.ts'), tut: await import('/src/engine/tutorial.ts'),
    };
    const slots = await import('/src/saveSlots.ts');
    const store = test ? m.tm.testStorage(localStorage) : localStorage;
    const now = Date.now();
    const s = m.g.newSaveData(factionId, now);
    s.name = '시험';
    s.gender = 'male';
    s.help.tutorialSeen = true;
    for (const id of m.tut.GUIDE_IDS) s.help.guides[id] = 'done';
    while (s.build.slots.length < 6) s.build.slots.push(null);
    s.nest.hunger = 30;
    s.nest.condition = 90;
    // eslint-disable-next-line no-new-func
    new Function('s', 'm', 'arg', 'now', build)(s, m, arg, now);
    slots.writeSlotSave(store, s, 1);
    slots.touchSlot(store, 1, now);
  }, { test, factionId, build: build.toString().replace(/^[^{]*\{/, '').replace(/\}\s*$/, ''), arg });
  await page.goto(`${url}${q}`);
  await wait(1500);
  const cont = page.getByRole('button', { name: '이어하기' });
  if (await cont.count()) await cont.click({ timeout: 5000 });
  await wait(2500);
}

const FORM4 = (s, m, arg) => {
  const e = s.evolution;
  e.tierIndex = 3; e.formHistory = ['t2:base', arg.third, arg.formId]; e.formId = arg.formId; e.ascended = true;
  const trait = m.fa.representativeAbility(m.fd.getForm(arg.formId), 'shinigami')?.id;
  e.abilities = { owned: trait ? { [trait]: 1 } : {}, equipped: trait ? [trait] : [], slots: 2, tier4Ever: true };
};

async function openTest(page, tabName) {
  await page.getByRole('button', { name: /더보기/ }).first().click({ timeout: 3000 });
  await wait(400);
  await page.getByRole('button', { name: '테스트', exact: true }).first().click({ timeout: 3000 });
  await wait(700);
  await page.locator('.bha-test-page .bha-viewtitle, .bha-test-page [aria-haspopup]').first().click({ timeout: 2000 }).catch(() => {});
  await wait(300);
  await page.getByRole('option', { name: tabName }).or(page.getByRole('menuitemradio', { name: tabName })).or(page.getByRole('button', { name: tabName })).first().click({ timeout: 3000 });
  await wait(600);
}

/** 바로 전투 → 멈춘 상태로. clearTray = 바 비우기 */
async function battle(page, clearTray = true) {
  await openTest(page, '바로 전투');
  await page.getByRole('button', { name: '전투 들어가기' }).first().click({ timeout: 3000 });
  await wait(800);
  const ok = page.getByRole('button', { name: '확인', exact: true }).filter({ visible: true });
  if (await ok.count()) await ok.last().click({ timeout: 3000 });
  await page.waitForFunction(() => !!window.__bhaCombat && window.__bhaCombat.tick > 5, null, { timeout: 15000 });
  await page.evaluate((clear) => {
    const s = window.__bhaCombat;
    s.enemy.maxHp *= 50; s.enemy.hp = s.enemy.maxHp; s.player.maxHp *= 3; s.player.hp = s.player.maxHp;
    s.spawnTimer = 1e9; s.enemy.attackTimer = 1e9; s.enemy.actionTimer = 1e9; s.params.timeLimitSeconds = 1e6; s.player.attackTimer = 1e9;
    if (clear) s.tray = [];
  }, clearTray);
  await wait(300);
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const srv = await startServer();
  const browser = await chromium.launch();
  const proof = { shots: [], errors: [], checks: {} };
  const shot = async (page, name) => { await page.screenshot({ path: path.join(OUT, `${name}.png`) }); proof.shots.push(`${name}.png`); };
  const fresh = async (vp = PC) => { const p = await browser.newPage(vp); p.on('pageerror', (e) => proof.errors.push(e.message)); return p; };
  const box = (page, sel) => page.evaluate((sel) => { const e = document.querySelector(sel); if (!e) return null; const r = e.getBoundingClientRect(); return { top: Math.round(r.top), bottom: Math.round(r.bottom), left: Math.round(r.left), right: Math.round(r.right) }; }, sel);
  const overlap = (a, b) => !!a && !!b && a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
  try {
    if (ONLY.includes(1)) {
      // ① 귀환 결과 화면에서 껐다 켬 = 진화 묻는 중 표시(evolution.choice)가 남은 세이브 → 이어하기 → 방에서 창이 다시 뜬다
      for (const [vp, tag] of [[PC, 'pc'], [PHONE, 'phone']]) {
        const page = await fresh(vp);
        await seed(page, srv.url, false, 'hollow', (s, m) => {
          s.evolution.steps = m.ev.stepsNeeded(s.evolution);
          s.evolution.choice = { hunger: 30, condition: 90, runId: 3 };
        });
        await page.waitForSelector('.bha-evolve-choice', { timeout: 5000 }).catch(() => {});
        await wait(700);
        proof.checks[`dialog-${tag}`] = await page.locator('.bha-evolve-choice').count();
        proof.checks[`modalBg-${tag}`] = await page.evaluate(() => { const m = document.querySelector('.bha-evolve-choice .bha-modal'); if (!m) return null; const cs = getComputedStyle(m); return { bg: cs.backgroundColor, opacity: cs.opacity, z: getComputedStyle(m.parentElement).zIndex }; });
        await shot(page, `01-evolve-choice-again-${tag}`);
        if (tag === 'pc') {
          await page.getByRole('button', { name: '미루기' }).click({ timeout: 3000 });
          await wait(600);
          proof.checks.afterDefer = await page.evaluate(async () => {
            const slots = await import('/src/saveSlots.ts'); const g = await import('/src/game.ts');
            void slots; for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); const raw = localStorage.getItem(k); if (raw && raw.includes('"evolution"') && raw.includes('"deferrals"')) { const m = raw.match(/"deferrals":(\d+)/); return { key: k, deferrals: m ? Number(m[1]) : null, choice: raw.includes('"choice"') }; } } void g; return null;
          });
          await page.reload(); await wait(1500);
          const cont = page.getByRole('button', { name: '이어하기' }); if (await cont.count()) await cont.click(); await wait(2000);
          proof.checks.dialogAfterDeferReload = await page.locator('.bha-evolve-choice').count();
        }
        await page.close();
      }
    }
    if (ONLY.includes(2)) {
      // ② 봉수대 봉화 3개 → 칩 누르기 = 설명 창
      const page = await fresh();
      await seed(page, srv.url, true, 'shinigami', FORM4, { formId: 't4:fire:physical', third: 't3:fire' });
      await battle(page);
      await page.evaluate(() => { window.__bhaCombat.evo.stacks.beacon = { n: 3 }; });
      await wait(500);
      const chip = page.locator('.bha-mark[data-mark="evo-s-beacon"]');
      proof.checks.beaconChip = await chip.count() ? await chip.getAttribute('aria-label') : null;
      if (await chip.count()) await chip.first().click();
      await wait(500);
      proof.checks.beaconTip = await page.evaluate(() => [...document.querySelectorAll('.bha-infotip, [role="tooltip"], .bha-tip')].map((e) => e.textContent).join(' | '));
      await shot(page, '02-stack-chip-tip');
      const p2 = page.locator('.bha-mark[data-mark="evo-passive"]');
      proof.checks.passiveChip = await p2.count() ? await p2.getAttribute('aria-label') : null;
      await page.close();
    }
    if (ONLY.includes(3)) {
      // ③ 공화 공허 블록: 글자 = 공(봉 아님) · 누르면 꺼진 이유 알림
      for (const [vp, tag] of [[PC, 'pc'], [PHONE, 'phone']]) {
        const page = await fresh(vp);
        await seed(page, srv.url, true, 'shinigami', FORM4, { formId: 'h4:void', third: 't3:normal' });
        await battle(page, false);
        await wait(400);
        proof.checks[`voidGlyph-${tag}`] = await page.locator('.bha-block.is-locked .bha-block__glyph').allTextContents();
        const off = page.locator('.bha-block.is-locked').first();
        proof.checks[`voidTitle-${tag}`] = await off.getAttribute('title');
        proof.checks[`voidState-${tag}`] = await page.evaluate(() => ({ status: window.__bhaCombat.status, paused: !!document.querySelector('.bha-battle.is-paused, .is-paused'), tut: document.querySelectorAll('.bha-tut').length }));
        const bb = await off.boundingBox();
        if (bb) { await page.mouse.move(bb.x + bb.width / 2, bb.y + bb.height / 2); await page.mouse.down(); await wait(80); await page.mouse.up(); }
        await wait(500);
        proof.checks[`voidToast-${tag}`] = await page.locator('.bha-toast').allTextContents();
        await shot(page, `03-void-block-off-${tag}`);
        await page.close();
      }
    }
    if (ONLY.includes(4)) {
      // ④ 영왕(그림 없는 초월자) 방: 빈 자리 점선과 상태창이 겹치지 않는다
      for (const [vp, tag] of [[PC, 'pc'], [PHONE, 'phone']]) {
        const page = await fresh(vp);
        await seed(page, srv.url, true, 'shinigami', FORM4, { formId: 't4:fire:physical', third: 't3:fire' });
        await page.evaluate(async () => {
          const tm = await import('/src/engine/testMode.ts');
          proof = tm.testTranscendents().map((t) => t.id); window.__ids = proof; // eslint-disable-line no-undef
        }).catch(() => {});
        const ids = await page.evaluate(() => window.__ids || []);
        proof.checks.transcendents = ids;
        await openTest(page, '초월자').catch((e) => proof.errors.push(`openTest 초월자: ${e.message}`));
        const btn = page.getByRole('button', { name: /영왕/ }).first();
        if (await btn.count()) { await btn.click({ timeout: 3000 }).catch(() => {}); await wait(800); }
        // 트랙 바꾸기 (있으면)
        const sw = page.getByRole('button', { name: /영왕.*(바꾸|전환)|이 트랙/ }).first();
        if (await sw.count()) { await sw.click().catch(() => {}); await wait(800); }
        for (let i = 0; i < 4; i++) { await page.keyboard.press('Escape'); await wait(300); }
        await wait(1200);
        const e = await box(page, '.bha-char__body.is-empty .bha-emptyart');
        const st = await box(page, '.bha-room__status, .bha-statusbox, [data-status-box]');
        proof.checks[`reiou-${tag}`] = { empty: e, status: st, overlap: overlap(e, st) };
        await shot(page, `04-reiou-empty-status-${tag}`);
        await page.close();
      }
    }
    if (ONLY.includes(5)) {
      // ⑤ 새 게임 → 첫 전투 튜토리얼 → 첫 포식 6/6 카드: 갈래 버튼·적 카드를 덮지 않는다
      const page = await fresh();
      await newGame(page, srv.url, 0);
      const dev = (name) => page.locator(`.bha-dev__btn[aria-label="${name}"]`).first();
      for (let t = 0; t < 900; t++) {
        const st = await page.evaluate(() => {
          const l = [...document.querySelectorAll('.bha-tut')].pop() ?? null; const sel = document.querySelector('.bha-sel'); const only = l?.dataset.devOnly ?? null;
          return { name: l?.dataset.tutorial ?? null, title: l?.querySelector('.bha-tut__title, h2, h3')?.textContent ?? null, step: l?.querySelector('.bha-tut__count, .bha-tut__step')?.textContent ?? null, only, pass: !!l?.hasAttribute('data-dev-pass'), selOnly: !!(sel && only && sel.matches(only)), absorb: !!document.querySelector('.bha-tutabsorb .bha-absorb__pick, .bha-tutabsorb .bha-absorb__actions') };
        }).catch(() => ({}));
        if (st.absorb && st.name && /첫/.test(st.title ?? '')) {
          await wait(700);
          const card = await box(page, '.bha-tut__card, .bha-tut [role="dialog"], .bha-tut .bha-coach');
          proof.checks.absorbCard = { card, actions: await box(page, '.bha-absorb__actions'), foe: await box(page, '.bha-foecard'), go: await box(page, '.bha-absorb__go') };
          proof.checks.absorbCard.overActions = overlap(card, proof.checks.absorbCard.actions);
          proof.checks.absorbCard.overFoe = overlap(card, proof.checks.absorbCard.foe);
          await shot(page, '05-first-absorb-card');
          break;
        }
        if (await page.locator('.bha-battle').count()) {
          if (st.name === 'script') { const acting = st.pass && st.only; if (acting && !st.selOnly) await dev('아래').click().catch(() => {}); else await dev('확정').click().catch(() => {}); await wait(acting ? 900 : 300); continue; }
          await wait(150); continue;
        }
        const go = page.locator('.bha-lcd [data-dev-layer] button.bha-btn--primary:not([disabled])').filter({ visible: true });
        if (st.name && st.absorb) await dev('확정').click().catch(() => {});
        else if (await go.count()) await go.first().click({ timeout: 2000 }).catch(() => {});
        else if (st.only) await dev(st.selOnly ? '확정' : '아래').click().catch(() => {});
        else if (t > 8) await page.locator('.bha-prop--outside, .bha-prop--door, .bha-worldmap [data-place="adventure"]').first().click({ timeout: 2000 }).catch(() => {});
        await wait(350);
      }
      await page.close();
    }
  } finally {
    fs.writeFileSync(path.join(OUT, 'proof.json'), JSON.stringify(proof, null, 1));
    console.log(JSON.stringify(proof, null, 1));
    await browser.close();
    srv.stop();
  }
})();
