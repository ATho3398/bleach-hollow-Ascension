// C.276 proof (GDD 180장 1, 코딩191): 튜토리얼 안내가 떠 있는 동안 지시한 버튼(구멍 대상)만 눌린다 — 화면 터치·기기 버튼 둘 다.
// 새 게임(테스트 모드 아님)을 기기 버튼(✓)만으로 진행하며 단계마다: ① 다른 곳 화면 터치(진짜 마우스 누름) → 화면·단계 그대로 + 대상 깜빡임(.bha-tut-nudge)
// ② ◀ → 그대로, 새 알림 없음 ③ ▲▼ 초점 = 안내 창 버튼·지금 대상만. 두 종족. 캡처 1배 844×390 docs/captures/c276/
// 실행: node scripts/c276-proof.cjs (C276_URL=<주소>, C276_FACTIONS=0,1)
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'docs/captures/c276');
const PORT = 5376;
const FACTIONS = (process.env.C276_FACTIONS ?? '0,1').split(',').map(Number);

async function startServer() {
  if (process.env.C276_URL) return { url: process.env.C276_URL, stop: () => {} };
  const p = spawn('npx', ['vite', '--port', String(PORT), '--strictPort'], { cwd: ROOT, stdio: 'pipe', detached: true });
  const url = `http://localhost:${PORT}/`;
  for (let i = 0; i < 60; i++) {
    try { if ((await fetch(url)).ok) return { url, stop: () => { try { process.kill(-p.pid); } catch { /* */ } } }; } catch { /* */ }
    await new Promise((r) => setTimeout(r, 500));
  }
  try { process.kill(-p.pid); } catch { /* */ }
  throw new Error('vite 서버가 뜨지 않았다');
}

const BTN = { up: '위', down: '아래', ok: '확정', back: '취소' };
const press = async (page, b, wait = 160) => {
  await page.locator(`.bha-dev__btn[aria-label="${BTN[b]}"]`).first().click({ timeout: 2000 }).catch(() => {});
  await page.waitForTimeout(wait);
};

async function newGame(page, url, fi) {
  await page.goto(url);
  await page.evaluate(() => localStorage.clear());
  await page.goto(url);
  await page.waitForTimeout(1200);
  await page.getByRole('button', { name: '새로 시작' }).click();
  await page.waitForTimeout(300);
  await page.locator('.bha-slot').first().click();
  await page.getByRole('button', { name: '확인' }).click();
  await page.waitForTimeout(300);
  await page.locator('.bha-species__card').nth(fi).click();
  await page.waitForTimeout(300);
  await page.getByRole('button', { name: '시작', exact: true }).click();
  await passIdentity(page);
}

/** 이름 정하기 → 성별 정하기 (GDD 199장 6, C.326): 화면이 뜨면 이름을 넣고 [다음] → 첫 성별 → [시작]. 안 뜨면(옛 빌드) 그냥 지나간다 */
async function passIdentity(page, name = '시험', gender = 0) {
  await page.waitForTimeout(300);
  const input = page.locator('[data-ident="name"]');
  if (!(await input.count())) return;
  await input.fill(name);
  await page.locator('[data-ident="next"]').click();
  await page.waitForTimeout(200);
  await page.locator('.bha-ident__gender').nth(gender).click();
  await page.locator('[data-ident="done"]').click();
}

/** 지금 상태: 화면 이름 + 맨 위 안내(이름·단계 글자·stage) */
const snap = (page) => page.evaluate(() => {
  const app = document.querySelector('.bha-lcd .bha-app');
  const screen = app ? [...app.classList].filter((c) => c.startsWith('bha-') && c !== 'bha-app').slice(0, 3).join('.') : 'none';
  const tuts = [...document.querySelectorAll('.bha-tut[data-tut-guard]')];
  const t = tuts[tuts.length - 1];
  return {
    screen,
    tut: t ? t.dataset.tutorial : null,
    step: t ? (t.querySelector('.bha-tut__step')?.textContent ?? '') : null,
    stage: t ? t.dataset.stage ?? null : null,
    title: t ? (t.querySelector('.bha-tut__title')?.textContent ?? '').trim() : null,
    acting: t ? t.hasAttribute('data-dev-pass') : false,
    allow: t ? t.dataset.devOnly ?? null : null,
    toasts: document.querySelectorAll('.bha-toast').length,
    dialogs: document.querySelectorAll('.bha-itemdialog, .bha-overlay, .bha-help').length,
  };
}).catch(() => null);

