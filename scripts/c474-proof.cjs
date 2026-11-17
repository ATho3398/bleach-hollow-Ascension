// C.474 proof: 큰 피해 숫자 + 기술 이름 안 겹침(최후의 월아천충 · 월아천충 충전 평타) · 진화 결과 그림 칸 안(아쥬커스 모델 7종 · 길리안 · 4단계).
// PC 844×390 · 폰 796×384 1배. 실행: node scripts/c474-proof.cjs [저장 폴더]
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const { startServer } = require('./c276-proof.cjs');

const OUT = path.resolve(process.argv[2] || path.join(__dirname, '..', 'docs/captures/c474'));
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
async function newGame(page, url, card = 0) {
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
  await page.locator('.bha-species__card').nth(card).click();
  await wait(300);
  await page.getByRole('button', { name: '네', exact: true }).click();
  await wait(400);
  const nm = page.locator('[data-ident="name"]');
  if (await nm.count()) {
    await nm.fill('권영');
    await nm.press('Enter');
    await wait(300);
    await page.locator('.bha-ident__gender[data-gender="male"]').click();
    await page.locator('.bha-ident .bha-btn--primary').last().click();
  }
  await wait(2500);
  await skipTut(page);
}
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
const calm = (page) => page.evaluate(() => {
  const s = window.__bhaCombat;
  s.enemy.maxHp *= 50; s.enemy.hp = s.enemy.maxHp; s.player.maxHp *= 3; s.player.hp = s.player.maxHp;
  s.spawnTimer = 1e9; s.enemy.attackTimer = 1e9; s.enemy.actionTimer = 1e9; s.params.timeLimitSeconds = 1e6; s.player.attackTimer = 1e9; s.tray = [];
});
async function startBattle(page) {
  await openTest(page, '바로 전투');
  await page.getByRole('button', { name: '전투 들어가기' }).first().click({ timeout: 3000 });
  await wait(800);
  const ok = page.getByRole('button', { name: '확인', exact: true }).filter({ visible: true });
  if (await ok.count()) await ok.last().click({ timeout: 3000 });
  await page.waitForFunction(() => !!window.__bhaCombat && window.__bhaCombat.tick > 5, null, { timeout: 15000 });
  await calm(page);
}
async function toIchigo(page, server) {
  await newGame(page, server.url, 0);
  await openTest(page, '붕옥·초월자');
  await page.getByRole('button', { name: /^이치고/ }).first().click({ timeout: 3000 });
  await wait(2500); await skipTut(page);
}
/** 보이는 떠오르는 글자: 이름(체인·기술) / 숫자 상자와 겹침 넓이 */
const floatFacts = (page) => page.evaluate(() => {
  const vis = [...document.querySelectorAll('.bha-float')].filter((f) => !f.hidden);
  const box = (f) => { const r = f.getBoundingClientRect(); return { text: f.textContent, kind: [...f.classList].find((c) => /^bha-float--(attack|chain)$/.test(c)), x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height), big: f.classList.contains('is-big') || f.classList.contains('is-critical') }; };
  const all = vis.map(box);
  const names = all.filter((b) => b.kind === 'bha-float--chain');
  const nums = all.filter((b) => b.kind === 'bha-float--attack');
  const over = (a, b) => Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)) * Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
  let worst = 0;
  for (const n of names) for (const m of nums) worst = Math.max(worst, over(n, m));
  return { all, overlapPx: worst };
});

