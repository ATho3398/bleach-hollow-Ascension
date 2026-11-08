// C.323 proof (GDD 196장, 코딩231): 로그인·클라우드 세이브 화면 — 설정 > 기타 '로그인' 줄(로그인 전·후, 버튼 자리 같음 173장 2) · [이 기기 / 클라우드] 고르기 창.
// 실제 Google 로그인은 자동 점검에서 할 수 없어 dev 서버의 가짜 클라우드(`?cloudfake`, src/cloudFake.ts)로 흉내 낸다. 세이브·동기화 논리는 tests/c323.test.ts 가 가짜 Firebase 로 검사.
// 조건: pc = 844×390 마우스 / ph = 796×384 터치. 캡처 1배 docs/captures/c323/. 실행: node scripts/c323-proof.cjs (C323_URL=<주소>)
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
if (process.env.C323_URL) process.env.C276_URL = process.env.C323_URL;
const { startServer, newGame } = require('./c276-proof.cjs');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'docs/captures/c323');
const MODES = [
  { id: 'pc', fi: 0, ctx: { viewport: { width: 844, height: 390 }, deviceScaleFactor: 1 } },
  { id: 'ph', fi: 1, ctx: { viewport: { width: 796, height: 384 }, deviceScaleFactor: 1, hasTouch: true, isMobile: true } },
];
const FAKE_USER = { uid: 'fake-uid', name: '테스트 사용자', email: 'tester@example.com' };

/** 설정 > 기타 열기 (처음 화면의 [설정]) */
async function openSettingsEtc(page) {
  await page.getByRole('button', { name: '설정' }).first().click();
  await page.waitForTimeout(400);
  await page.locator('.bha-tab[data-tab="etc"]').click();
  await page.waitForTimeout(300);
}

const loginRow = (page) => page.evaluate(() => {
  const b = document.querySelector('[data-set="cloud-login"]');
  if (!b) return null;
  const row = b.closest('.bha-setrow');
  const hint = row?.querySelector('.bha-settings__hint');
  const r = b.getBoundingClientRect();
  const lcd = document.querySelector('.bha-lcd').getBoundingClientRect();
  return {
    label: b.textContent.trim(), disabled: b.disabled, x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height), rx: Math.round(r.left - row.getBoundingClientRect().left), ry: Math.round(r.top - row.getBoundingClientRect().top),
    hint: hint ? hint.textContent.trim() : '', inside: r.left >= lcd.left && r.right <= lcd.right && r.top >= lcd.top && r.bottom <= lcd.bottom,
  };
});

