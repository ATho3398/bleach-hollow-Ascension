// C.498 proof (GDD 12-1·8-9·4-4 v6.130): ① 방 ··· 더보기 [캐릭터 변경] 한 칸 ② 캐릭터 카드 창(호로·사신·초월자) ③ 안 열린 종족 카드 ④ 훈련 인형 누른 직후 설정 창
// ⑤~⑧ 먹이 줄 일반 · [종류] 눌러 특식 · 보급(PC = 없음) · 가로로 넘긴 상태 (06~09 파일 — C.499, docs/captures/c499 로 옮겨 둠).
// PC 844×390 + 폰 796×384 터치 두 벌, 1배. 흐름 점검: 카드 눌러 전환 · 가로 넘김(휠·끌기·←→) · 훈련 인형 4단계 전/후 · 나가기 = 수련장.
// 실행: node scripts/c498-proof.cjs [저장 폴더]
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const { startServer } = require('./c276-proof.cjs');

const OUT = path.resolve(process.argv[2] || path.join(__dirname, '..', 'docs/captures/c498'));
const PC = { viewport: { width: 844, height: 390 }, deviceScaleFactor: 1 };
const PH = { viewport: { width: 796, height: 384 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const BTN = { ok: '확정', back: '취소' };
const press = async (page, b) => { await page.locator(`.bha-dev__btn[aria-label="${BTN[b]}"]`).first().click({ timeout: 2000 }).catch(() => {}); await wait(400); };

async function skipTut(page) {
  for (let t = 0; t < 40 && (await page.locator('.bha-tut').count()); t++) {
    const go = page.locator('.bha-tut button.bha-btn--primary:not([disabled]), .bha-tut button:has-text("다음"), .bha-tut button:has-text("확인"), .bha-tut button:has-text("닫기")').filter({ visible: true });
    if (await go.count()) await go.first().click({ timeout: 2000 }).catch(() => {});
    else await page.locator('.bha-lcd').first().click({ timeout: 2000 }).catch(() => {});
    await wait(400);
  }
}
async function closeNotes(page) {
  for (const b of ['닫기', '확인', '나중에']) { const x = page.getByRole('button', { name: b, exact: true }).filter({ visible: true }); if (await x.count()) await x.first().click({ timeout: 1500 }).catch(() => {}); }
  await wait(300);
}
/** 상태 주입 (다른 캡처 스크립트와 같은 newSaveData + writeSave): food = 먹이 개수, open2 = 두 번째 종족 열림, tr = 얻은 초월자 수(지금 캐릭터는 첫 종족으로 되돌림), tier = 진화 단계(그 단계 첫 일반 진화체) */
async function newGame(page, url, o = {}) {
  await page.goto(url);
  await wait(600);
  await page.evaluate(async (o) => {
    localStorage.clear();
    const g = await import('/src/game.ts');
    const T = await import('/src/engine/testMode.ts');
    const TR = await import('/src/data/transcendents/index.ts');
    const F = await import('/src/data/factions/index.ts');
    const EV = await import('/src/data/evolution/index.ts');
    const H = await import('/src/home.ts');
    const now = Date.now();
    const first = F.FACTIONS[0].id;
    const s = g.newSaveData(first, now);
    s.name = '권영'; s.help.tutorialSeen = true; s.lastSeenAt = now;
    for (const id of Object.keys(s.help.guides ?? {})) s.help.guides[id] = 'done';
    for (const id of ['first-run', 'first-run-room', 'birth', 'recover', 'home-intro', 'recover-cure', 'tile-intro', 'tile-plan', 'tile-draw', 'unlock-gear', 'unlock-pet', 'practice', 'practice-intro']) s.help.guides[id] = 'done';
    if (o.open2) s.otherTracks.push({ ...g.newTrack(F.FACTIONS[1].id, now, 1), parkedAt: now });
    if (o.tier) { const f = EV.FORM_TABLE.find((x) => x.tier === o.tier && !x.hidden); T.setForm(s, f.id); }
    for (const d of TR.TRANSCENDENTS.slice(0, o.tr ?? 0)) T.testGrantTranscendent(s, d.id, now);
    if (o.tr) g.switchTrack(s, first, now);
    for (const [id, n] of Object.entries(o.food ?? {})) H.grantFood(s, id, n);
    g.writeSave(localStorage, s);
  }, o);
  await page.goto(url);
  await wait(1200);
  await page.getByRole('button', { name: /이어하기/ }).first().click({ timeout: 5000 }).catch(() => {});
  await wait(3500);
  await skipTut(page);
  await closeNotes(page);
}
async function openMore(page) {
  await skipTut(page);
  await page.getByRole('button', { name: /더보기/ }).first().click({ timeout: 3000 });
  await wait(500);
}
async function openTest(page, tabName) {
  await openMore(page);
  await page.getByRole('button', { name: '테스트', exact: true }).first().click({ timeout: 3000 });
  await wait(700);
  await page.locator('.bha-test-page .bha-viewtitle, .bha-test-page [aria-haspopup]').first().click({ timeout: 2000 }).catch(() => {});
  await wait(300);
  await page.getByRole('option', { name: tabName }).or(page.getByRole('menuitemradio', { name: tabName })).or(page.getByRole('button', { name: tabName })).first().click({ timeout: 3000 });
  await wait(600);
}
async function toRoom(page) {
  for (let i = 0; i < 4 && !(await page.locator('.bha-room--home').count()); i++) await press(page, 'back');
  await wait(600);
  await skipTut(page);
}
/** 더보기 메뉴 칸 이름들 */
const moreLabels = (page) => page.evaluate(() => [...document.querySelectorAll('.bha-homedock__tray button')].filter((b) => b.offsetParent).map((b) => b.textContent.trim()));
const pickFacts = (page) => page.evaluate(() => {
  const strip = document.querySelector('.bha-charpick__strip');
  const cards = [...document.querySelectorAll('.bha-charpick__card')].map((c) => ({ key: c.dataset.char, name: c.querySelector('.bha-dexcard__name')?.textContent, sub: c.querySelector('.bha-charpick__sub')?.textContent, current: c.hasAttribute('data-current'), locked: c.classList.contains('is-locked'), art: !!c.querySelector('img'), w: Math.round(c.getBoundingClientRect().width) }));
  return { open: !!strip, title: document.querySelector('.bha-charpick .bha-itemmodal__name')?.textContent ?? null, x: !!document.querySelector('.bha-charpick .bha-itemmodal__close'), cards, overflow: strip ? strip.scrollWidth > strip.clientWidth : null, scrollLeft: strip?.scrollLeft ?? null, focus: document.activeElement?.dataset?.char ?? document.activeElement?.className ?? null, note: document.querySelector('.bha-charpick__note')?.textContent ?? null };
});
const curTrack = (page) => page.evaluate(() => {
  const k = Object.keys(localStorage).find((x) => { try { return !!JSON.parse(localStorage.getItem(x))?.otherTracks; } catch { return false; } });
  const s = k ? JSON.parse(localStorage.getItem(k)) : null;
  return s ? { factionId: s.factionId, transcendentId: s.transcendentId ?? null, others: s.otherTracks.length, tier: s.evolution?.tierIndex } : null;
});
const arenaFacts = (page) => page.evaluate(() => ({
  dialog: !!document.querySelector('.bha-testarena'),
  empty: !!document.querySelector('.bha-unit--foe.is-empty'),
  entryScreen: !!document.querySelector('[data-sc="practice-enter"]'),
  foes: [...document.querySelectorAll('.bha-testarena [role="option"], .bha-testarena option')].map((o) => o.textContent.trim()).slice(0, 4),
  foeNow: document.querySelector('.bha-testarena .bha-test__select')?.textContent.trim() ?? null,
}));

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const server = await startServer();
  const browser = await chromium.launch();
  const proof = { errors: [], shots: [], facts: {} };
  const shot = async (page, name) => { await page.screenshot({ path: path.join(OUT, `${name}.png`) }); proof.shots.push(`${name}.png`); };
  try {
    for (const [tag, opt] of [['pc', PC], ['phone', PH]]) {
      const F = (proof.facts[tag] = {});
      const ctx = await browser.newContext(opt);
      // ③ 안 열린 종족: 일반 새 게임(한 종족만) — [캐릭터 변경] → 지금 카드 + 자물쇠 카드
      let page = await ctx.newPage();
      page.on('pageerror', (e) => proof.errors.push(`${tag}: ${e.message.slice(0, 200)}`));
      await newGame(page, server.url, {});
      await openMore(page);
      F.moreSingle = await moreLabels(page);
      await page.getByRole('button', { name: '캐릭터 변경', exact: true }).first().click({ timeout: 3000 });
      await wait(600);
      F.locked = await pickFacts(page);
      await page.locator('.bha-charpick__card.is-locked').first().click({ timeout: 2000, force: true }).catch(() => {});
      await wait(300);
      F.lockedTap = await pickFacts(page).then((f) => ({ open: f.open, note: f.note }));
      await shot(page, `03-${tag}-locked-faction`);
      await press(page, 'back');
      F.backClosed = !(await page.locator('.bha-charpick').count());
      await page.close();

      // ① ② 테스트 칸(두 캐릭터 열림) + 초월자 해금
      page = await ctx.newPage();
      page.on('pageerror', (e) => proof.errors.push(`${tag}: ${e.message.slice(0, 200)}`));
      await newGame(page, server.url, { open2: true, tr: tag === 'pc' ? 6 : 3 });
      F.afterGrant = await curTrack(page);
      await closeNotes(page);
      await openMore(page);
      F.more = await moreLabels(page);
      await shot(page, `01-${tag}-more-menu`);
      await page.getByRole('button', { name: '캐릭터 변경', exact: true }).first().click({ timeout: 3000 });
      await wait(700);
      F.picker = await pickFacts(page);
      await shot(page, `02-${tag}-character-cards`);
      // 가로 넘김: PC = 휠·←→ 키, 폰 = 손가락 끌기(CDP 터치)
      if (tag === 'pc') {
        const box = await page.locator('.bha-charpick__strip').boundingBox();
        await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
        await page.mouse.wheel(0, 300);
        await wait(300);
        F.wheelScroll = (await pickFacts(page)).scrollLeft;
        await page.keyboard.press('ArrowRight');
        await page.keyboard.press('ArrowRight');
        await wait(200);
        F.keyFocus = (await pickFacts(page)).focus;
      } else {
        const box = await page.locator('.bha-charpick__strip').boundingBox();
        const cdp = await ctx.newCDPSession(page);
        const y = box.y + box.height / 2;
        const pts = [box.x + box.width - 20, box.x + box.width - 80, box.x + box.width - 160, box.x + 40];
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: pts[0], y }] });
        for (const x of pts.slice(1)) { await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y }] }); await wait(50); }
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
        await wait(300);
        F.swipeScroll = (await pickFacts(page)).scrollLeft;
        F.stillOpenAfterSwipe = !!(await page.locator('.bha-charpick').count());
      }
      // 다른 캐릭터 카드를 누르면 전환 (기존 흐름) → 방이 그 캐릭터로
      const before = await curTrack(page);
      const other = page.locator('.bha-charpick__card:not(.is-locked):not([data-current])').first();
      const otherKey = await other.getAttribute('data-char');
      await other.scrollIntoViewIfNeeded().catch(() => {});
      await other.click({ timeout: 2000 });
      await wait(1500);
      await skipTut(page);
      await closeNotes(page);
      F.switch = { otherKey, before, after: await curTrack(page), closed: !(await page.locator('.bha-charpick').count()) };
      await openMore(page);
      await page.getByRole('button', { name: '캐릭터 변경', exact: true }).first().click({ timeout: 3000 });
      await wait(500);
      F.pickerAfter = (await pickFacts(page)).cards.filter((c) => c.current).map((c) => c.key);
      await page.locator('.bha-charpick .bha-itemmodal__close').first().click({ timeout: 2000 });
      await wait(300);
      F.xClosed = !(await page.locator('.bha-charpick').count());
      await page.close();

      // ⑤~⑧ 먹이 줄 (GDD 4-4 v6.130): [종류] + 그 종류 먹이 가로 한 줄 · 순환 · 닫을 때 기억 · 가로 넘김
      page = await ctx.newPage();
      page.on('pageerror', (e) => proof.errors.push(`${tag}: ${e.message.slice(0, 200)}`));
      const food = { basic: 3, sushi: 2, roast: 4, hearty: 1, fizz: 2, mushroom: 5, feast: 1, tonic: 2, flesh: 1, elixir: 1, purify: 1, relic: 1, ...(tag === 'phone' ? { snack: 3 } : {}) };
      await newGame(page, server.url, { food });
      const foodFacts = () => page.evaluate(() => {
        const row = document.querySelector('.bha-homedock__foodrow');
        return { kind: document.querySelector('.bha-homedock__foodkind')?.textContent ?? null, foods: [...document.querySelectorAll('.bha-homedock__foodrow .bha-homedock__food')].map((b) => b.dataset.food), empty: document.querySelector('.bha-homedock__foodrow .bha-homedock__traynote')?.textContent ?? null, overflow: row ? row.scrollWidth > row.clientWidth : null, scrollLeft: row?.scrollLeft ?? null, stored: localStorage.getItem('bha-food-kind') };
      });
      const feedBtn = page.locator('.bha-homedock__carebtn--feed').first();
      await feedBtn.click(); await wait(400);
      F.foodNormal = await foodFacts();
      await shot(page, `06-${tag}-food-normal`);
      const kindBtn = () => page.locator('.bha-homedock__foodkind').first();
      // 순환 = 데이터 순서 특식 → 일반 → 보급 → 특식: 일반에서 누르면 보급, 한 번 더 = 특식, 한 번 더 = 일반
      await kindBtn().click(); await wait(300);
      F.foodCheap = await foodFacts();
      F.focusAfterKind = await page.evaluate(() => document.querySelector('.bha-sel')?.className ?? null);
      await shot(page, `08-${tag}-food-cheap`);
      await kindBtn().click(); await wait(300);
      F.foodSpecial = await foodFacts();
      await shot(page, `07-${tag}-food-special`);
      await kindBtn().click(); await wait(300);
      F.foodCycle = (await foodFacts()).kind;
      F.beforeScroll = await foodFacts();
      const rbox = await page.locator('.bha-homedock__foodrow').boundingBox();
      if (tag === 'pc') {
        await page.mouse.move(rbox.x + rbox.width / 2, rbox.y + rbox.height / 2);
        await page.mouse.wheel(0, 400); await wait(300);
      } else {
        const cdp = await ctx.newCDPSession(page);
        const y = rbox.y + rbox.height / 2;
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: rbox.x + rbox.width - 20, y }] });
        for (const x of [rbox.x + rbox.width - 80, rbox.x + rbox.width - 200, rbox.x + 40]) { await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y }] }); await wait(50); }
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await wait(300);
      }
      F.scrolled = await foodFacts();
      await shot(page, `09-${tag}-food-scrolled`);
      // 먹인 뒤: 줄 그대로, 같은 먹이 초점, 넘긴 자리 그대로
      const last = page.locator('.bha-homedock__foodrow .bha-homedock__food').last();
      const lastId = await last.getAttribute('data-food');
      await last.click(); await wait(1600);
      F.afterFeed = { ...(await foodFacts()), sel: await page.evaluate(() => document.querySelector('.bha-sel')?.dataset?.food ?? null), lastId };
      // 닫을 때 기억 → 다시 열면 그 종류 (닫기 전에 보급으로 바꿔 둔다)
      await kindBtn().click(); await wait(300);
      F.beforeClose = (await foodFacts()).kind;
      await feedBtn.click(); await wait(300);
      F.storedAfterClose = await page.evaluate(() => localStorage.getItem('bha-food-kind'));
      await feedBtn.click(); await wait(300);
      F.reopened = (await foodFacts()).kind;
      await page.close();
      // 튜토리얼 안내 먹이(첫 끼니)를 가졌으면 기억(보급)과 상관없이 그 종류로 열림 — 안내가 그 칸을 짚는다
      page = await ctx.newPage();
      page.on('pageerror', (e) => proof.errors.push(`${tag}: ${e.message.slice(0, 200)}`));
      await newGame(page, server.url, { food: { tutorial: 1 } });
      await page.evaluate(() => localStorage.setItem('bha-food-kind', 'cheap'));
      await page.locator('.bha-homedock__carebtn--feed').first().click(); await wait(400);
      F.tutorialFood = await page.evaluate(() => ({ kind: document.querySelector('.bha-homedock__foodkind')?.textContent ?? null, first: document.querySelector('.bha-homedock__foodrow .bha-homedock__food')?.dataset.food ?? null, sel: document.querySelector('.bha-sel')?.className ?? null }));
      await page.close();
      // ④ 훈련 인형: 테스트 칸 새로(1단계) → 방 수련장 물건 → 곧장 전투 + 설정 창
      page = await ctx.newPage();
      page.on('pageerror', (e) => proof.errors.push(`${tag}: ${e.message.slice(0, 200)}`));
      await newGame(page, server.url, { open2: true });
      F.tierBefore = (await curTrack(page))?.tier;
      await page.locator('.bha-prop--altar').first().click({ timeout: 4000 });
      await wait(1400);
      F.dummyBefore4 = await arenaFacts(page);
      await shot(page, `04-${tag}-dummy-dialog`);
      if (tag === 'pc') {
        // 창 닫기 = 빈 자리 [적 설정] → 다시 열기 → [확인] = 적 등장 → 처치 → 다시 창 → 나가기 = 수련장
        await press(page, 'back');
        F.closedSlot = await page.evaluate(() => ({ dialog: !!document.querySelector('.bha-testarena'), slot: !!document.querySelector('.bha-testarena__slot') }));
        await page.locator('.bha-testarena__slot').first().click({ timeout: 2000 });
        await wait(500);
        await page.getByRole('button', { name: '확인', exact: true }).filter({ visible: true }).last().click({ timeout: 2000 });
        await page.waitForFunction(() => !document.querySelector('.bha-unit--foe.is-empty') && !document.querySelector('.bha-testarena'), null, { timeout: 15000 });
        F.foeShown = true;
        // 테스트 모드가 아니라 전투 훅이 없다 — 실제로 쓰러뜨릴 때까지 기다린다 (훈련 인형 체력 = 기본 공격 30회 분량)
        await page.waitForSelector('.bha-testarena', { timeout: 150000 });
        await wait(500);
        F.againAfterKill = await arenaFacts(page);
        await page.getByRole('button', { name: '나가기', exact: true }).filter({ visible: true }).first().click({ timeout: 2000 });
        await wait(900);
        F.exitTo = await page.evaluate(() => ({ entry: !!document.querySelector('[data-sc="practice-enter"]'), title: document.querySelector('.bha-viewtitle__name')?.textContent ?? null }));
        await press(page, 'back');
        F.backFromPractice = { room: !!(await page.locator('.bha-room--home').count()) };
        // 4단계 뒤: 4단계 진화체 상태로 새로 → 다시 훈련 인형
        await newGame(page, server.url, { open2: true, tier: 4 });
        F.tierAfter = (await curTrack(page))?.tier;
        await page.locator('.bha-prop--altar').first().click({ timeout: 4000 });
        await wait(1400);
        F.dummyAfter4 = await arenaFacts(page);
        await shot(page, `05-${tag}-dummy-dialog-tier4`);
        await page.getByRole('button', { name: '나가기', exact: true }).filter({ visible: true }).first().click({ timeout: 2000 });
        await wait(900);
        await page.locator('.bha-viewtitle').first().click({ timeout: 2000 }).catch(() => {});
        await wait(300);
        F.titleListTier4 = await page.evaluate(() => [...document.querySelectorAll('.bha-viewtitle__item')].map((i) => `${i.textContent.trim()}${i.classList.contains('is-locked') ? ' (잠김)' : ''}`));
      }
      await ctx.close();
    }
  } catch (e) {
    proof.errors.push(String(e).slice(0, 400));
    for (const c of browser.contexts()) for (const pg of c.pages()) await pg.screenshot({ path: path.join(OUT, '_err.png') }).catch(() => {});
  } finally {
    fs.writeFileSync(path.join(OUT, 'proof.json'), JSON.stringify(proof, null, 2));
    await browser.close(); server.stop?.();
    console.log(JSON.stringify(proof, null, 1));
    process.exit(0);
  }
})();
