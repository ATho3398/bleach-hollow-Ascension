// C.325 proof (GDD 199장, 코딩233): 로그인 보강 화면 — ① 처음 로그인 창 ② 게스트 상태의 설정 > 기타 로그인 줄([계정 연동]·[로그아웃]) ③ 계정 연동 거절 안내
// ④ '다른 기기에서 로그인했다' 막기 창 → [다시 이 기기에서 하기]로 닫힘. 실제 Firebase 는 자동 점검에서 못 써 dev 서버의 가짜 클라우드(`?cloudfake`, src/cloudFake.ts)로 흉내 낸다.
// 다른 기기 차지는 같은 컨텍스트의 두 번째 탭이 localStorage 를 써서(storage 이벤트) 흉내 낸다. 동기화·막힘 논리는 tests/c325.test.ts 가 가짜 Firebase 로 검사.
// 조건: pc = 844×390 마우스 / ph = 796×384 터치. 캡처 1배 docs/captures/c325/. 실행: node scripts/c325-proof.cjs (C325_URL=<주소>)
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
if (process.env.C325_URL) process.env.C276_URL = process.env.C325_URL;
const { startServer, newGame } = require('./c276-proof.cjs');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'docs/captures/c325');
const MODES = [
  { id: 'pc', fi: 0, ctx: { viewport: { width: 844, height: 390 }, deviceScaleFactor: 1 } },
  { id: 'ph', fi: 1, ctx: { viewport: { width: 796, height: 384 }, deviceScaleFactor: 1, hasTouch: true, isMobile: true } },
];

async function openSettingsEtc(page) {
  await page.getByRole('button', { name: '설정' }).first().click();
  await page.waitForTimeout(400);
  await page.locator('.bha-tab[data-tab="etc"]').click();
  await page.waitForTimeout(300);
}

/** 겹친 층 안 창의 요약: 제목·본문·버튼·문구·창이 LCD 안에 있는가 */
const dialog = (page, sel) => page.evaluate((sel) => {
  const layer = document.querySelector(sel);
  const d = layer?.querySelector('.bha-modal');
  if (!d) return null;
  const r = d.getBoundingClientRect();
  const lcd = document.querySelector('.bha-lcd').getBoundingClientRect();
  const inside = (q) => q.left >= lcd.left - 1 && q.right <= lcd.right + 1 && q.top >= lcd.top - 1 && q.bottom <= lcd.bottom + 1;
  return {
    title: d.querySelector('.bha-modal__title')?.textContent.trim() ?? '',
    body: d.querySelector('.bha-modal__body')?.textContent.trim() ?? '',
    rows: [...d.querySelectorAll('.bha-info__row')].map((x) => `${x.querySelector('dt').textContent.trim()}: ${x.querySelector('dd').textContent.trim()}`),
    buttons: [...d.querySelectorAll('.bha-modal__actions .bha-btn')].map((b) => ({ label: b.textContent.trim(), inside: inside(b.getBoundingClientRect()), lines: Math.round(b.getBoundingClientRect().height) })),
    status: d.querySelector('.bha-cloud-email__status')?.textContent.trim() ?? '',
    focused: document.activeElement?.textContent?.trim() ?? null,
    inside: inside(r),
  };
}, sel);

