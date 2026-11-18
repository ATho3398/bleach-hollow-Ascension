// C.503 proof: 이치고 천년혈전(혈쇄 모델)을 입은 상태로 방 + 캐릭터 카드 창 — 카드 그림 = 방과 같은 혈쇄 종이인형 정지 그림, 유하바하 = 자리 표시. 1배. 실행: node scripts/c503-proof.cjs
const path = require('node:path');
const ROOT = path.resolve(__dirname, '..');
const { chromium } = require('playwright');
const { startServer } = require(path.join(ROOT, 'scripts/c276-proof.cjs'));
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  const server = await startServer(); const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 844, height: 390 } });
  page.on('pageerror', (e) => console.log('ERR', e.message));
  await page.goto(server.url); await wait(600);
  const info = await page.evaluate(async () => {
    localStorage.clear();
    const g = await import('/src/game.ts'); const T = await import('/src/engine/testMode.ts'); const F = await import('/src/data/factions/index.ts');
    const now = Date.now(); const s = g.newSaveData(F.FACTIONS[0].id, now);
    s.name = '권영'; s.help.tutorialSeen = true; s.lastSeenAt = now;
    for (const id of Object.keys(s.help.guides ?? {})) s.help.guides[id] = 'done';
    for (const id of ['first-run', 'first-run-room', 'birth', 'recover', 'home-intro']) s.help.guides[id] = 'done';
    s.otherTracks.push({ ...g.newTrack(F.FACTIONS[1].id, now, 1), parkedAt: now });
    T.testGrantTranscendent(s, 'ichigo', now);
    T.testGrantTranscendent(s, 'aizen', now);
    T.testGrantTranscendent(s, 'yhwach', now);
    g.switchTrack(s, 'tr:ichigo', now);
    const r = g.switchKitMode(s, 'tybw', true);
    window.__r = r;
    g.writeSave(localStorage, s);
    return { mode: JSON.stringify(window.__r), skin: s.skin, look: s.evolution.look, factionId: s.factionId, tr: s.transcendentId, artSkin: g.artSkinOf(s) };
  });
  console.log('save', JSON.stringify(info));
  await page.goto(server.url); await wait(1200);
  await page.getByRole('button', { name: /이어하기/ }).first().click(); await wait(3500);
  console.log('room', await page.evaluate(() => [...document.querySelectorAll('.bha-room img')].map((e) => e.className + ':' + e.getAttribute('src')).join(' | ')));
  await page.screenshot({ path: '' + path.join(ROOT, 'docs/captures/c503/02-pc-room-ichigo-bloodchain.png') + '' });
  await page.getByRole('button', { name: /더보기/ }).first().click(); await wait(500);
  await page.getByRole('button', { name: '캐릭터 변경', exact: true }).first().click(); await wait(800);
  console.log('cards', await page.evaluate(() => [...document.querySelectorAll('.bha-charpick__card')].map((c) => c.dataset.char + '=' + (c.querySelector('img')?.getAttribute('src') ?? 'icon')).join(' | ')));
  await page.screenshot({ path: '' + path.join(ROOT, 'docs/captures/c503/01-pc-cards-ichigo-bloodchain.png') + '' });
  await browser.close(); server.stop(); process.exit(0);
})();
