// C.326 proof (GDD 199장 6~8, 코딩234): 이름 정하기 → 성별 정하기 · 설정 [이름·성별 바꾸기] · 옛 세이브 한 번 창 · 방 이름표.
// 모드: pc = 844×390 마우스 / ph = 796×384 터치 / ph115 = ph + 글자 1.15배. 두 종족씩.
// 점검: 입력 칸·[다음] 이 화면 위 45% 안(가상 키보드가 아래를 덮어도 보임) · 주 버튼 자리 두 화면 같음 · 안내 줄 잘림 없음 · 판 밖 0 ·
//       규칙(공백·숫자·기호·길이) 안내 · 기기 버튼만으로 성별 고르기 · 방 이름표에 이름 · 설정에서 바꾼 값이 이름표에 · 옛 세이브(이름 없음) → 한 번 창(뒤로 없음).
// 캡처 1배 docs/captures/c326/ (10장). 실행: node scripts/c326-proof.cjs
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const { startServer, press } = require('./c276-proof.cjs');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'docs/captures/c326');
const MODES = [
  { id: 'pc', ctx: { viewport: { width: 844, height: 390 }, deviceScaleFactor: 1 } },
  { id: 'ph', ctx: { viewport: { width: 796, height: 384 }, deviceScaleFactor: 1, hasTouch: true, isMobile: true } },
  { id: 'ph115', scale: 1.15, ctx: { viewport: { width: 796, height: 384 }, deviceScaleFactor: 1, hasTouch: true, isMobile: true } },
];
const SHOTS = new Set(['pc-0-name-error', 'pc-0-gender', 'pc-0-room', 'pc-1-settings-etc', 'pc-1-edit-name', 'ph-1-name-error', 'ph-1-gender', 'ph-1-room', 'ph115-0-name-long', 'ph115-0-room']);

/** 지금 이름·성별 화면 점검: 판 밖·잘림·주 버튼 자리·위 45% */
const look = (page) => page.evaluate(() => {
  const R = (e) => e.getBoundingClientRect();
  const app = document.querySelector('.bha-lcd .bha-app.bha-ident');
  if (!app) return null;
  const ar = R(app);
  const issues = [];
  for (const e of app.querySelectorAll('.bha-lcdpage__head *, .bha-ident__body *, .bha-ident__foot *')) {
    const r = R(e);
    if (r.width < 1 || r.height < 1) continue;
    if (r.left < ar.left - 1 || r.right > ar.right + 1 || r.top < ar.top - 1 || r.bottom > ar.bottom + 1) issues.push(`판 밖: ${e.className || e.tagName} ${(e.textContent || '').trim().slice(0, 20)}`);
  }
  for (const e of app.querySelectorAll('.bha-ident__msg, .bha-ident__rule, .bha-ident__later, .bha-lcdpage__title, .bha-lcdpage__sub')) {
    if (e.scrollWidth > e.clientWidth + 1) issues.push(`잘림: ${e.className} ${(e.textContent || '').trim()}`);
  }
  const main = app.querySelector('.bha-ident__main');
  const input = app.querySelector('[data-ident="name"]');
  const mr = main ? R(main) : null;
  const ir = input ? R(input.parentElement) : null;
  const h = window.innerHeight;
  return {
    screen: app.classList.contains('bha-ident--name') ? 'name' : 'gender',
    title: app.querySelector('.bha-lcdpage__title')?.textContent,
    sub: app.querySelector('.bha-lcdpage__sub')?.textContent,
    msg: app.querySelector('.bha-ident__msg')?.textContent,
    msgBad: !!app.querySelector('.bha-ident__msg.is-bad'),
    count: app.querySelector('.bha-ident__count')?.textContent ?? null,
    mainDisabled: main?.disabled ?? null,
    main: mr && { x: Math.round(mr.left), y: Math.round(mr.top), w: Math.round(mr.width), h: Math.round(mr.height) },
    // 가상 키보드(가로 폰에서 화면 아래 약 55%)가 덮어도 보이는가: 입력 칸·주 버튼 아래 끝이 화면 위 45% 안
    topSafe: Math.max(mr?.bottom ?? 0, ir?.bottom ?? 0) <= h * 0.45,
    bottomPx: Math.round(Math.max(mr?.bottom ?? 0, ir?.bottom ?? 0)),
    viewH: h,
    back: app.querySelector('[data-ident="back"]')?.disabled ?? null,
    issues,
  };
});

