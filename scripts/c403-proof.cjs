// C.403 proof (GDD 241-0 사용자 수정·241-C 1~3·242장 2, 코딩269): 해금 흐름 — ① 방의 수련장(잠금 표시 없음) ② 월드맵 번호 쟁탈전 잠김 + 알림 ③ 시장 장비 상점 잠김 ④ 수련장 = 훈련 인형 먼저, 목록의 본능 수련 자물쇠 + 알림
// ⑤ 2단계 타일 안내(합성) ⑥⑦ 3단계 장비·전투 소모품 안내 ⑧ 해방 클리어 장신구 안내 ⑨ 첫 환생 펫 안내 ⑩ 방 붕옥 아이콘(등장 뒤) · 4단계 월드맵 번호 쟁탈전 열림
// 세이브는 게임 모듈(newSaveData·performEvolution·writeSave)로 만들어 넣는다 — 시작 화면 흐름과 무관. 1배 844×390. 쓰기: node scripts/c403-proof.cjs [저장 폴더]
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const { startServer } = require('./c276-proof.cjs');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.resolve(process.argv[2] || path.join(ROOT, 'docs/captures/c403'));

/** tier = 진화 횟수(0 = 1단계). 한 번만 뜨는 첫 안내들은 본 것으로, 해금 안내는 keepGuides 면 대기 그대로. extra = 'ascend'(해방 클리어) | 'rebirth'(첫 환생) | 'hogyoku'(붕옥 등장) */
async function seed(page, base, factionId, tier, keepGuides, extra) {
  await page.goto(base);
  await page.waitForTimeout(600);
  const out = await page.evaluate(async ({ factionId, tier, keepGuides, extra }) => {
    localStorage.clear();
    const g = await import('/src/game.ts');
    const s = g.newSaveData(factionId, Date.now());
    s.name = '권영';
    s.help.tutorialSeen = true;
    for (const id of ['first-run', 'first-run-room', 'birth', 'recover', 'home-intro', 'recover-cure']) s.help.guides[id] = 'done';
    for (let i = 0; i < tier; i++) {
      s.evolution.steps = 999999;
      const r = g.performEvolution(s, Date.now());
      if (!r.ok) return { ok: false, at: i };
    }
    if (extra) for (const k of Object.keys(s.help.guides)) s.help.guides[k] = 'done'; // 앞 단계 안내는 본 것으로 — 이번에 열린 것만
    if (extra === 'ascend') { s.evolution.ascended = true; g.checkUnlocks(s, Date.now()); }
    if (extra === 'rebirth') { s.rebirth.count = 1; g.checkUnlocks(s, Date.now()); }
    if (extra === 'hogyoku') s.hogyoku.tabOpen = true;
    if (!keepGuides) for (const k of Object.keys(s.help.guides)) s.help.guides[k] = 'done';
    s.lastSeenAt = Date.now();
    g.writeSave(localStorage, s);
    return { ok: true, tier: s.evolution.tierIndex, unlocks: Object.keys(s.shared.unlocks), guides: Object.entries(s.help.guides).filter(([, v]) => v === 'pending').map(([k]) => k) };
  }, { factionId, tier, keepGuides, extra: extra || null });
  await page.goto(base);
  await page.waitForTimeout(1200);
  await page.getByRole('button', { name: /이어하기/ }).first().click({ timeout: 5000 });
  await page.waitForTimeout(1500);
  return out;
}
const toasts = (page) => page.evaluate(() => [...document.querySelectorAll('.bha-toast')].map((t) => t.textContent.replace(/\s+/g, ' ').trim()));
const card = (page) => page.evaluate(() => { const c = document.querySelector('.bha-tut__card, .bha-tut'); return c ? c.textContent.replace(/\s+/g, ' ').trim().slice(0, 200) : null; });
const closeDialogs = async (page) => {
  for (let i = 0; i < 6; i++) {
    const b = page.locator('.bha-confirm button, .bha-idle button').filter({ visible: true });
    if (!(await b.count())) break;
    await b.last().click({ timeout: 1500 }).catch(() => {});
    await page.waitForTimeout(300);
  }
};

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const server = await startServer();
  const browser = await chromium.launch();
  const proof = { errors: [], shots: [], facts: {} };
  const F = proof.facts;
  try {
    const page = await browser.newPage({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 1 });
    page.on('pageerror', (e) => proof.errors.push(e.message.slice(0, 200)));
    const shot = async (name) => { await page.waitForTimeout(350); await page.screenshot({ path: path.join(OUT, `${name}.png`) }); proof.shots.push(`${name}.png`); };

    // ── 1단계 호로: 방 수련장 · 월드맵 번호 쟁탈전 잠김 · 수련장 목록 · 시장 장비 상점 잠김
    F.t1 = await seed(page, server.url, 'hollow', 0, false);
    await closeDialogs(page);
    F.roomProps = await page.evaluate(() => [...document.querySelectorAll('.bha-room .bha-prop')].map((b) => [b.className.match(/bha-prop--(\w+)/)?.[1], b.classList.contains('is-locked'), !!b.querySelector('.bha-prop__lock')]));
    await shot('01-room-t1-training');
    await page.locator('.bha-prop--outside').first().click(); await page.waitForTimeout(900);
    F.worldPlaces = await page.evaluate(() => [...document.querySelectorAll('.bha-worldmap [data-place]')].map((b) => [b.dataset.place, b.classList.contains('is-locked'), b.title]));
    await page.evaluate(() => document.querySelector('.bha-worldmap [data-place="rank"]').click()); await page.waitForTimeout(500);
    F.rankLockedToast = await toasts(page);
    await shot('02-worldmap-t1-rank-locked');
    await page.locator('.bha-worldmap [data-place="market"]').first().click(); await page.waitForTimeout(1500);
    F.marketSpots = await page.evaluate(() => [...document.querySelectorAll('[data-spot]')].map((b) => [b.dataset.spot, b.classList.contains('is-locked')]));
    await page.evaluate(() => document.querySelector('[data-spot="gearShop"]').click()); await page.waitForTimeout(500);
    F.gearShopToast = await toasts(page);
    await shot('03-market-t1-gearshop-locked');

    F.t1b = await seed(page, server.url, 'hollow', 0, false);
    await closeDialogs(page);
    await page.locator('.bha-prop--altar').first().click(); await page.waitForTimeout(900);
    F.trainingTitle = await page.evaluate(() => document.querySelector('.bha-viewtitle__name')?.textContent);
    await page.locator('.bha-viewtitle__btn').first().click(); await page.waitForTimeout(300);
    F.trainingList = await page.evaluate(() => [...document.querySelectorAll('.bha-viewtitle__item')].map((b) => [b.textContent.trim(), b.classList.contains('is-locked')]));
    await shot('04-training-list-instinct-locked');
    await page.evaluate(() => document.querySelector('.bha-viewtitle__item.is-locked').click()); await page.waitForTimeout(500);
    F.instinctToast = await toasts(page);
    F.stillPractice = await page.evaluate(() => document.querySelector('.bha-viewtitle__name')?.textContent);
    

    const next = async () => { await page.locator('.bha-tut button.bha-btn--primary:not([disabled])').filter({ visible: true }).first().click({ timeout: 2500 }).catch(() => {}); await page.waitForTimeout(500); };
    /** 뜬 안내 카드를 끝까지 넘기며 문구를 모으고, shots 의 낱말이 든 카드에서 캡처 */
    const walkCards = async (shots) => {
      const seen = [];
      for (let i = 0; i < 14; i++) {
        const c = await card(page);
        if (!c) { await page.waitForTimeout(700); if (!(await card(page))) break; continue; }
        seen.push(c);
        for (const [word, name] of shots) if (c.includes(word)) await shot(name);
        await next();
      }
      return seen;
    };

    // ── 2단계: 타일 안내 (설명 · 종류 · 합성 · 배치)
    F.t2 = await seed(page, server.url, 'hollow', 1, true);
    await closeDialogs(page); await page.waitForTimeout(1200);
    F.cards2 = await walkCards([['같은 타일', '05-t2-tile-intro-synth-card']]);

    // ── 3단계: 장비 안내 → 전투 소모품 안내
    F.t3 = await seed(page, server.url, 'hollow', 2, true);
    await page.evaluate(() => 0);
    await closeDialogs(page); await page.waitForTimeout(1200);
    F.cards3 = await walkCards([['장비가 열렸다', '06-t3-unlock-gear-card'], ['칸이 열렸다', '07-t3-unlock-battle-item-card']]);

    // ── 해방 클리어: 장신구 안내
    F.asc = await seed(page, server.url, 'hollow', 3, true, 'ascend');
    await closeDialogs(page); await page.waitForTimeout(1200);
    F.cardsAsc = await walkCards([['장신구가 열렸다', '08-ascend-unlock-accessory-card']]);

    // ── 첫 환생: 펫 안내 → 출정품 안내
    F.reb = await seed(page, server.url, 'hollow', 3, true, 'rebirth');
    await closeDialogs(page); await page.waitForTimeout(1200);
    F.cardsReb = await walkCards([['펫이 열렸다', '09-rebirth-unlock-pet-card']]);

    // ── 4단계 + 붕옥 등장: 방 붕옥 아이콘 · 월드맵 번호 쟁탈전 열림
    F.t4 = await seed(page, server.url, 'hollow', 3, false, 'hogyoku');
    await closeDialogs(page);
    F.roomProps4 = await page.evaluate(() => [...document.querySelectorAll('.bha-room .bha-prop')].map((b) => b.className.match(/bha-prop--(\w+)/)?.[1]));
    await shot('10-t4-room-hogyoku-icon');
    await page.locator('.bha-prop--outside').first().click(); await page.waitForTimeout(900);
    F.worldPlaces4 = await page.evaluate(() => [...document.querySelectorAll('.bha-worldmap [data-place]')].map((b) => [b.dataset.place, b.classList.contains('is-locked')]));

    // ── 사신 1단계 방 (값만)
    F.s1 = await seed(page, server.url, 'shinigami', 0, false);
    await closeDialogs(page);
    F.roomPropsS = await page.evaluate(() => [...document.querySelectorAll('.bha-room .bha-prop')].map((b) => [b.className.match(/bha-prop--(\w+)/)?.[1], b.getAttribute('aria-label')]));
    await page.close();
  } catch (e) {
    proof.errors.push(`script: ${e.message.slice(0, 300)}`);
  } finally {
    await browser.close();
    server.stop();
  }
  fs.writeFileSync(path.join(OUT, 'proof.json'), JSON.stringify(proof, null, 1));
  console.log(JSON.stringify(proof, null, 1));
})();
