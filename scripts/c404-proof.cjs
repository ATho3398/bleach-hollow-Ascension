// C.404 proof (GDD 241-B, 코딩268): 실제 새 게임 튜토리얼을 돌려 ① 각본 전투 해방 안내(lib-now·lib-explain) ② 막기 방어막 ③ 첫 포식 화면
// ④ 치명상 빈사 자세 ⑤ 온천 카드 문구·배부름 카드·튜토 먹이·보상 알림. PC 844×390, 1배. 쓰기: node scripts/c404-proof.cjs [저장 폴더]
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const { startServer, newGame } = require('./c276-proof.cjs');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.resolve(process.argv[2] || path.join(ROOT, 'docs/captures/c404'));
const VIEW = { viewport: { width: 844, height: 390 }, deviceScaleFactor: 1 };

/** ⑦ 진화 연출·결과 (GDD 241-B 7): 게임과 같은 화면 함수(evolutionView)에 게임과 같은 그림(heroArtOf — 2단계 길리안 종이인형)을 넘겨 LCD 안에 띄운다.
 *  새 게임 튜토리얼을 건너뛸 수 없어 진짜 진화 대신 화면 함수만 부른다 (app.ts 두 진화 길이 넘기는 값과 같은 모양 — c404.test 가 확인) */
