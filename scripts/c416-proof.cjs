// C.416 proof (GDD 246장 → v6 15절, 코딩276): 아란칼화 결과 그림(남·여) · 스킨 목록에 옛 새형 없음 · 방 말풍선 자리(폰 가로·세로·PC) — 1배
// 실행: node scripts/c416-proof.cjs [저장 폴더]
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const { startServer } = require('./c276-proof.cjs');

const OUT = path.resolve(process.argv[2] || path.join(__dirname, '..', 'docs/captures/c416'));
const VIEWS = {
  land: { viewport: { width: 796, height: 384 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true },
  port: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true },
  pc: { viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 },
};

async function seed(page, base, opt) {
  await page.goto(base); await page.waitForTimeout(600);
  const out = await page.evaluate(async (opt) => {
    localStorage.clear();
    const g = await import('/src/game.ts');
    const s = g.newSaveData('hollow', Date.now());
    s.name = '권영'; s.gender = opt.gender || 'male';
    s.help.tutorialSeen = true;
    for (const id of ['first-run', 'first-run-room', 'birth', 'recover', 'home-intro', 'recover-cure']) s.help.guides[id] = 'done';
    if (opt.tier4) {
      Object.assign(s.evolution, { tierIndex: 3, formId: 't4:fire:mixed', formHistory: ['t2:base', 't3:fire', 't4:fire:mixed'], ability: 'atk', look: 'wyrmfire' });
    }
    if (opt.raptor) {
      // 옛 세이브: 시작 외형 새형(raptor)을 받아 보유 목록에 skin-raptor 가 남아 있다
      for (const id of ['skin-raptor', 'skin-grandfisher']) if (!s.shared.cosmetics.includes(id)) s.shared.cosmetics.push(id);
    }
    for (const k of Object.keys(s.help.guides)) s.help.guides[k] = 'done';
    s.lastSeenAt = Date.now();
    g.writeSave(localStorage, s);
    return { look: s.evolution.look, cosmetics: s.shared.cosmetics };
  }, opt);
  await page.goto(base); await page.waitForTimeout(1200);
  await page.getByRole('button', { name: /이어하기/ }).first().click({ timeout: 5000 });
  await page.waitForTimeout(1600);
  return out;
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const server = await startServer();
  const browser = await chromium.launch();
  const proof = { errors: [], shots: [], facts: {} };
  const shot = async (page, name) => { await page.screenshot({ path: path.join(OUT, name) }); proof.shots.push(name); };
  try {
    // 1·2) 아란칼화 결과 (남·여): 4단계 호로 세이브 → 실제 recordAscension → 결과 화면(앱의 ascensionResultView + evolvedArtOf)
    for (const gender of ['male', 'female']) {
      const page = await browser.newPage(VIEWS.port);
      page.on('pageerror', (e) => proof.errors.push(e.message.slice(0, 200)));
      await seed(page, server.url, { tier4: true, gender });
      proof.facts[`ascension-${gender}`] = await page.evaluate(async () => {
        const g = await import('/src/game.ts');
        const { getFaction } = await import('/src/data/factions/index.ts');
        const { roomOf } = await import('/src/engine/faction.ts');
        const { createCombat } = await import('/src/engine/combat/index.ts');
        const { getEnemy } = await import('/src/data/enemies/index.ts');
        const { evolvedArtOf } = await import('/src/ui/evolvedArt.ts');
        const { ascensionResultView } = await import('/src/ui/rankView.ts');
        const { setActiveGender } = await import('/src/engine/gender.ts');
        const save = g.loadSave(localStorage);
        setActiveGender(save.gender);
        const before = evolvedArtOf(roomOf(getFaction('hollow')), save);
        const c = createCombat(1, { enemy: getEnemy('test-a'), params: {} }); c.status = 'won';
        g.recordAscension(save, c, Date.now());
        const f = getFaction('hollow');
        const art = evolvedArtOf(roomOf(f), save);
        const root = document.querySelector('#app') ?? document.body.firstElementChild;
        ascensionResultView(root, f, true, f.ascension.completeText, { onBack() {} }, save.evolution.formId, art);
        return { before: before.rig?.look ?? before.src, after: art.rig?.look ?? art.src, look: save.evolution.look, artTierIndex: g.artTierIndexOf(save) };
      });
      await page.waitForTimeout(900);
      await shot(page, `0${gender === 'male' ? 1 : 2}-ascension-result-${gender}.png`);
      await page.close();
    }
    // 3) 스킨 목록: 옛 세이브(보유 skin-raptor)여도 상태 화면 스킨 목록에 '새형' 없음
    {
      const page = await browser.newPage(VIEWS.land);
      page.on('pageerror', (e) => proof.errors.push(e.message.slice(0, 200)));
      await seed(page, server.url, { raptor: true });
      await page.locator('.bha-room__status').first().click(); await page.waitForTimeout(900);
      const sk = page.locator('section[aria-label="스킨"], [aria-label="스킨"]').first();
      if (await sk.count()) await sk.scrollIntoViewIfNeeded();
      proof.facts.skinList = await page.evaluate(() => {
        const p = document.querySelector('[aria-label="스킨"]');
        return p ? { text: p.textContent.replace(/\s+/g, ' ').trim().slice(0, 300), hasNewType: /새형/.test(p.textContent) } : null;
      });
      proof.facts.bodyHasNewType = await page.evaluate(() => /새형/.test(document.body.textContent));
      await shot(page, '03-skin-list-no-raptor.png');
      await page.close();
    }
    // 4~6) 방 말풍선 자리: 캐릭터를 눌러 말을 시키고 상태 박스·캐릭터·말풍선 위치를 잰다
    let i = 4;
    for (const [name, view] of Object.entries(VIEWS)) {
      const page = await browser.newPage(view);
      page.on('pageerror', (e) => proof.errors.push(e.message.slice(0, 200)));
      await seed(page, server.url, {});
      await page.locator('.bha-char').first().click(); await page.waitForTimeout(400);
      proof.facts[`bubble-${name}`] = await page.evaluate(() => {
        // 장면 기준 자리 (세로 폰 = 시계 방향 90도 회전 출력이라 화면 좌표를 장면 좌표로 바꾼다 — select.ts uiBox 와 같은 식)
        const sc = document.querySelector('.bha-room__scene, .bha-scene') || document.querySelector('.bha-room__bubble').parentElement;
        const sb = sc.getBoundingClientRect();
        const rot = sc.offsetWidth >= sc.offsetHeight !== sb.width >= sb.height;
        const loc = (b) => { const cx = b.left + b.width / 2, cy = b.top + b.height / 2; const u = rot ? cy - sb.top : cx - sb.left, v = rot ? sb.left + sb.width - cx : cy - sb.top, w = rot ? b.height : b.width, h = rot ? b.width : b.height; return { left: u - w / 2, right: u + w / 2, top: v - h / 2, bottom: v + h / 2 }; };
        const r = (q) => { const e = document.querySelector(q); if (!e || e.hidden) return null; const b = loc(e.getBoundingClientRect()); return { l: Math.round(b.left), t: Math.round(b.top), r: Math.round(b.right), b: Math.round(b.bottom) }; };
        const bub = document.querySelector('.bha-room__bubble');
        const bubble = r('.bha-room__bubble'), status = r('.bha-room__status'), char = r('.bha-char');
        const props = [...document.querySelectorAll('.bha-prop, .bha-room__extra')].filter((e) => e.offsetWidth > 0).map((e) => loc(e.getBoundingClientRect()));
        const hit = bubble ? props.some((p) => bubble.r > p.left && bubble.l < p.right && bubble.b > p.top && bubble.t < p.bottom) : null;
        const inScene = bubble ? bubble.l >= 0 && bubble.t >= 0 && bubble.r <= sc.offsetWidth && bubble.b <= sc.offsetHeight : null;
        const statusVisible = getComputedStyle(document.querySelector('.bha-room__chips')).visibility !== 'hidden';
        return { text: bub && !bub.hidden ? bub.textContent : null, slot: bub?.classList.contains('is-slot'), bubble, status, char, belowStatus: bubble && status ? bubble.t >= status.b : null, overlapsProp: hit, inScene, rotated: rot, statusVisible };
      });
      await shot(page, `0${i++}-room-bubble-${name}.png`);
      await page.close();
    }
  } finally {
    fs.writeFileSync(path.join(OUT, 'proof.json'), JSON.stringify(proof, null, 2));
    await browser.close(); server.stop?.();
  }
  console.log(JSON.stringify(proof, null, 1));
  process.exit(0);
})();