async function finalSlash(page, proof, name) {
  await page.evaluate(() => { const s = window.__bhaCombat; s.kit.risk = 0; s.kit.mastery = 99; s.tray = []; });
  await wait(600);
  await page.evaluate(() => { window.__bhaCombat.kit.mastery = 100; });
  await wait(500);
  await page.locator('.bha-v2herolib').first().click({ timeout: 3000, force: true });
  await page.waitForFunction(() => window.__bhaCombat.kit.second, null, { timeout: 5000 });
  await wait(1500);
  await page.evaluate(() => { const s = window.__bhaCombat; s.kit.finalStack = s.params.kit.mastery.stacks; s.tray = []; s.player.attackTimer = 1; });
  await page.waitForFunction(() => { const s = window.__bhaCombat; return !!s.kit.cine && s.tick >= s.kit.cine.hit + 1; }, null, { timeout: 15000 });
  await wait(60);
  proof.facts[name] = await floatFacts(page);
  await page.screenshot({ path: path.join(OUT, `${name}.png`) });
  proof.shots.push(`${name}.png`);
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const server = await startServer();
  const browser = await chromium.launch();
  const proof = { errors: [], shots: [], facts: {} };
  const step = async (name, fn) => { try { await fn(); } catch (e) { proof.errors.push(`${name}: ${String(e).slice(0, 300)}`); } };
  const battle = process.env.C474_ONLY !== 'evolve';
  try {
    if (battle) {
      const ctx = await browser.newContext(PC);
      const page = await ctx.newPage();
      page.on('pageerror', (e) => proof.errors.push(`pc: ${e.message.slice(0, 200)}`));
      await toIchigo(page, server);
      await step('charged', async () => {
        await startBattle(page);
        // 충전 평타 '월아천충' (이름 + 숫자): 배율을 키워 큰 숫자로
        await page.evaluate(() => {
          const s = window.__bhaCombat;
          for (const b of s.params.kit.blocks) if (b.chargeShot) b.chargeShot.power = 8;
          s.kit.charges = 1; s.player.attackTimer = 1;
        });
        await page.waitForFunction(() => [...document.querySelectorAll('.bha-float--chain')].some((f) => !f.hidden), null, { timeout: 8000 });
        await wait(200);
        proof.facts['01-pc-charged-shot-name-number'] = await floatFacts(page);
        await page.screenshot({ path: path.join(OUT, '01-pc-charged-shot-name-number.png') });
        proof.shots.push('01-pc-charged-shot-name-number.png');
      });
      // 장면 가운데 큰 기술 이름(.bha-afx-name, 체인 3 계열 기술)과 큰 숫자 자리 5곳: 가짜 요소를 같은 층에 놓고 겹침 넓이를 잰다
      await step('afx-name', async () => {
        proof.facts.afxNameVsSpots = await page.evaluate(async () => {
          const bt = await import('/src/ui/bha/battle.ts');
          const floats = document.querySelector('.bha-float')?.parentElement;
          const layer = document.querySelector('.bha-afx-name')?.parentElement ?? [...document.querySelectorAll('[class*="afx"]')].find((e) => getComputedStyle(e).position === 'absolute' && e.children.length >= 0 && e.offsetWidth > 300) ?? floats;
          const nm = document.createElement('div'); nm.className = 'bha-afx-name is-big'; nm.textContent = '그란 레이 세로'; nm.style.animation = 'none';
          layer.append(nm);
          const a = nm.getBoundingClientRect();
          const out = [];
          for (let i = 0; i < bt.FLOAT_SPOTS.length; i++) {
            const f = bt.floatEl('attack', '−9999', bt.FLOAT_SPOTS[i], { size: 'big' }); f.style.animation = 'none'; floats.append(f);
            const b = f.getBoundingClientRect();
            out.push(Math.round(Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left)) * Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top))));
            f.remove();
          }
          nm.remove();
          return { layer: layer.className, name: { l: Math.round(a.left), t: Math.round(a.top), r: Math.round(a.right), b: Math.round(a.bottom) }, overlapPx: out };
        });
      });
      await step('final', () => finalSlash(page, proof, '02-pc-final-slash-big-number'));
      await ctx.close();
    }
    if (battle) {
      const ctx = await browser.newContext(PH);
      const page = await ctx.newPage();
      page.on('pageerror', (e) => proof.errors.push(`phone: ${e.message.slice(0, 200)}`));
      await toIchigo(page, server);
      await step('phone', async () => { await startBattle(page); await finalSlash(page, proof, '03-phone-final-slash-big-number'); });
      await ctx.close();
    }
    // 체인 3 계열 기술: 장면 가운데 큰 기술 이름 + 큰 숫자 (호로 새 게임 → 공격 블록 셋을 붙여 한 번에)
    if (battle) {
      const ctx = await browser.newContext(PC);
      const page = await ctx.newPage();
      page.on('pageerror', (e) => proof.errors.push(`chain: ${e.message.slice(0, 200)}`));
      await newGame(page, server.url, 0);
      await step('chain3', async () => {
        await startBattle(page);
        await page.evaluate(() => { window.__bhaCombat.spawnTimer = 0; });
        await page.waitForFunction(() => window.__bhaCombat.tray.some((b) => b.kind === 'skill' && b.family), null, { timeout: 20000 });
        await page.evaluate(() => {
          const s = window.__bhaCombat;
          const b = s.tray.find((x) => x.kind === 'skill' && x.family);
          s.tray = [0, 1, 2].map((i) => ({ ...b, uid: 90000 + i }));
          s.spawnTimer = 1e9;
        });
        await wait(300);
        await page.locator('.bha-block').first().click({ timeout: 3000, force: true });
        await page.waitForFunction(() => !!document.querySelector('.bha-afx-name') && [...document.querySelectorAll('.bha-float--attack')].some((f) => !f.hidden), null, { timeout: 8000 });
        await wait(150);
        const sample = () => page.evaluate(() => {
          const n = document.querySelector('.bha-afx-name');
          const a = n.getBoundingClientRect();
          const nums = [...document.querySelectorAll('.bha-float--attack')].filter((f) => !f.hidden).map((f) => ({ text: f.textContent, big: f.classList.contains('is-big'), r: f.getBoundingClientRect() }));
          const ov = (b) => Math.round(Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left)) * Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top)));
          return { name: n.textContent, nameBox: [Math.round(a.left), Math.round(a.top), Math.round(a.right), Math.round(a.bottom)], nums: nums.map((x) => ({ text: x.text, big: x.big, box: [Math.round(x.r.left), Math.round(x.r.top), Math.round(x.r.right), Math.round(x.r.bottom)], overlapPx: ov(x.r) })) };
        });
        const samples = [await sample()];
        await page.screenshot({ path: path.join(OUT, '09-pc-chain3-skill-name-number.png') });
        for (const ms of [250, 250, 250]) { await wait(ms); if (await page.locator('.bha-afx-name').count()) samples.push(await sample()); }
        proof.facts['09-pc-chain3-skill-name-number'] = { samples, maxOverlapPx: Math.max(...samples.flatMap((x) => x.nums.map((n) => n.overlapPx))) };
        proof.shots.push('09-pc-chain3-skill-name-number.png');
      });
      await ctx.close();
    }
    // ── 진화 결과 화면: 모델마다 결과 창을 바로 띄워 그림 상자를 잰다 ──
    // 진짜 진화 판정(testEvolveNext = 테스트 패널 [다음 진화]·귀환 진화와 같은 performEvolution)으로 만든 몸 → 결과 창 데이터는 app.ts onEvolved 와 같은 구성.
    // 3단계 모델 = 그 단계 노력치 1위(종족 설정 tierLooks: hp 외팔형·spr 거미형 …), 부유형 = 히든 진화체(h3:passage)는 테스트 진화체 고르기(setForm)
    const LOOKS = [
      { key: 't2-gillian', start: null, ev: null },
      ...[['carapace', 'atk'], ['stag', 'int'], ['rhino', 'hp'], ['wyrm', 'spr'], ['panther', 'aspd'], ['scorpion', 'def']].map(([skin, stat]) => ({ key: `t3-${skin}`, start: 't2:base', ev: stat })),
      { key: 't3-wraith', start: 't2:base', pick: 'h3:passage' },
      { key: 't4', start: 't3:normal', ev: 'hp' },
      { key: 's-t2', fid: 'shinigami', start: null, ev: null },
      { key: 's-t3', fid: 'shinigami', start: 't2:base', ev: 'hp' },
      { key: 's-t4', fid: 'shinigami', start: 't3:normal', ev: 'hp' },
    ];
    const SHOT = { 't3-rhino': '04-evolve-rhino', 't3-wyrm': '05-evolve-spider', 't2-gillian': '06-evolve-gillian', 't4': '07-evolve-t4', 's-t3': '10-evolve-shinigami-t3' };
    for (const [vpName, vp] of [['pc', PC], ['phone', PH]]) {
      const ctx = await browser.newContext(vp);
      const page = await ctx.newPage();
      page.on('pageerror', (e) => proof.errors.push(`evolve ${vpName}: ${e.message.slice(0, 200)}`));
      await page.goto(`${server.url}?test=1`);
      await wait(1500);
      proof.facts[`evolve-${vpName}`] = [];
      for (const L of LOOKS) {
        if (vpName === 'phone' && !['t3-rhino', 't2-gillian', 't3-wyrm', 't4', 's-t3'].includes(L.key)) continue;
        await step(`evolve ${L.key}`, async () => {
          proof.facts[`evolve-${vpName}-state`] ??= [];
          const st = await page.evaluate(async (L) => {
            const fac = await import('/src/data/factions/index.ts');
            const g = await import('/src/game.ts');
            const tm = await import('/src/engine/testMode.ts');
            const ev = await import('/src/engine/evolution/index.ts');
            const fx = await import('/src/engine/faction.ts');
            const ea = await import('/src/ui/evolvedArt.ts');
            const ep = await import('/src/ui/evolutionPanel.ts');
            const f = fac.getFaction(L.fid ?? 'hollow');
            const s = g.newSaveData(f.id, Date.now());
            // 진짜 판정이 망한 진화체로 가지 않게(C.470 과 같은 조건): 블록 1칸 장착 · 허기 30 · 컨디션 90
            const tr = await import('/src/data/traits/index.ts');
            const t0 = tr.TRAITS.find((t) => t.element === 'normal') ?? tr.TRAITS[0];
            s.build.slots[0] = t0.id;
            s.nest.hunger = 30; s.nest.condition = 90;
            if (L.start) tm.setForm(s, L.start);
            const from = s.evolution.tierIndex;
            let r;
            if (L.pick) {
              tm.setForm(s, L.pick);
              r = { ok: true, form: (await import('/src/data/evolution/index.ts')).getForm(L.pick), abilityGain: { kind: 'none' }, abilitySlotsAdded: 0 };
            } else {
              if (L.ev) s.evolution.ev = { ...s.evolution.ev, [L.ev]: 120 };
              r = tm.testEvolveNext(s);
            }
            if (!r.ok) return { err: r.reason };
            const e = s.evolution;
            const extra = { elements: ev.playerElementsOf(e), ability: e.ability, ev: { ...e.ev }, failLine: ev.isFailLine(e), look: e.look ?? null, stats: ev.baseStatsOf(e, f.id), ...ep.gainExtra(e, r.abilityGain, r.abilitySlotsAdded), art: ea.evolvedArtOf(fx.roomOf(f), s) };
            const root = document.querySelector('.bha-stage')?.parentElement ?? document.getElementById('app');
            ep.evolutionView(root, f, from, e.tierIndex, r.form, () => {}, s.build.slots.length, extra);
            return { form: e.formId, look: e.look, elements: extra.elements };
          }, L);
          proof.facts[`evolve-${vpName}-state`].push({ key: L.key, ...st });
          if (st.err) throw new Error(st.err);
          await wait(300);
          await page.getByRole('button', { name: '건너뛰기' }).first().click({ timeout: 3000 });
          await wait(1200);
          const m = await page.evaluate(() => {
            const fig = document.querySelector('.bha-evolve__fig--result');
            const panel = document.querySelector('.bha-evolve__resmain');
            const img = fig?.querySelector('.bha-hero__img');
            const r = (e) => { const b = e.getBoundingClientRect(); return { top: Math.round(b.top), bottom: Math.round(b.bottom), left: Math.round(b.left), right: Math.round(b.right) }; };
            // 그림에서 실제로 칠해진 픽셀의 위·아래 (변형 적용된 화면 좌표, object-fit contain = 정사각 그림)
            let drawn = null;
            const isCv = img instanceof HTMLCanvasElement;
            if (img && (isCv ? img.width : img.naturalWidth)) {
              const c = isCv ? img : document.createElement('canvas');
              if (!isCv) { c.width = img.naturalWidth; c.height = img.naturalHeight; c.getContext('2d').drawImage(img, 0, 0); }
              const g = c.getContext('2d');
              const d = g.getImageData(0, 0, c.width, c.height).data;
              let top = -1, bot = -1;
              for (let y = 0; y < c.height; y++) { let any = false; for (let x = 0; x < c.width; x++) if (d[(y * c.width + x) * 4 + 3] > 16) { any = true; break; } if (any) { if (top < 0) top = y; bot = y; } }
              const b = img.getBoundingClientRect();
              drawn = { top: Math.round(b.top + (top / c.height) * b.height), bottom: Math.round(b.top + ((bot + 1) / c.height) * b.height) };
            }
            const nb = document.querySelector('.bha-evolve__new')?.getBoundingClientRect();
            return { newBox: nb && { top: Math.round(nb.top), bottom: Math.round(nb.bottom) }, tag: img && img.tagName, fig: fig && r(fig), panel: panel && r(panel), img: img && r(img), drawn, scale: img && getComputedStyle(img).getPropertyValue('--art-scale'), scrollTop: panel?.scrollTop, scrollH: panel?.scrollHeight, clientH: panel?.clientHeight };
          });
          m.key = L.key;
          m.newLine = await page.locator('.bha-evolve__new').first().textContent();
          m.elementRow = await page.locator('.bha-evolve__info .bha-info__row').nth(2).textContent();
          m.drawnInFig = !!(m.drawn && m.fig && m.drawn.top >= m.fig.top && m.drawn.bottom <= m.fig.bottom);
          m.figInPanel = !!(m.fig && m.panel && m.fig.top >= m.panel.top);
          m.newInPanel = !!(m.newBox && m.panel && m.newBox.bottom <= m.panel.bottom && m.newBox.top >= m.panel.top);
          m.noScroll = m.scrollH <= m.clientH;
          proof.facts[`evolve-${vpName}`].push(m);
          const nm = vpName === 'phone' ? (L.key === 't3-rhino' ? '08-phone-evolve-rhino' : null) : SHOT[L.key];
          if (nm) { await page.screenshot({ path: path.join(OUT, `${nm}.png`) }); proof.shots.push(`${nm}.png`); }
        });
      }
      await ctx.close();
    }
  } catch (e) {
    proof.errors.push(String(e).slice(0, 400));
  } finally {
    const pf = path.join(OUT, 'proof.json');
    const prev = fs.existsSync(pf) ? JSON.parse(fs.readFileSync(pf, 'utf8')) : { facts: {}, shots: [] };
    fs.writeFileSync(pf, JSON.stringify({ errors: proof.errors, shots: [...new Set([...prev.shots, ...proof.shots])], facts: { ...prev.facts, ...proof.facts } }, null, 2));
    await browser.close(); server.stop?.();
    console.log(JSON.stringify(proof, null, 1));
    process.exit(0);
  }
})();
