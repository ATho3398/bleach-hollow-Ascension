// C.285 proof (GDD 183장 화면 C, 코딩201): 리디자인 v2 전투(S09)·전투 해방 중(S10)·일시정지 창·로그 — 두 종족 캡처 + 배치 점검.
// 테스트 모드(?test=1)로 새 게임 → 월드맵 → 모험 ★1 출발 → 첫 전투.
// 해방 중 장면은 테스트 창구(window.__bhaCombat = 전투 상태)로 해방 남은 시간·봉인을 넣어 그린다(그림 확인용 — 엔진 코드는 그대로).
// 캡처 1배 844×390 docs/captures/c285/  실행: node scripts/c285-proof.cjs (C285_URL=<주소>, C285_FACTIONS=0,1)
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'docs/captures/c285');
const PORT = 5385;
const FACTIONS = (process.env.C285_FACTIONS ?? '0,1').split(',').map(Number);

async function startServer() {
  if (process.env.C285_URL) return { url: process.env.C285_URL, stop: () => {} };
  const p = spawn('npx', ['vite', '--port', String(PORT), '--strictPort'], { cwd: ROOT, stdio: 'pipe', detached: true });
  const url = `http://localhost:${PORT}/`;
  for (let i = 0; i < 60; i++) {
    try { if ((await fetch(url)).ok) return { url, stop: () => { try { process.kill(-p.pid); } catch { /* */ } } }; } catch { /* */ }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error('vite 서버가 뜨지 않았다');
}

/** 배치 점검: 전투 루트 좌표계 안 위치(px) — 머리 줄 40·스킬창 130·블록 칸 정사각·생성 칸 초점 제외·버튼 높이 */
const layoutInPage = () => {
  const root = document.querySelector('.bha-root.bha-battle');
  if (!root) return null;
  const k = root.getBoundingClientRect().width / root.offsetWidth; // 화면 배율
  const o = root.getBoundingClientRect();
  const box = (e) => { if (!e) return null; const r = e.getBoundingClientRect(); return { x: Math.round((r.left - o.left) / k), y: Math.round((r.top - o.top) / k), w: Math.round(r.width / k), h: Math.round(r.height / k) }; };
  const q = (s) => root.querySelector(s);
  const cells = [...root.querySelectorAll('.bha-v2cell')].map(box);
  const fonts = [...root.querySelectorAll('.bha-skillpanel *, .bha-v2toprow *')].filter((e) => e.childNodes.length && [...e.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim()) && e.getClientRects().length)
    .map((e) => parseFloat(getComputedStyle(e).fontSize) );
  return {
    root: { w: root.offsetWidth, h: root.offsetHeight },
    top: box(q('.bha-v2toprow')), skill: box(q('.bha-skillpanel')), legend: box(q('.bha-v2legendrow')),
    gen: box(q('.bha-v2role--spawn')), genFocusable: q('.bha-v2role--spawn')?.matches('button, a[href], input, select, summary, [role="tab"], [data-dev-press]') ?? null,
    guard: box(q('.bha-v2role--guard')), item: box(q('.bha-v2role--item')), gear: box(q('.bha-v2role--gear')),
    cellsSquare: cells.every((c) => c && c.w === c.h), cell0: cells[0], cellCount: cells.length,
    me: box(q('.bha-unit--me .bha-unit__fig')), foe: box(q('.bha-unit--foe .bha-unit__fig')), meHp: box(q('.bha-unit--me .bha-v2hp')), foeHp: box(q('.bha-unit--foe .bha-v2hp')),
    minFont: Math.min(...fonts),
    topButtons: [...root.querySelectorAll('.bha-v2bar button')].map((b) => box(b).h),
  };
};

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const srv = await startServer();
  const browser = await chromium.launch();
  const proof = { shots: [], layout: {}, errors: [] };
  try {
    for (const fi of FACTIONS) {
      const fname = fi === 0 ? 'hollow' : 'shinigami';
      const page = await browser.newPage({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 1 });
      page.on('pageerror', (e) => proof.errors.push(`${fname}: ${e.message}`));
      const wait = (ms) => page.waitForTimeout(ms);
      const shot = async (name) => {
        await wait(350);
        const file = `${fname}-${name}.png`;
        await page.screenshot({ path: path.join(OUT, file) });
        proof.shots.push(file);
        console.log(file);
      };
      await page.goto(`${srv.url}?test=1`);
      await page.evaluate(() => localStorage.clear());
      await page.goto(`${srv.url}?test=1`);
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
      await wait(2500);
      await page.locator('.bha-prop--outside').first().click();
      await wait(900);
      await page.locator('.bha-worldmap [data-place="adventure"]').first().click();
      await wait(2200);
      await page.locator('.bha-lcd').getByRole('button', { name: '★1', exact: true }).first().click();
      await wait(400);
      await page.locator('.bha-lcd').getByRole('button', { name: '출발', exact: true }).first().click();
      await page.locator('.bha-battle').waitFor({ timeout: 60_000 });
      await wait(5000);
      await shot('1-battle');
      proof.layout[fname] = await page.evaluate(layoutInPage);
      // 로그 열기
      await page.locator('.bha-v2bar button[aria-label="로그"]').click();
      await wait(300);
      await shot('2-log');
      await page.locator('.bha-v2bar button[aria-label="로그"]').click();
      // 해방 중 + 봉인 (그림 확인용 상태 넣기)
      await page.evaluate(() => {
        const s = window.__bhaCombat;
        if (!s) return;
        s.liberation.ticksLeft = 120;
        s.sealTicks = 40;
        const lib = document.querySelector('.bha-v2herolib');
        if (lib) { lib.hidden = false; const t = lib.querySelector('.bha-v2herolib__time'); if (t) { t.hidden = false; const b = t.querySelector('b'); if (b) b.textContent = '12'; } }
        document.querySelector('.bha-libcut')?.classList.add('is-on');
      });
      await wait(250);
      await shot('3-release');
      await page.evaluate(() => { const s = window.__bhaCombat; if (s) { s.liberation.ticksLeft = 1; s.sealTicks = 0; } });
      await wait(400);
      // 일시정지 창
      await page.locator('.bha-v2bar button[aria-label="일시정지"]').click();
      await wait(300);
      await shot('4-pause');
      await page.close();
    }
  } finally {
    await browser.close();
    srv.stop();
  }
  fs.writeFileSync(path.join(OUT, 'proof.json'), JSON.stringify(proof, null, 2));
  console.log(JSON.stringify(proof, null, 1));
})();
