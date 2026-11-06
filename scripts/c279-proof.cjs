// C.279 proof (GDD 182장 1·2·4, 코딩193): 튜토리얼을 안내대로 '진짜 마우스'로만 끝까지 해 본다 — 두 종족.
// 단계마다: 실제 조작·각본 대기 카드 = 지금 대상(data-dev-only)을 마우스로 누름, 설명 카드 = 창 [다음]을 마우스로 누름.
// 누른 뒤 단계가 안 바뀌면(안 눌림) 다시 시도하고, 3번 넘게 안 바뀌면 '막힘'으로 기록한다 (180장 1 막기가 가르치는 행동까지 막던 것, 182장 2).
// 가방 단계: 가방이 열리면 '열어 보자' 카드가 남지 않고 다음 카드(구급상자 옆)로 넘어가는가 (182장 1). 월드맵 그림 윤곽 캡처 (182장 4).
// 캡처 1배 844×390 docs/captures/c279/. 실행: node scripts/c279-proof.cjs (C279_URL=<주소>, C279_FACTIONS=0,1)
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const { startServer, press, newGame, snap } = require('./c276-proof.cjs');

const ROOT = path.resolve(__dirname, '..');
const OUT = process.env.C279_OUT ? path.resolve(ROOT, process.env.C279_OUT) : path.join(ROOT, 'docs/captures/c279'); // C.304: 다른 캡처 폴더로 (C279_OUT=docs/captures/c304/tut)
const FACTIONS = (process.env.C279_FACTIONS ?? '0,1').split(',').map(Number);
if (process.env.C279_URL) process.env.C276_URL = process.env.C279_URL;

/** 지금 눌러야 할 곳의 화면 좌표: 대상(블록 칸은 블록이 든 칸) 또는 창 [다음] */
const pressPoint = (page) => page.evaluate(() => {
  const tut = [...document.querySelectorAll('.bha-tut[data-tut-guard]')].pop();
  if (!tut) return null;
  const shown = (e) => { const r = e.getBoundingClientRect(); return r.width > 2 && r.height > 2 && getComputedStyle(e).visibility !== 'hidden'; };
  const allow = tut.hasAttribute('data-dev-pass') ? tut.dataset.devOnly : null;
  let target = null;
  let kind = 'next';
  if (allow) {
    const list = [...document.querySelectorAll(allow)].filter((e) => !tut.contains(e) && shown(e));
    // 블록 칸: 블록이 들어 있는 칸만 (빈 칸은 눌러도 아무 일 없음)
    target = list.find((e) => !(e.dataset.sc ?? '').startsWith('block.') || e.firstElementChild) ?? null;
    kind = 'target';
  }
  if (!target) {
    const next = [...tut.querySelectorAll('.bha-tut__actions button')].find((b) => /다음|닫기|시작|알겠어요/.test(b.textContent) && !b.disabled);
    if (next && shown(next)) { target = next; kind = 'next'; }
  }
  if (!target) return { kind: 'wait' };
  const r = target.getBoundingClientRect();
  return { kind, lab: (target.getAttribute('aria-label') || target.dataset.sc || target.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 24), x: r.left + r.width / 2, y: r.top + r.height / 2 };
}).catch(() => null);