/** 지금 기기 초점 칸 */
const sel = (page) => page.evaluate(() => {
  const s = document.querySelector('.bha-sel');
  if (!s) return null;
  const tut = [...document.querySelectorAll('.bha-tut[data-tut-guard]')].pop();
  const allow = tut?.hasAttribute('data-dev-pass') ? tut.dataset.devOnly : null;
  return {
    lab: (s.getAttribute('aria-label') || s.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 24),
    inCard: !!tut && tut.contains(s),
    isTarget: !!allow && !!s.closest(allow),
  };
}).catch(() => null);

/** 눌러 볼 '다른 곳': 지금 화면에 보이는 것 중 안내 창·대상이 아닌 첫 버튼 (선택자 후보 순서대로) */
const OTHER = [
  '.bha-prop--book', '.bha-prop--altar', '.bha-prop--chest', '.bha-homedock__carebtn--pet', '.bha-homedock__carebtn--sleep', '[data-place="market"]', '[data-place="training"]',
  '[data-sc="pause"]', '[data-sc="help"]', '.bha-viewtitle__btn', '.bha-itemmodal__close', '.bha-spa__leave', '[role="tab"]', 'button',
];
const findOther = (page) => page.evaluate((cands) => {
  const tut = [...document.querySelectorAll('.bha-tut[data-tut-guard]')].pop();
  const allow = tut?.hasAttribute('data-dev-pass') ? tut.dataset.devOnly : null;
  for (const c of cands) {
    for (const e of document.querySelectorAll(`.bha-lcd ${c}`)) {
      if (tut && tut.contains(e)) continue;
      if (allow && e.closest(allow)) continue;
      const r = e.getBoundingClientRect();
      if (r.width < 4 || r.height < 4 || getComputedStyle(e).visibility === 'hidden') continue;
      return { sel: c, lab: (e.getAttribute('aria-label') || e.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 20), x: r.left + r.width / 2, y: r.top + r.height / 2 };
    }
  }
  return null;
}, OTHER);

const same = (a, b) => !!a && !!b && a.screen === b.screen && a.tut === b.tut && a.step === b.step && a.stage === b.stage && a.title === b.title && a.dialogs === b.dialogs;

/** 한 단계 검사: 다른 곳 터치 · ◀ · ▲▼ 초점 */
async function probe(page, label, shotName, shot) {
  const before = await snap(page);
  const other = await findOther(page);
  const r = { label, before, other };
  if (other) {
    const nudgedNow = () => page.evaluate(() => [...document.querySelectorAll('.bha-tut-nudge')].map((e) => (e.getAttribute('aria-label') || e.textContent || e.className).replace(/\s+/g, ' ').trim().slice(0, 20)));
    await page.mouse.click(other.x, other.y);
    await page.waitForTimeout(120);
    r.nudged = await nudgedNow();
    if (r.nudged.length === 0) {
      // 안내 창이 막 다시 그려진 순간(진입 연출)이면 한 번 더
      await page.waitForTimeout(1200);
      await page.mouse.click(other.x, other.y);
      await page.waitForTimeout(120);
      r.nudged = await nudgedNow();
      r.retried = true;
    }
    if (shotName) await shot(page, shotName);
    await page.waitForTimeout(600);
    r.afterTouch = await snap(page);
    r.touchIgnored = same(before, r.afterTouch);
  }
  await press(page, 'back', 400);
  r.afterBack = await snap(page);
  r.backIgnored = same(before, r.afterBack) && r.afterBack.toasts <= before.toasts;
  const foci = [];
  for (let i = 0; i < 6; i++) {
    await press(page, 'down', 140);
    foci.push(await sel(page));
  }
  r.foci = [...new Map(foci.filter(Boolean).map((f) => [f.lab, f])).values()];
  r.focusOnlyTarget = r.foci.every((f) => f.inCard || f.isTarget);
  r.afterNav = await snap(page);
  // 온천 체력 가득 → 온천 안 알림 → 2초 뒤 방 (GDD 180장 2, C.273 코딩192): 누름과 상관없이 저절로 바뀐다 — 화면 비교에서 뺀다
  r.spaAutoLeave = before.screen.includes('bha-spa') && (r.afterNav.screen.includes('bha-room') || r.afterBack.toasts > before.toasts) && await page.evaluate(() => [...document.querySelectorAll('.bha-toast')].some((t) => t.textContent.includes('가득')));
  if (r.spaAutoLeave) {
    r.backIgnored = r.afterBack.tut === before.tut && r.afterBack.step === before.step;
    r.ok = (!other || (r.touchIgnored && r.nudged.length > 0)) && r.backIgnored && r.focusOnlyTarget && r.afterNav.tut === before.tut && r.afterNav.step === before.step;
    return r;
  }
  // 단계 있는 실제 조작 카드는 시간이 지나 다음 대상이 보이면 단계가 바뀐다(온천 들어가는 연출 끝) — 단계 번호는 비교에서 뺀다
  if (before.acting && r.afterNav.stage !== before.stage) r.afterNav = { ...r.afterNav, stage: before.stage, acting: before.acting, allow: before.allow };
  r.ok = (!other || (r.touchIgnored && r.nudged.length > 0)) && r.backIgnored && r.focusOnlyTarget && same(before, r.afterNav);
  return r;
}