async function evolveShots(browser, url, facts, errors) {
  const page = await browser.newPage(VIEW);
  page.on('pageerror', (e) => errors.push(`evo: ${e.message.slice(0, 160)}`));
  await page.goto(url);
  await page.waitForTimeout(1500);
  facts.evoFig = await page.evaluate(async () => {
    const P = await import('/src/ui/evolutionPanel.ts');
    const B = await import('/src/ui/bha/battle.ts');
    const FA = await import('/src/data/factions/index.ts');
    const EF = await import('/src/engine/faction.ts');
    const EV = await import('/src/data/evolution/index.ts');
    const faction = FA.getFaction('hollow');
    const form = EV.formsOfTier(2).find((f) => !f.hidden) ?? EV.formsOfTier(2)[0];
    const root = document.querySelector('.bha-lcd .bha-stage').parentElement;
    const art = B.heroArtOf(EF.roomOf(faction), 'hollow', 1);
    P.evolutionView(root, faction, 0, 1, form, () => {}, undefined, { elements: form.elements ?? [], ability: null, art });
    return { form: form.id };
  });
  await page.waitForTimeout(1900);
  Object.assign(facts.evoFig, await page.evaluate(() => ({ cut: !!document.querySelector('.bha-evolve__crack.has-fig [data-evolve-fig] .bha-hero'), result: !!document.querySelector('.bha-evolve__resmain [data-evolve-fig] .bha-hero') })));
  await page.screenshot({ path: path.join(OUT, '09-evolve-cutscene.png') });
  await page.waitForTimeout(2500);
  await page.screenshot({ path: path.join(OUT, '10-evolve-result.png') });
  facts.shots.push('09-evolve-cutscene', '10-evolve-result');
  await page.close();
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const server = await startServer();
  const browser = await chromium.launch();
  const facts = { shots: [], stages: [] };
  const errors = [];
  try {
    if (process.env.C394_ONLY_EVO) return void (await evolveShots(browser, server.url, facts, errors));
    const page = await browser.newPage(VIEW);
    page.on('pageerror', (e) => errors.push(e.message.slice(0, 160)));
    await newGame(page, server.url, 0);
    const shot = async (name) => { await page.screenshot({ path: path.join(OUT, `${name}.png`) }); facts.shots.push(name); };
    const dev = (name) => page.locator(`.bha-dev__btn[aria-label="${name}"]`).first();
    const look = () => page.evaluate(() => {
      const l = [...document.querySelectorAll('.bha-tut')].pop() ?? null;
      const sel = document.querySelector('.bha-sel');
      const only = l?.dataset.devOnly ?? null;
      return {
        name: l?.dataset.tutorial ?? null, title: l?.querySelector('.bha-tut__title, h2, h3')?.textContent ?? null, body: l?.querySelector('.bha-tut__body')?.textContent ?? null,
        only, pass: !!l?.hasAttribute('data-dev-pass'), selSc: sel?.dataset.sc ?? null, selOnly: !!(sel && only && sel.matches(only)),
        screen: [...document.querySelectorAll('.bha-lcd .bha-app')].map((e) => e.className).join('|'),
        guarding: !!document.querySelector('.bha-battle.is-guarding'), shield: (() => { const g = document.querySelector('.bha-battle.is-guarding .bha-guardshield'); return g ? getComputedStyle(g).display : null; })(),
        absorb: !!document.querySelector('.bha-tutabsorb .bha-absorb__pick'), wound: !!document.querySelector('.bha-wound'), rigDying: !!document.querySelector('.bha-wound__hero.is-rig-dying'),
        spa: !!document.querySelector('.bha-spa'), toast: [...document.querySelectorAll('.bha-toast')].map((t) => t.textContent).join(' | '),
      };
    });
    const seen = new Set();
    let shieldShot = false;
    for (let t = 0; t < 1400; t++) {
      const st = await look().catch(() => ({}));
      if (process.env.C394_DEBUG && t % 20 === 0) console.error(t, JSON.stringify({ n: st.name, ti: st.title, only: st.only, sel: st.selSc, so: st.selOnly, sc: st.screen, ab: st.absorb, w: st.wound, spa: st.spa }));
      const key = `${st.name}:${st.title}`;
      if (st.title && !seen.has(key)) { seen.add(key); facts.stages.push({ name: st.name, title: st.title, body: st.body }); }
      if (st.guarding && !shieldShot) { shieldShot = true; facts.guard = { shield: st.shield }; await shot('02-guard-shield'); }
      if (st.name === 'script' && /해방/.test(st.title ?? '') && !seen.has(`shot:${st.title}`)) {
        seen.add(`shot:${st.title}`);
        await page.waitForTimeout(300);
        await shot(st.title.includes('중') ? '03-lib-explain' : '01-lib-now');
      }
      if (st.absorb && !st.name && !seen.has('absorb')) { seen.add('absorb'); await page.waitForTimeout(600); await shot('04-first-absorb'); facts.absorbBox = await page.evaluate(() => { const r = (s) => { const e = document.querySelector(s); if (!e) return null; const b = e.getBoundingClientRect(); return [Math.round(b.top), Math.round(b.bottom)]; }; return { actions: r('.bha-tutabsorb .bha-absorb__actions'), desc: r('.bha-tutabsorb .bha-absorb__desc'), go: r('.bha-tutabsorb .bha-absorb__go'), col: r('.bha-tutabsorb .bha-lcdpage__col') }; }); if (process.env.C394_UNTIL === 'absorb') break; }
      if (st.wound && !seen.has('wound')) { seen.add('wound'); await page.waitForTimeout(1400); facts.rigDying = st.rigDying; await shot('05-wound-dying'); }
      if (st.name === 'recover' && st.title && !seen.has(`r:${st.title}`)) {
        seen.add(`r:${st.title}`);
        if (/배부름|포만/.test(st.title)) { await page.waitForTimeout(400); await shot('07-fullness-card'); }
      }
      if ((st.toast ?? '').includes('튜토리얼 보상') && !seen.has('reward')) { seen.add('reward'); facts.reward = st.toast; await page.waitForTimeout(700); await shot('08-feed-reward'); facts.food = await page.evaluate(() => { for (let i = 0; i < localStorage.length; i++) { const raw = localStorage.getItem(localStorage.key(i)); if (raw && raw.includes('"runLog"')) { const m = raw.match(/"food":\{[^}]*\}/); return m ? m[0] : null; } } return null; }); break; }
      if (st.spa && /찼다/.test(st.body ?? '') && !seen.has('spadone')) { seen.add('spadone'); facts.spaDone = st.body; await shot('06-spa-done'); }
      if (await page.locator('.bha-battle').count()) {
        if (st.name === 'script') {
          const acting = st.pass && st.only;
          if (acting && !st.selOnly) await dev('아래').click().catch(() => {});
          else await dev('확정').click().catch(() => {});
          await page.waitForTimeout(acting ? 900 : 300);
          continue;
        }
        await page.waitForTimeout(150);
        continue;
      }
      const go = page.locator('.bha-lcd [data-dev-layer] button.bha-btn--primary:not([disabled])').filter({ visible: true });
      if (st.absorb && !st.name) await page.locator('.bha-absorb__go').click({ timeout: 2000 }).catch(() => {});
      else if (!st.name && st.screen?.includes('bha-resultv2')) await page.locator('.bha-lcd .bha-result__home').first().click({ timeout: 2000 }).catch(() => {}); // 결과 → 둥지
      else if (!st.name && st.screen?.includes('bha-tutabsorb')) await page.locator('.bha-lcd .bha-tutabsorb button.bha-btn--primary').first().click({ timeout: 2000 }).catch(() => {}); // 결과 [계속]
      else if (await go.count()) await go.first().click({ timeout: 2000 }).catch(() => {});
      else if (st.only) await dev(st.selOnly ? '확정' : '아래').click().catch(() => {});
      else if (t > 8 && st.screen?.includes('worldmap')) await page.locator('.bha-worldmap [data-place="adventure"]').click({ timeout: 2000 }).catch(() => {});
      else if (t > 8 && !st.screen?.includes('spa')) await page.locator('.bha-prop--outside, .bha-prop--door').first().click({ timeout: 2000 }).catch(() => {});
      await page.waitForTimeout(350);
    }
    await page.close();
    if (!process.env.C394_SKIP_EVO && !process.env.C394_UNTIL) await evolveShots(browser, server.url, facts, errors);
  } finally {
    fs.writeFileSync(path.join(OUT, 'proof.json'), JSON.stringify({ facts, errors }, null, 1));
    console.log(JSON.stringify({ facts, errors }, null, 1));
    await browser.close();
    server.stop();
  }
})();
