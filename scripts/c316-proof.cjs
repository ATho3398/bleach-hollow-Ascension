// C.316 proof (GDD 195장 아래, 코딩227): 처음 화면(타이틀) 아래 안내 줄이 판(LCD) 안에 다 보이는가
// 장면: ① 평소(버전 줄) ② 자동 다시 시작 안내('새 버전으로 다시 시작한다…') ③ 세이브 읽기 오류 안내(note) ④ 열 수 없는 세이브 알림(stale) + 자동 다시 시작
// 조건: pc = 844×390 마우스 / ph = 796×384 터치 / ph115 = 796×384 터치 + 글자 1.15배. 종족 = pc 호로·ph 사신·ph115 호로(세이브 종족이 처음 화면 테마)
// 측정: 글 줄·버튼이 판 안(아래 끝 포함)인가 · 메뉴 버튼 자리(y)가 안내 줄 유무와 상관없이 같은가(173장 2)
// 캡처 1배 docs/captures/c316/. 실행: node scripts/c316-proof.cjs (C316_URL=<주소>)
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
if (process.env.C316_URL) process.env.C276_URL = process.env.C316_URL;
const { startServer, newGame } = require('./c276-proof.cjs');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'docs/captures/c316');
const SAVE_KEY = 'bleach-hollow-ascension.save';
const MODES = [
  { id: 'pc', fi: 0, ctx: { viewport: { width: 844, height: 390 }, deviceScaleFactor: 1 }, k: 1 },
  { id: 'ph', fi: 1, ctx: { viewport: { width: 796, height: 384 }, deviceScaleFactor: 1, hasTouch: true, isMobile: true }, k: 1 },
  { id: 'ph115', fi: 0, ctx: { viewport: { width: 796, height: 384 }, deviceScaleFactor: 1, hasTouch: true, isMobile: true }, k: 1.15 },
];

const look = (page) => page.evaluate(() => {
  const app = document.querySelector('.bha-lcd .bha-app.bha-start--title');
  if (!app) return { title: false };
  const box = app.getBoundingClientRect();
  const lcd = document.querySelector('.bha-lcd').getBoundingClientRect();
  const bottom = Math.min(box.bottom, lcd.bottom);
  const items = [...app.querySelectorAll('.bha-start__ver, .bha-notice, .bha-start__stale-actions .bha-btn, .bha-start__menu .bha-btn')].map((e) => {
    const r = e.getBoundingClientRect();
    return { cls: e.className.split(' ').slice(0, 2).join('.'), text: e.textContent.trim().slice(0, 30), top: Math.round(r.top), bottom: Math.round(r.bottom), inside: r.top >= box.top - 0.5 && r.bottom <= bottom + 0.5 && r.left >= lcd.left - 0.5 && r.right <= lcd.right + 0.5, clipped: e.scrollWidth > e.clientWidth + 1 };
  });
  const menuY = [...app.querySelectorAll('.bha-start__menu .bha-btn')].map((b) => Math.round(b.getBoundingClientRect().top));
  return { title: true, appBottom: Math.round(bottom), scroll: app.scrollHeight > app.clientHeight + 1, menuY, out: items.filter((x) => !x.inside || x.clipped), items };
});

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const srv = await startServer();
  const browser = await chromium.launch();
  const proof = { runs: [], errors: [] };
  try {
    for (const m of MODES) {
      const ctx = await browser.newContext(m.ctx);
      const page = await ctx.newPage();
      if (m.k !== 1) await page.addInitScript((k) => {
        const put = () => { const st = document.createElement('style'); st.textContent = `:root{${[['xs', 12], ['sm', 13], ['md', 14], ['lg', 16], ['xl', 18], ['2xl', 22], ['3xl', 28], ['4xl', 36], ['5xl', 48]].map(([n, v]) => `--bha-fs-${n}:${(v * k).toFixed(2)}px !important;`).join('')}}`; document.head.append(st); };
        if (document.head) put(); else document.addEventListener('DOMContentLoaded', put);
      }, m.k);
      page.on('pageerror', (e) => proof.errors.push(`${m.id}: ${e.message}`));
      const shot = (n) => page.screenshot({ path: path.join(OUT, `${m.id}-${n}.png`) });
      const notice = () => page.evaluate(async () => (await import('/src/pwa.ts')).showAutoRestartNoticeForTest());
      const r = { mode: m.id, faction: m.fi === 0 ? 'hollow' : 'shinigami' };
      proof.runs.push(r);
      await newGame(page, srv.url, m.fi);
      await page.waitForTimeout(1500);
      await page.goto(srv.url); await page.waitForTimeout(1200);
      r.plain = await look(page);
      await notice(); await page.waitForTimeout(200);
      r.restart = await look(page);
      await shot('1-auto-restart');
      // ③ 세이브 읽기 오류 경고 줄(app.ts titleScreen(note) 과 같은 문구) — 처음 화면을 note 와 함께 다시 그린다(세이브 있음 = 메뉴 4개)
      await page.goto(srv.url); await page.waitForTimeout(1200);
      await page.evaluate(async () => {
        const { startView } = await import('/src/ui/startView.ts');
        const { allSlotSummaries } = await import('/src/saveSlots.ts');
        const root = document.querySelector('.bha-lcd .bha-app').parentElement;
        const nop = () => {};
        startView(root, allSlotSummaries(localStorage), { onNew: nop, onContinue: nop, onImport: nop, onSettings: nop }, '슬롯 2의 세이브를 읽을 수 없다.');
      });
      await page.waitForTimeout(300);
      r.notePlain = await look(page);
      await notice(); await page.waitForTimeout(200);
      r.note = await look(page);
      await shot('2-note-auto-restart');
      // ④ 열 수 없는 세이브(옛 형식) 알림 + 자동 다시 시작
      await page.evaluate((k) => { localStorage.setItem(`${k}.slot2`, JSON.stringify({ meta: { format: 10 } })); }, SAVE_KEY);
      await page.goto(srv.url); await page.waitForTimeout(1200);
      r.stalePlain = await look(page);
      await notice(); await page.waitForTimeout(200);
      r.stale = await look(page);
      await shot('3-stale-auto-restart');
      await ctx.close();
    }
  } finally {
    await browser.close();
    srv.stop();
  }
  for (const r of proof.runs) {
    r.ok = ['plain', 'restart', 'note', 'stale'].every((k) => r[k]?.title && r[k].out.length === 0)
      && JSON.stringify(r.plain.menuY) === JSON.stringify(r.restart.menuY)
      && JSON.stringify(r.notePlain.menuY) === JSON.stringify(r.note.menuY)
      && JSON.stringify(r.stalePlain.menuY) === JSON.stringify(r.stale.menuY);
  }
  fs.writeFileSync(path.join(OUT, 'proof.json'), JSON.stringify(proof, null, 1));
  for (const r of proof.runs) console.log(r.mode, r.faction, r.ok ? 'OK' : 'NG', JSON.stringify({ restart: r.restart.out, note: r.note.out, stale: r.stale.out, menu: [r.plain.menuY, r.restart.menuY, r.notePlain.menuY, r.note.menuY, r.stalePlain.menuY, r.stale.menuY] }));
  console.log('errors', proof.errors.length);
})();