module.exports = { passIdentity, startServer, press, newGame, snap, sel, findOther, probe };

if (require.main === module) (async () => {
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
      const res = { probes: [], trace: [] };
      proof.factions[fname] = res;
      await newGame(page, srv.url, fi);
      // 탄생 연출 → 홈 안내가 뜰 때까지 기다린다
      for (let t = 0; t < 80 && !(await snap(page))?.tut; t++) await page.waitForTimeout(250);
      const seen = new Set();
      let roomIdle = 0;
      const want = (key) => !seen.has(key) && (seen.add(key), true);
      // 각 튜토리얼 단계에서 한 번씩 검사하며 ✓ 로 진행 (대상이 아닌 곳은 기기도 못 고른다 → ✓ = 대상 또는 [다음])
      for (let i = 0; i < 900; i++) {
        const s = await snap(page);
        if (!s) { await page.waitForTimeout(200); continue; }
        const key = s.tut ? `${s.screen}|${s.tut}|${s.step}|${s.stage}|${s.title}|${s.acting}` : null;
        if (key && res.trace[res.trace.length - 1] !== key) { res.trace.push(key); console.log(fname, key); fs.writeFileSync(path.join(OUT, 'proof.json'), JSON.stringify(proof, null, 2)); }
        if (!s.tut && i % 20 === 0) { console.log(fname, 'free', s.screen); await page.screenshot({ path: path.join(OUT, '_debug.png') }); }
        if (s.tut) {
          roomIdle = 0;
          await page.waitForTimeout(250);
          // 캡처할 단계: 홈 안내 첫 카드 · 월드맵(모험) · 첫 모험 안내 · 첫 전투 · 온천
          let shotName = null;
          if (s.tut === 'home-intro' && s.step.startsWith('홈 안내 1 ') && want('home')) shotName = `${fname}-1-home-intro-touch-other`;
          else if (s.tut === 'home-intro' && s.screen.includes('worldmap') && want('wm')) shotName = `${fname}-2-worldmap-adventure`;
          else if (s.tut === 'first-run' && want('prep')) shotName = `${fname}-3-first-run-guide`;
          else if (s.tut === 'script' && s.acting && want('battle')) shotName = `${fname}-4-first-battle`;
          else if (s.tut === 'recover' && (s.screen.includes('spa') || s.allow?.includes('spa')) && want(`spa${s.stage}`)) shotName = `${fname}-5-spa-${s.stage === null ? 'rest' : 'way'}`;
          if (want(`probe|${key}`)) {
            const r = await probe(page, key, shotName, shot);
            res.probes.push(r);
          }
          // 진행: 실제 조작 카드는 초점을 대상에 두고 ✓, 설명 카드는 ✓(= [다음])
          await press(page, 'ok', 450);
        } else {
          // 안내 없는 화면(걷기·전투 진행·흡수 화면 등): ✓ 로 진행. 방·월드맵은 누르지 않고 다음 안내를 기다린다(월드맵이면 ◀ 로 방)
          if (s.screen.includes('room')) {
            if (s.screen.includes('worldmap')) { await press(page, 'back', 800); continue; }
            roomIdle += 1;
            if (roomIdle > 40) break; // 방에서 10초 넘게 안내가 없다 = 회복 안내까지 끝
            await page.waitForTimeout(250);
            continue;
          }
          // 걷기(원정 지도)는 저절로 간다 — ✓ 를 누르면 가방 등이 열리니 기다린다. 열린 창은 ◀ 로 닫는다
          if (s.dialogs > 0 && !s.screen.includes('battle')) await press(page, 'back', 300);
          else if (s.screen.includes('bha-exp')) await page.waitForTimeout(400);
          else await press(page, 'ok', 300);
        }
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
  const all = Object.values(proof.factions).flatMap((f) => f.probes);
  proof.summary = { probes: all.length, ok: all.filter((p) => p.ok).length, failed: all.filter((p) => !p.ok).map((p) => p.label) };
  fs.writeFileSync(path.join(OUT, 'proof.json'), JSON.stringify(proof, null, 2));
  console.log(JSON.stringify(proof.summary, null, 2), proof.errors.slice(0, 5));
})();
