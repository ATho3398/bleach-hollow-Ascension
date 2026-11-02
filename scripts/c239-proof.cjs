// C.239 proof (GDD 159장 UI 검수 1차): 가방 소모품·스킨 탭 · 상점 약/전투 소모품 탭 · 떠돌이 상인 n/1개 구매 가능 · 탑 다음 층 ⓘ ·
// 번호 쟁탈전 목록 · 방 상태 ⓘ 창 · 설정 화면 탭 · 모험 출발 화면. 테스트 모드(?test=1) 사신 세이브, 1배 844×390.
// 실행: node scripts/c239-proof.cjs (C239_URL=<이미 떠 있는 주소>, C239_OUT=<폴더>) — 캡처 docs/captures/c239/
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..');
const OUT = process.env.C239_OUT ?? path.join(ROOT, 'docs/captures/c239');
const PORT = 5339;

async function startServer() {
  if (process.env.C239_URL) return { url: process.env.C239_URL, stop: () => {} };
  const p = spawn('npx', ['vite', '--port', String(PORT), '--strictPort'], { cwd: ROOT, stdio: 'ignore', detached: true });
  const url = `http://localhost:${PORT}/`;
  for (let i = 0; i < 60; i++) {
    try { if ((await fetch(url)).ok) return { url, stop: () => { try { process.kill(-p.pid); } catch { /* 이미 */ } } }; } catch { /* 아직 */ }
    await new Promise((r) => setTimeout(r, 500));
  }
  try { process.kill(-p.pid); } catch { /* */ }
  throw new Error('vite 서버가 뜨지 않았다');
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const server = await startServer();
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 1 });
  page.on('pageerror', (e) => console.log('pageerror', e.message));
  const wait = (ms) => page.waitForTimeout(ms);
  const lcd = () => page.locator('.bha-lcd');
  const click = async (sel, ms = 500) => { await page.locator(sel).first().click({ timeout: 5000 }); await wait(ms); };
  const btn = async (name, ms = 500, within = '.bha-lcd') => { await page.locator(within).getByRole('button', { name, exact: true }).first().click({ timeout: 5000 }); await wait(ms); };
  /** 탭 (role=tab, 이름 뒤 숫자가 붙을 수 있다) */
  const tab = async (name, ms = 600) => { await page.locator('.bha-lcd [role="tab"]').filter({ hasText: new RegExp(`^\\s*${name}(\\s|\\d|$)`) }).first().click({ timeout: 5000 }); await wait(ms); };
  const back = async (ms = 500) => { await page.keyboard.press('Escape'); await wait(ms); };
  const shot = async (name) => { await wait(300); await page.screenshot({ path: path.join(OUT, name) }); console.log('shot', name); };
  /** 테스트 세이브를 고치고 다시 연다 */
  const edit = async (src) => {
    await page.evaluate((s) => { const k = 'bha-save-test'; const j = JSON.parse(localStorage.getItem(k)); new Function('j', s)(j); localStorage.setItem(k, JSON.stringify(j)); }, src);
    await page.reload(); await wait(1500);
    await page.getByRole('button', { name: '이어하기' }).click(); await wait(1800);
  };
  const toRoom = async () => { for (let i = 0; i < 6 && !(await page.locator('.bha-room:not(.bha-market):not(.bha-worldmap)').count()); i++) await back(600); };
  try {
    // 새 테스트 세이브 (사신)
    await page.goto(`${server.url}?test=1`); await page.evaluate(() => localStorage.clear());
    await page.goto(`${server.url}?test=1`); await wait(1200);
    await page.getByRole('button', { name: '새로 시작' }).click(); await wait(300);
    await page.locator('.bha-slot').first().click(); await wait(200);
    await page.getByRole('button', { name: '확인' }).click(); await wait(300);
    await page.locator('.bha-species__card').nth(1).click(); await wait(300);
    await page.getByRole('button', { name: '시작', exact: true }).click(); await wait(2500);
    // 가방에 음식·약·전투 소모품 · 다시 뽑기권, 탑 3층까지
    await edit(`j.shared.items = Object.assign(j.shared.items || {}, { 'heal-patch': 3, 'med-cure': 1, 'calm': 2, 'battle-haste': 2 }); j.shared.rerollTickets = 1; j.shared.tradeCoins = 5000; j.tower = { best: 3 };`);
    await wait(4000); // 알림 띠가 걷히게

    // ① 가방 소모품 탭 · 약 칸 (② 스킨 탭)
    await click('.bha-prop--chest', 900);
    await tab('소모품');
    await tab('약');
    await shot('01-가방-소모품-약.png');
    await tab('음식');
    await shot('01b-가방-소모품-음식.png');
    await tab('스킨');
    await shot('02-가방-스킨.png');
    await toRoom();

    // ③④ 상점 약 · 전투 소모품 탭
    await click('.bha-prop--outside', 1500);
    await click('.bha-worldmap [data-place="market"]', 2500);
    await click('.bha-market [data-spot="shop"]', 900);
    if (await page.locator('.bha-shoppick__list').count()) await page.locator('.bha-shoppick__list button').first().click(); // 상점 고르기 창 → 소모품 상점
    await wait(900);
    await tab('약');
    await shot('03-상점-약.png');
    await tab('전투 소모품');
    await shot('04-상점-전투소모품.png');
    await toRoom();

    // ⑤ 떠돌이 상인 (테스트 패널 불러오기 → 지금 부르기)
    await btn('더보기', 500);
    await btn('테스트', 800, '.bha-homedock__tray');
    await click('.bha-lcd .bha-viewtitle__btn', 400);
    await page.locator('.bha-viewtitle__list').getByRole('option', { name: '불러오기', exact: true }).click(); await wait(500);
    await lcd().getByRole('button', { name: '지금 부르기', exact: true }).nth(0).click(); await wait(600);
    await toRoom();
    await wait(3000);
    await click('.bha-prop--outside', 1500);
    await click('.bha-worldmap [data-place="market"]', 2500);
    await click('.bha-market [data-spot="wanderer"]', 1000);
    await shot('05-떠돌이상인.png');
    await toRoom();

    // ⑥ 도전의 탑 다음 층 카드 + ⓘ
    await click('.bha-prop--outside', 1500);
    await click('.bha-worldmap [data-place="tower"]', 2500);
    await click('.bha-tower__card .bha-info', 500);
    await shot('06-탑-다음층-정보.png');
    await toRoom();

    // ⑦ 번호 쟁탈전 목록 (수련장 머리 제목 토글)
    await click('.bha-prop--outside', 1500);
    await click('.bha-worldmap [data-place="training"]', 2500);
    await click('.bha-lcd .bha-viewtitle__btn', 400);
    await page.locator('.bha-viewtitle__list [role="option"]').last().click(); await wait(900);
    await shot('07-번호쟁탈전.png');
    await toRoom();

    // ⑧ 방 상태 ⓘ 창
    await click('.bha-room__status .bha-info, .bha-room [data-info]', 600);
    await shot('08-방-상태-정보.png');
    await back(500);
    await toRoom();

    // ⑨ 설정 화면 탭
    await btn('더보기', 500);
    await btn('설정', 900, '.bha-homedock__tray');
    await shot('09-설정-화면.png');
    await back(600);
    await toRoom();

    // ⑩ 모험 출발 화면
    await click('.bha-prop--outside', 1500);
    await click('.bha-worldmap [data-place="adventure"]', 2500);
    await shot('10-모험-출발.png');
  } finally {
    await browser.close();
    server.stop();
  }
})();