/** 진행 표시: 화면·안내·단계 + 전투 블록 수·각본 단계 + 화면 id */
const progress = (page) => page.evaluate(() => {
  const tut = [...document.querySelectorAll('.bha-tut[data-tut-guard]')].pop();
  const app = document.querySelector('.bha-lcd .bha-app');
  return JSON.stringify({
    app: app ? app.className : '',
    tut: tut?.dataset.tutorial ?? null,
    step: tut?.querySelector('.bha-tut__step')?.textContent ?? null,
    stage: tut?.dataset.stage ?? null,
    title: tut?.querySelector('.bha-tut__title')?.textContent ?? null,
    body: tut?.querySelector('.bha-tut__body')?.textContent ?? null,
    next: tut ? [...tut.querySelectorAll('.bha-tut__actions button')].map((b) => b.disabled).join() : null,
    blocks: document.querySelectorAll('[data-sc^="block."] > *').length,
    dlg: document.querySelectorAll('.bha-itemdialog').length,
  });
}).catch(() => '');

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const srv = await startServer();
  const browser = await chromium.launch();
  const proof = { factions: {}, errors: [], shots: [] };
  const shot = async (page, name) => { await page.screenshot({ path: path.join(OUT, `${name}.png`) }); proof.shots.push(`${name}.png`); };
  try {
    for (const fi of FACTIONS) {
      const page = await browser.newPage({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 1 });
      page.on('pageerror', (e) => proof.errors.push(`${fi}: ${e.message}`));
      const fname = fi === 0 ? 'hollow' : 'shinigami';
      const res = { presses: 0, stuck: [], trace: [], bag: null, battleUse: [] };
      proof.factions[fname] = res;
      await newGame(page, srv.url, fi);
      for (let t = 0; t < 80 && !(await snap(page))?.tut; t++) await page.waitForTimeout(250);
      let fails = 0;
      let lastKey = '';
      let roomIdle = 0;
      let idleBattle = 0;
      let wmShot = false;
      for (let i = 0; i < 700; i++) {
        const s = await snap(page);
        if (!s) { await page.waitForTimeout(200); continue; }
        // 월드맵 (안내 없이, 또는 첫 모험 안내 중) 캡처
        if (!wmShot && s.screen.includes('worldmap')) {
          await page.waitForTimeout(700);
          await shot(page, `${fi === 0 ? '4' : '5'}-${fname}-worldmap`);
          wmShot = true;
        }
        if (s.tut) {
          roomIdle = 0;
          const key = `${s.screen}|${s.tut}|${s.step}|${s.stage}|${s.title}`;
          if (key !== lastKey) { res.trace.push(key); console.log(fname, key); lastKey = key; fails = 0; }
          await page.waitForTimeout(300);
          const pt = await pressPoint(page);
          if (!pt || pt.kind === 'wait') { await page.waitForTimeout(300); continue; }
          const before = await progress(page);
          await page.mouse.click(pt.x, pt.y);
          res.presses++;
          // 각본 전투 블록 안내: 블록을 눌렀으면 쓰였는가 (블록 수가 줄거나 다음 단계)
          const isBlock = pt.kind === 'target' && pt.lab.startsWith('block.');
          let after = '';
          for (let w = 0; w < 12; w++) {
            await page.waitForTimeout(150);
            after = await progress(page);
            if (after !== before) break;
          }
          if (process.env.C279_DEBUG) console.log('  press', pt.kind, pt.lab, '\n   before', before, '\n   after ', after);
          if (isBlock) {
            const b0 = JSON.parse(before).blocks;
            const b1 = JSON.parse(after || before).blocks;
            res.battleUse.push({ step: s.step, title: s.title, blocksBefore: b0, blocksAfter: b1, used: after !== before });
            if (res.battleUse.length === 1) { await page.waitForTimeout(700); await shot(page, `3-${fname}-battle-block-used`); }
          }
          // 가방: 가방 단계에서 가방 물건을 누른 뒤 — 가방 화면에 '열어 보자' 카드가 남았나
          if (s.tut === 'recover' && pt.kind === 'target' && /chest|가방|상자|bha-prop/.test(pt.lab + s.title) && /회복 안내 [12] \//.test(s.step ?? '')) { // C.304(193장 8): 가방 카드 = 1번(빈사와 합침), 옛 = 2번
            await page.waitForTimeout(1500);
            const now = await snap(page);
            const body = await page.evaluate(() => [...document.querySelectorAll('.bha-tut[data-tut-guard]')].pop()?.querySelector('.bha-tut__body')?.textContent ?? null);
            res.bag = { screen: now?.screen, step: now?.step, title: now?.title, body, stalePrompt: !!body && body.includes('열어 보자') };
            await shot(page, `${fi === 0 ? '1' : '2'}-${fname}-bag-opened`);
          }
          // 행동 연출(먹는 모습·구급상자 사용)이 끝날 때까지 다시 누르지 않는다 — 사람처럼
          if (pt.kind === 'target' && after !== before && !isBlock) await page.waitForTimeout(1500);
          if (after === before) {
            fails++;
            if (fails === 3) res.stuck.push({ key, pressed: pt });
            if (fails >= 6) { await press(page, 'ok', 400); fails = 0; } // 기기 ✓ 로 넘겨 끝까지 본다
          }
        } else {
          if (s.screen.includes('room')) {
            if (s.screen.includes('worldmap')) { await press(page, 'back', 800); continue; }
            roomIdle += 1;
            if (roomIdle > 40) break;
            await page.waitForTimeout(250);
            continue;
          }
          // 전투 중(안내 사이)은 ✓ 를 누르지 않고 다음 각본 카드를 기다린다 — ✓ 가 막 뜬 카드를 대신 넘기지 않게. 오래 없으면 ✓
          if (s.screen === 'none' && ++idleBattle < 40) { await page.waitForTimeout(250); continue; }
          idleBattle = 0;
          if (s.dialogs > 0 && !s.screen.includes('battle')) await press(page, 'back', 300);
          else if (s.screen.includes('bha-exp')) await page.waitForTimeout(400);
          else await press(page, 'ok', 300);
        }
      }
      // 월드맵을 아직 못 찍었으면 방에서 월드맵 물건을 눌러 찍는다
      if (!wmShot) {
        await page.locator('.bha-prop--outside').first().click({ timeout: 3000 }).catch(() => {});
        await page.waitForTimeout(2500);
        await shot(page, `${fi === 0 ? '4' : '5'}-${fname}-worldmap`);
      }
      res.final = await snap(page);
      await page.close();
    }
  } catch (e) {
    proof.errors.push(String(e && e.stack || e));
  } finally {
    await browser.close();
    srv.stop();
  }
  // 카드 수 (C.304, GDD 193장 8): 안내 종류·단계 번호·제목이 다른 카드 = 1장 (단계 stage 변화는 같은 카드)
  const cardsOf = (f) => {
    const seen = new Map();
    for (const k of f.trace) { const [, tut, step, , title] = k.split('|'); const key = `${tut}|${step}|${title}`; if (!seen.has(key)) seen.set(key, tut); }
    const by = {};
    for (const tut of seen.values()) by[tut] = (by[tut] ?? 0) + 1;
    return { total: seen.size, by };
  };
  proof.summary = Object.fromEntries(Object.entries(proof.factions).map(([k, f]) => [k, { presses: f.presses, stuck: f.stuck.length, cards: cardsOf(f), bag: f.bag, battleUse: f.battleUse }]));
  fs.writeFileSync(path.join(OUT, 'proof.json'), JSON.stringify(proof, null, 2));
  console.log(JSON.stringify(proof.summary, null, 2), proof.errors.slice(0, 5));
})();