const dialog = (page) => page.evaluate(() => {
  const d = document.querySelector('.bha-confirm .bha-modal');
  if (!d) return null;
  const r = d.getBoundingClientRect();
  const lcd = document.querySelector('.bha-lcd').getBoundingClientRect();
  return {
    title: d.querySelector('.bha-modal__title')?.textContent.trim(), body: d.querySelector('.bha-modal__body')?.textContent.trim(),
    rows: [...d.querySelectorAll('.bha-info__row')].map((x) => `${x.querySelector('dt').textContent.trim()}: ${x.querySelector('dd').textContent.trim()}`),
    buttons: [...d.querySelectorAll('.bha-modal__actions .bha-btn')].map((b) => b.textContent.trim()),
    focused: document.activeElement?.textContent?.trim() ?? null,
    inside: r.left >= lcd.left && r.right <= lcd.right && r.top >= lcd.top && r.bottom <= lcd.bottom,
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
      // 기기 세이브 하나(슬롯 1) 만들고 처음 화면으로
      await newGame(page, srv.url, m.fi);
      await page.waitForTimeout(1500);
      // ① 로그인 전: 설정 > 기타 '로그인' 줄
      await page.goto(fakeUrl); await page.waitForTimeout(1200);
      await openSettingsEtc(page);
      r.before = await loginRow(page);
      await shot('1-settings-logged-out');
      // ② [Google 로그인] 누름(가짜) → 로그인 뒤 같은 줄 (클라우드가 비어 기기 세이브를 올린다)
      await page.locator('[data-set="cloud-login"]').click();
      await page.waitForTimeout(1500);
      r.after = await loginRow(page);
      r.fake = await page.evaluate(() => JSON.parse(localStorage.getItem('bha-cloud-fake') ?? 'null'));
      await shot('2-settings-logged-in');
      // ②-b 이메일 로그인 창 (196장 결정 7): 로그아웃 뒤 [이메일 로그인] → 칸 둘·[취소][가입][로그인]·[비밀번호 잊음], 틀린 비밀번호 문구가 창 안에 남는다
      await page.locator('[data-set="cloud-login"]').click();
      await page.waitForTimeout(300);
      await page.getByRole('button', { name: '로그아웃', exact: true }).last().click();
      await page.waitForTimeout(600);
      r.afterLogout = await loginRow(page);
      await page.locator('[data-set="cloud-email"]').click();
      await page.waitForTimeout(400);
      await page.locator('.bha-cloud-email input[name="email"]').fill('tester@example.com');
      await page.locator('.bha-cloud-email input[name="password"]').fill('wrongpw');
      await page.locator('[data-set="cloud-email-login"]').click();
      await page.waitForTimeout(600);
      r.emailDialog = await page.evaluate(() => {
        const d = document.querySelector('.bha-cloud-email .bha-modal');
        if (!d) return null;
        const lcd = document.querySelector('.bha-cloud-email').getBoundingClientRect(); // 창 = 겹친 층 안(LCD 크기)
        const inside = (e) => { const q = e.getBoundingClientRect(); return q.left >= lcd.left && q.right <= lcd.right && q.top >= lcd.top && q.bottom <= lcd.bottom; };
        return {
          inputs: [...d.querySelectorAll('input')].map((i) => ({ name: i.name, inside: inside(i) })),
          buttons: [...d.querySelectorAll('.bha-btn')].map((b) => b.textContent.trim()),
          status: d.querySelector('.bha-cloud-email__status')?.textContent.trim() ?? '',
          inside: inside(d),
        };
      });
      await shot('2b-email-login-dialog');
      await page.locator('.bha-cloud-email input[name="password"]').fill('secret1');
      await page.locator('[data-set="cloud-email-login"]').click();
      await page.waitForTimeout(900);
      r.afterEmail = await loginRow(page);
      // ③ 다른 기기의 세이브(다른 종족·더 최근)가 클라우드에 있고 이 기기 슬롯 1 도 플레이했다 → 켤 때 고르기 창
      await page.evaluate(async ({ user, other }) => {
        const { newSaveData } = await import('/src/game.ts');
        const { makeCloudDoc } = await import('/src/cloudSave.ts');
        const { touchSlot } = await import('/src/saveSlots.ts');
        const theirs = newSaveData(other, Date.now() - 5000);
        const doc = makeCloudDoc(theirs, { slot: 1, device: 'other-device', build: 'other', base: null, nowMs: Date.now() + 60_000 });
        localStorage.setItem('bha-cloud-fake', JSON.stringify({ user, doc }));
        localStorage.setItem('bha-cloud', JSON.stringify(user));
        localStorage.removeItem('bha-cloud-sync');
        touchSlot(localStorage, 1, Date.now());
      }, { user: FAKE_USER, other: m.fi === 0 ? 'shinigami' : 'hollow' });
      await page.goto(fakeUrl); await page.waitForTimeout(1800);
      r.conflict = await dialog(page);
      await shot('3-conflict-pick');
      // [클라우드] 고르면 슬롯 1 이 바뀌고 기기 것은 백업으로
      await page.getByRole('button', { name: '클라우드', exact: true }).click();
      await page.waitForTimeout(800);
      r.afterPick = await page.evaluate(async () => {
        const { loadSave } = await import('/src/game.ts');
        const { slotKey, slotBackupKey, readBackupMeta } = await import('/src/saveSlots.ts');
        return { slot1: loadSave(localStorage, slotKey(1))?.factionId ?? null, backup: loadSave(localStorage, slotBackupKey(1))?.factionId ?? null, reason: readBackupMeta(localStorage, 1)?.reason ?? null, toast: document.querySelector('.bha-toast')?.textContent?.trim() ?? null };
      });
      await ctx.close();
    }
  } finally {
    await browser.close();
    srv.stop();
  }
  for (const r of proof.runs) {
    const same = r.before && r.after && r.before.x === r.after.x && r.before.y === r.after.y && r.before.w === r.after.w && r.before.h === r.after.h;
    const emailOk = r.emailDialog?.inside && r.emailDialog.inputs.every((i) => i.inside) && r.emailDialog.status.includes('맞지 않다') && r.emailDialog.buttons.join(',') === '비밀번호 잊음,취소,가입,로그인'
      && r.afterEmail?.label === '로그아웃' && r.afterEmail.hint.includes('tester@example.com') && r.afterEmail.rx === r.before.rx && r.afterEmail.ry === r.before.ry;
    r.ok = !!(r.before?.inside && r.after?.inside && same && r.before.label === 'Google 로그인' && r.after.label === '로그아웃' && r.after.hint.includes('로그인했다') && emailOk
      && r.fake?.doc && r.conflict?.inside && r.conflict.buttons.join(',') === '이 기기,클라우드' && r.afterPick?.reason === 'cloud' && r.afterPick.slot1 !== r.faction && r.afterPick.backup === r.faction);
  }
  fs.writeFileSync(path.join(OUT, 'proof.json'), JSON.stringify(proof, null, 1));
  for (const r of proof.runs) console.log(r.mode, r.ok ? 'OK' : 'NG', JSON.stringify({ before: r.before, after: r.after, email: r.emailDialog, afterEmail: r.afterEmail, conflict: r.conflict, afterPick: r.afterPick }));
  console.log('errors', proof.errors.length, proof.errors.slice(0, 3));
})();