const nameTag = (page) => page.evaluate(() => {
  const t = document.querySelector('.bha-room__name, .bha-spa .bha-room__name');
  if (!t) return null;
  const r = t.getBoundingClientRect();
  const scene = document.querySelector('.bha-lcd .bha-app')?.getBoundingClientRect();
  const form = t.querySelector('.bha-room__nameform');
  return {
    text: t.textContent, own: t.querySelector('.bha-room__nameown')?.textContent ?? null,
    inside: !!scene && r.left >= scene.left - 1 && r.right <= scene.right + 1 && r.top >= scene.top - 1,
    formCut: form ? form.scrollWidth > form.clientWidth + 1 : null,
    w: Math.round(r.width),
  };
});

async function typeName(page, s) {
  const i = page.locator('[data-ident="name"]');
  await i.fill('');
  await i.pressSequentially(s, { delay: 10 });
  await page.waitForTimeout(120);
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const srv = await startServer();
  const browser = await chromium.launch();
  const proof = { runs: [], errors: [], shots: [] };
  const shot = async (page, name) => {
    if (!SHOTS.has(name)) return;
    await page.screenshot({ path: path.join(OUT, `${name}.png`) });
    proof.shots.push(`${name}.png`);
  };
  try {
    for (const m of MODES) {
      for (const fi of [0, 1]) {
        const ctx = await browser.newContext(m.ctx);
        const page = await ctx.newPage();
        if (m.scale) await page.addInitScript((k) => {
          const put = () => {
            const st = document.createElement('style');
            st.textContent = `:root{${[['xs', 12], ['sm', 13], ['md', 14], ['lg', 16], ['xl', 18], ['2xl', 22], ['3xl', 28], ['4xl', 36], ['5xl', 48]].map(([n, v]) => `--bha-fs-${n}:${(v * k).toFixed(2)}px !important;`).join('')}}`;
            document.head.append(st);
          };
          if (document.head) put(); else document.addEventListener('DOMContentLoaded', put);
        }, m.scale);
        page.on('pageerror', (e) => proof.errors.push(`${m.id}-${fi}: ${e.message}`));
        const tag = `${m.id}-${fi}`;
        const run = { mode: m.id, faction: fi === 0 ? 'hollow' : 'shinigami', name: {}, gender: {}, flow: {}, issues: [] };
        proof.runs.push(run);
        // ── 새 게임: 종족 → 이름 ──
        await page.goto(srv.url);
        await page.evaluate(() => localStorage.clear());
        await page.goto(srv.url);
        await page.waitForTimeout(1200);
        await page.getByRole('button', { name: '새로 시작' }).click();
        await page.waitForTimeout(300);
        await page.locator('.bha-slot').first().click();
        await page.getByRole('button', { name: '확인' }).click();
        await page.waitForTimeout(300);
        await page.locator('.bha-species__card').nth(fi).click();
        await page.waitForTimeout(300);
        await page.getByRole('button', { name: '시작', exact: true }).click();
        await page.waitForTimeout(400);
        run.name.open = await look(page);
        // 규칙 안내 (입력 중 바로)
        const cases = { space: '권 영', digit: '권1', symbol: '권!', hanLong: '가나다라마바사아', latLong: 'Abcdefghijklm', mixLong: '가나다라마바Abc', ok: '권Kwon' };
        for (const [k, v] of Object.entries(cases)) {
          await typeName(page, v);
          const l = await look(page);
          run.name[k] = { msg: l.msg, bad: l.msgBad, count: l.count, nextDisabled: l.mainDisabled };
          if (k === 'space') await shot(page, `${tag}-name-error`);
          if (k === 'hanLong') await shot(page, `${tag}-name-long`);
        }
        const nameLook = await look(page);
        run.issues.push(...nameLook.issues);
        // [이전] → 종족 고르기, 다시 [시작] → 이름 칸에 친 이름이 남아 있나는 보지 않는다(새로 정함). 여기서는 바로 진행
        const finalName = fi === 0 ? '권영' : 'Rukia';
        await typeName(page, finalName);
        // Enter = [다음]
        await page.locator('[data-ident="name"]').press('Enter');
        await page.waitForTimeout(300);
        const g = await look(page);
        run.gender.open = g;
        run.issues.push(...g.issues);
        run.flow.mainSameSpot = !!(nameLook.main && g.main && nameLook.main.x === g.main.x && nameLook.main.y === g.main.y && nameLook.main.w === g.main.w);
        await shot(page, `${tag}-gender`);
        // ◀(기기 뒤로) = 이름 단계로, 이름 남아 있음
        await press(page, 'back', 300);
        run.flow.backToName = await page.evaluate(() => ({ screen: !!document.querySelector('.bha-ident--name'), value: document.querySelector('[data-ident="name"]')?.value }));
        await page.locator('[data-ident="next"]').click();
        await page.waitForTimeout(300);
        // 기기 버튼만으로 성별: ▼ 로 '여성' 칸까지 → ✓ → ▼ 로 [시작] → ✓
        const selText = () => page.evaluate(() => document.querySelector('.bha-sel')?.textContent?.trim() ?? '');
        let steps = 0;
        for (; steps < 8 && !(await selText()).includes('여성'); steps++) await press(page, 'down');
        await press(page, 'ok');
        run.flow.deviceFemale = await page.evaluate(() => document.querySelector('.bha-ident__gender[data-gender="female"]')?.classList.contains('is-on'));
        for (let i = 0; i < 8 && !/^(시작)$/.test(await selText()); i++) await press(page, 'down');
        run.flow.deviceStartSel = await selText();
        await press(page, 'ok', 2500);
        // ── 방 이름표 ──
        await page.waitForTimeout(1500);
        // 첫 방 탄생 연출·안내 카드는 그대로 둔 채 이름표만 본다
        run.flow.roomTag = await nameTag(page);
        await shot(page, `${tag}-room`);
        // 저장된 값
        run.flow.saved = await page.evaluate(async () => {
          const g = await import('/src/game.ts');
          const s = g.loadSave(localStorage, 'bleach-hollow-ascension.save');
          return s && { name: s.name, gender: s.gender, ids: s.slotLog.identities.map((r) => r.source) };
        });
        // ── 설정 > 기타 [이름·성별 바꾸기] (튜토리얼 없이 보려고 안내를 본 것으로 저장 후 다시 열기) ──
        await page.evaluate(async () => {
          const g = await import('/src/game.ts');
          const s = g.loadSave(localStorage, 'bleach-hollow-ascension.save');
          s.help.tutorialSeen = true;
          for (const id of ['first-run', 'first-run-room', 'tile-intro', 'tile-plan', 'tile-draw', 'birth', 'recover', 'home-intro', 'recover-cure']) s.help.guides[id] = 'done';
          g.writeSave(localStorage, s, 'bleach-hollow-ascension.save');
        });
        await page.goto(srv.url);
        await page.waitForTimeout(1200);
        await page.getByRole('button', { name: '이어하기' }).click().catch(() => {});
        await page.waitForTimeout(1800);
        run.flow.roomTagAgain = await nameTag(page);
        await page.getByRole('button', { name: '더보기' }).first().click().catch(() => {});
        await page.waitForTimeout(300);
        await page.locator('.bha-homedock__tray').getByRole('button', { name: '설정' }).first().click().catch((e) => run.issues.push(`설정 못 엶 ${e.message.split('\n')[0]}`));
        await page.waitForTimeout(400);
        await page.locator('.bha-tab[data-tab="etc"]').click().catch(() => {});
        await page.waitForTimeout(300);
        const idBtn = page.locator('[data-set="identity"]');
        await idBtn.scrollIntoViewIfNeeded().catch(() => {});
        run.flow.settingsRow = await page.evaluate(() => {
          const b = document.querySelector('[data-set="identity"]');
          const row = b?.closest('.bha-setrow');
          return b ? { label: b.textContent, hint: row?.textContent?.replace(b.textContent, '').trim() } : null;
        });
        await shot(page, `${tag}-settings-etc`);
        await idBtn.click().catch((e) => run.issues.push(`바꾸기 버튼 ${e.message.split('\n')[0]}`));
        await page.waitForTimeout(300);
        const ed = await look(page);
        run.flow.edit = { title: ed?.title, value: await page.locator('[data-ident="name"]').inputValue().catch(() => null), back: ed?.back };
        run.issues.push(...(ed?.issues ?? []));
        await typeName(page, fi === 0 ? 'Kwon' : '루키아');
        await shot(page, `${tag}-edit-name`);
        await page.locator('[data-ident="next"]').click();
        await page.waitForTimeout(300);
        await page.locator('.bha-ident__gender[data-gender="male"]').click();
        await page.locator('[data-ident="done"]').click();
        await page.waitForTimeout(500);
        run.flow.afterEdit = await page.evaluate(() => ({
          settings: !!document.querySelector('.bha-settings__grid'),
          hint: document.querySelector('[data-set="identity"]')?.closest('.bha-setrow')?.textContent ?? null,
        }));
        // ── 옛 세이브(이름 없음): 이어하기 → 한 번 창(뒤로 없음) → 방 ──
        await page.evaluate(async () => {
          const g = await import('/src/game.ts');
          const s = g.loadSave(localStorage, 'bleach-hollow-ascension.save');
          s.name = null;
          g.writeSave(localStorage, s, 'bleach-hollow-ascension.save');
        });
        await page.goto(srv.url);
        await page.waitForTimeout(1200);
        await page.getByRole('button', { name: '이어하기' }).click().catch(() => {});
        await page.waitForTimeout(800);
        const old = await look(page);
        await press(page, 'back', 300);
        run.flow.old = { screen: old?.screen, title: old?.title, backDisabled: old?.back, stillAfterBack: !!(await page.$('.bha-ident--name')) };
        await typeName(page, '이치고');
        await page.locator('[data-ident="next"]').click();
        await page.waitForTimeout(300);
        run.flow.old.genderPre = await page.evaluate(() => document.querySelector('.bha-ident__gender.is-on')?.dataset.gender ?? null);
        await page.locator('[data-ident="done"]').click();
        await page.waitForTimeout(1800);
        run.flow.old.roomTag = await nameTag(page);
        run.flow.old.saved = await page.evaluate(async () => {
          const g = await import('/src/game.ts');
          const s = g.loadSave(localStorage, 'bleach-hollow-ascension.save');
          return s && { name: s.name, ids: s.slotLog.identities.map((r) => r.source) };
        });
        await ctx.close();
      }
    }
  } catch (e) {
    proof.errors.push(String(e && e.stack || e));
  } finally {
    await browser.close();
    srv.stop();
  }
  fs.writeFileSync(path.join(OUT, 'proof.json'), JSON.stringify(proof, null, 1));
  const bad = proof.runs.flatMap((r) => [
    ...r.issues.map((i) => `${r.mode}/${r.faction}: ${i}`),
    ...(r.name.open?.topSafe ? [] : [`${r.mode}/${r.faction}: 이름 칸이 위 45% 밖 (${r.name.open?.bottomPx}/${r.name.open?.viewH})`]),
    ...(r.flow.mainSameSpot ? [] : [`${r.mode}/${r.faction}: 주 버튼 자리 다름`]),
    ...(r.flow.deviceFemale ? [] : [`${r.mode}/${r.faction}: 기기 버튼으로 성별 못 고름`]),
    ...(r.flow.roomTag?.own ? [] : [`${r.mode}/${r.faction}: 방 이름표에 이름 없음`]),
    ...((r.flow.afterEdit?.hint ?? '').includes(r.faction === 'hollow' ? 'Kwon' : '루키아') ? [] : [`${r.mode}/${r.faction}: 바꾼 뒤 설정 기타 탭 값`]),
    ...(r.flow.old?.stillAfterBack && r.flow.old?.roomTag?.own === '이치고' ? [] : [`${r.mode}/${r.faction}: 옛 세이브 흐름`]),
  ]);
  console.log(JSON.stringify({ errors: proof.errors, bad, shots: proof.shots.length }, null, 1));
})();