const loginRow = (page) => page.evaluate(() => {
  const b = document.querySelector('[data-set="cloud-login"]');
  const e = document.querySelector('[data-set="cloud-email"]');
  if (!b) return null;
  const row = b.closest('.bha-setrow');
  const hint = row?.querySelector('.bha-settings__hint');
  const r = b.getBoundingClientRect();
  const lcd = document.querySelector('.bha-lcd').getBoundingClientRect();
  return {
    label: b.textContent.trim(), second: e ? e.textContent.trim() : null, secondHidden: e ? getComputedStyle(e).visibility === 'hidden' : null,
    x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height),
    hint: hint ? hint.textContent.trim() : '', inside: r.left >= lcd.left && r.right <= lcd.right && r.top >= lcd.top && r.bottom <= lcd.bottom,
  };
});

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const srv = await startServer();
  const fakeUrl = `${srv.url}?cloudfake`;
  const browser = await chromium.launch();
  const proof = { runs: [], errors: [] };
  try {
    for (const m of MODES) {
      const ctx = await browser.newContext(m.ctx);
      const page = await ctx.newPage();
      page.on('pageerror', (e) => proof.errors.push(`${m.id}: ${e.message}`));
      const shot = (n) => page.screenshot({ path: path.join(OUT, `${m.id}-${n}.png`) });
      const r = { mode: m.id, faction: m.fi === 0 ? 'hollow' : 'shinigami' };
      proof.runs.push(r);
      // 기기 세이브 하나(슬롯 1) 만들고 (dev 서버 — 가짜 없이 켜면 처음 로그인 창은 안 뜬다) 처음 로그인 창 전 상태로
      await newGame(page, srv.url, m.fi);
      await page.waitForTimeout(1500);
      // ① 처음 로그인 창 (로그인 기억 없음·고른 적 없음·온라인)
      await page.evaluate(() => { localStorage.removeItem('bha-cloud'); localStorage.removeItem('bha-cloud-gate'); localStorage.removeItem('bha-cloud-fake'); localStorage.removeItem('bha-cloud-sync'); });
      await page.goto(fakeUrl); await page.waitForTimeout(1200);
      r.gate = await dialog(page, '.bha-cloud-gate');
      r.gateBehindTitle = await page.evaluate(() => !!document.querySelector('.bha-start--title'));
      await shot('1-login-gate');
      // ② [게스트로 시작] → 창 닫힘·기억 → 설정 > 기타 로그인 줄 = [계정 연동]·[로그아웃] + 게스트 설명
      await page.locator('[data-set="gate-guest"]').click();
      await page.waitForTimeout(1200);
      r.afterGuest = await page.evaluate(() => {
        const fake = JSON.parse(localStorage.getItem('bha-cloud-fake') ?? 'null');
        if (fake?.doc) fake.doc = { ...fake.doc, text: `(${fake.doc.text.length}자)` }; // 세이브 원문은 proof 에 넣지 않는다
        return { gateOpen: !!document.querySelector('.bha-cloud-gate'), gateDone: localStorage.getItem('bha-cloud-gate') !== null, pref: JSON.parse(localStorage.getItem('bha-cloud') ?? 'null'), fake };
      });
      await openSettingsEtc(page);
      await page.evaluate(() => { document.querySelector('[data-set="cloud-login"]')?.scrollIntoView({ block: 'center' }); });
      await page.waitForTimeout(300);
      r.guestRow = await loginRow(page);
      await shot('2-settings-guest');
      // ③ [계정 연동] → 고르기 → [이메일] → taken@ 로 연동 → 거절 안내 창
      await page.locator('[data-set="cloud-login"]').click();
      await page.waitForTimeout(400);
      r.linkPicker = await dialog(page, '.bha-confirm');
      await page.getByRole('button', { name: '이메일', exact: true }).click();
      await page.waitForTimeout(400);
      r.linkEmailDialog = await dialog(page, '.bha-cloud-email');
      await page.locator('.bha-cloud-email input[name="email"]').fill('taken@example.com');
      await page.locator('.bha-cloud-email input[name="password"]').fill('secret1');
      await page.locator('[data-set="cloud-email-link"]').click();
      await page.waitForTimeout(700);
      r.refused = await dialog(page, '.bha-confirm');
      await shot('3-link-refused');
      await page.locator('.bha-confirm .bha-modal__actions .bha-btn', { hasText: '취소' }).last().click();
      await page.waitForTimeout(300);
      r.stillGuest = await page.evaluate(() => JSON.parse(localStorage.getItem('bha-cloud') ?? 'null')?.anonymous === true);
      // ④ 다른 기기가 차지 — 두 번째 탭이 가짜 상태(active)에 다른 기기를 쓰면 storage 이벤트로 이 탭이 막힌다 (설정 화면 = 안 잠긴 화면 → 저장 후 처음 화면 + 막기 창)
      const other = await ctx.newPage();
      await other.goto(`${srv.url}?cloudfake&other`); // 같은 origin 이면 어떤 경로든 된다 — 이 탭은 로그인 기억이 있어 SDK(가짜)를 받고 차지한다
      await other.waitForTimeout(1500);
      await other.evaluate(() => {
        const s = JSON.parse(localStorage.getItem('bha-cloud-fake') ?? '{}');
        s.active = { device: 'other-device', at: Date.now(), name: 'Android Chrome · 앱', build: 'other' };
        localStorage.setItem('bha-cloud-fake', JSON.stringify(s));
      });
      await page.waitForTimeout(900);
      r.blocked = await dialog(page, '.bha-cloud-blocked');
      r.blockedBehind = await page.evaluate(() => ({ title: !!document.querySelector('.bha-start--title'), flag: sessionStorage.getItem('bha-cloud-blocked') !== null }));
      await shot('4-other-device');
      // 뒤로(취소 버튼)는 아무 일도 안 한다 → 창 그대로
      await page.locator('.bha-dev__btn[aria-label="취소"]').first().click({ timeout: 2000 }).catch(() => {});
      await page.waitForTimeout(300);
      r.blockedAfterBack = !!(await dialog(page, '.bha-cloud-blocked'));
      // [다시 이 기기에서 하기] → 차지 → 창 닫힘, 가짜 active = 이 기기
      await page.locator('[data-set="blocked-retake"]').click();
      await page.waitForTimeout(1200);
      r.afterRetake = await page.evaluate(() => ({ open: !!document.querySelector('.bha-cloud-blocked'), active: JSON.parse(localStorage.getItem('bha-cloud-fake') ?? '{}').active, mine: localStorage.getItem('bha-cloud-device'), flag: sessionStorage.getItem('bha-cloud-blocked'), toast: document.querySelector('.bha-toast')?.textContent?.trim() ?? null }));
      await other.close();
      await ctx.close();
    }
  } finally {
    await browser.close();
    srv.stop();
  }
  for (const r of proof.runs) {
    const gateOk = r.gate?.inside && r.gate.buttons.map((b) => b.label).join(',') === 'Google 로그인,이메일 로그인,게스트로 시작' && r.gate.buttons.every((b) => b.inside) && r.gateBehindTitle;
    const guestOk = r.afterGuest?.gateOpen === false && r.afterGuest.gateDone && r.afterGuest.pref?.anonymous === true && r.afterGuest.fake?.doc
      && r.guestRow?.label === '계정 연동' && r.guestRow.second === '로그아웃' && r.guestRow.secondHidden === false && r.guestRow.hint.includes('게스트로 로그인했다') && r.guestRow.inside;
    const linkOk = r.linkPicker?.title === '계정 연동' && r.linkEmailDialog?.title === '이메일 연동' && r.linkEmailDialog.buttons.map((b) => b.label).join(',') === '취소,연동'
      && r.refused?.title === '이 계정에는 이미 세이브가 있다' && r.refused.buttons.map((b) => b.label).join(',') === '취소,그 계정으로 로그인' && r.refused.inside && r.stillGuest;
    const blockOk = r.blocked?.title === '다른 기기에서 로그인했다' && r.blocked.inside && r.blocked.buttons.map((b) => b.label).join(',') === '로그아웃,다시 이 기기에서 하기' && r.blocked.rows.some((x) => x.includes('Android Chrome'))
      && r.blockedBehind?.title && r.blockedBehind.flag && r.blockedAfterBack && r.afterRetake?.open === false && r.afterRetake.active?.device === r.afterRetake.mine && r.afterRetake.flag === null;
    r.ok = !!(gateOk && guestOk && linkOk && blockOk);
    r.checks = { gateOk: !!gateOk, guestOk: !!guestOk, linkOk: !!linkOk, blockOk: !!blockOk };
  }
  fs.writeFileSync(path.join(OUT, 'proof.json'), JSON.stringify(proof, null, 1));
  for (const r of proof.runs) console.log(r.mode, r.ok ? 'OK' : 'NG', JSON.stringify(r.checks), JSON.stringify({ gate: r.gate, afterGuest: r.afterGuest, guestRow: r.guestRow, refused: r.refused, blocked: r.blocked, afterRetake: r.afterRetake }));
  console.log('errors', proof.errors.length, proof.errors.slice(0, 3));
})();
