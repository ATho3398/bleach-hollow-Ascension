// 전투 아래 판(목업 전투 A)·체인 박스 증명 캡처 + 폰 점검 (GDD 189장 8·9, C.297 코딩210). 게임 코드는 안 고친다.
// 쓰기: node scripts/ui-audit/c297-battle.cjs <주소> <저장 폴더> [pc|phone|phone115 …]
//   pc = 844×390 마우스(PC 고정 모드) · phone = 796×384 터치 · phone115 = 796×384 터치 + 글자 1.15
// 상태(평소·체인2·체인3·봉인·소모품 낀 것·해방)는 테스트 모드 전역 __bhaCombat 을 그 순간만 바꿔 만든다(보이는 모양 확인용)
const { chromium } = require('playwright');
const path = require('node:path');
const fs = require('node:fs');
const { phoneInPage } = require('./phone-checks.cjs');
const [url, out, ...modesArg] = process.argv.slice(2);
const MODES = modesArg.length ? modesArg : ['pc', 'phone', 'phone115'];
fs.mkdirSync(out, { recursive: true });

async function toBattle(page, fi) {
  await page.goto(`${url}?test=1`); await page.evaluate(() => localStorage.clear()); await page.goto(`${url}?test=1`); await page.waitForTimeout(1200);
  await page.getByRole('button', { name: '새로 시작' }).click(); await page.waitForTimeout(300);
  await page.locator('.bha-slot').first().click(); await page.waitForTimeout(200);
  await page.getByRole('button', { name: '확인' }).click(); await page.waitForTimeout(300);
  await page.locator('.bha-species__card').nth(fi).click(); await page.waitForTimeout(300);
  await page.getByRole('button', { name: '시작', exact: true }).click(); await page.waitForTimeout(1800);
  await page.locator('.bha-prop--outside').first().click(); await page.waitForTimeout(700);
  await page.locator('.bha-worldmap [data-place="adventure"]').first().click(); await page.waitForTimeout(2000);
  await page.getByRole('button', { name: '★1', exact: true }).first().click().catch(() => {}); await page.waitForTimeout(300);
  await page.getByRole('button', { name: '출발', exact: true }).first().click();
  await page.locator('.bha-battle').waitFor({ timeout: 60_000 });
  await page.waitForFunction(() => {
    const s = window.__bhaCombat;
    return s && s.tray.some((b) => b.kind === 'skill' && b.family);
  }, null, { timeout: 30_000 });
}

// 상태 만들기 (page 안)
function setState(name) {
  const s = window.__bhaCombat;
  const skill = s.tray.find((b) => b.kind === 'skill' && b.family) || s.tray[0];
  const other = s.tray.find((b) => b.kind === 'skill' && (b.family !== skill.family || b.element !== skill.element)) || { ...skill, family: '__x', traitId: skill.traitId };
  let uid = 90000 + Math.floor(Math.random() * 1000);
  const cp = (b) => ({ ...b, uid: uid++, sealTicks: 0 });
  s.sealTicks = 0;
  if (!window.__c297) window.__c297 = { item: s.params.battleItem, gear: s.params.activeGear };
  s.params.battleItem = window.__c297.item;
  s.params.activeGear = window.__c297.gear;
  if (name === 'normal') s.tray = [cp(skill), cp(other), cp(skill)];
  if (name === 'chain2') s.tray = [cp(skill), cp(skill), cp(other), cp(skill), cp(other), cp(other)];
  if (name === 'chain3') s.tray = [cp(skill), cp(skill), cp(skill), cp(skill), cp(skill), cp(other), cp(other), cp(other)];
  if (name === 'seal') { s.tray = [cp(skill), cp(skill), cp(other)]; s.sealTicks = 80; }
  if (name === 'items') {
    s.tray = [cp(skill), cp(skill), cp(other)];
    s.params.battleItem = { id: 'battle-haste', effect: 'haste', seconds: 10, spawnMult: 2 };
    s.params.activeGear = { id: 'test-shield', effect: 'shield', seconds: 4, reduction: 0.3 };
    s.gearCooldown = 40;
  }
  if (name === 'lib') { s.tray = [cp(skill), cp(skill), cp(other)]; s.liberation.gauge = 100000; }
}

(async () => {
  const b = await chromium.launch();
  const report = [];
  for (const mode of MODES) {
    for (const [fi, fac] of [[0, 'hollow'], [1, 'shinigami']]) {
      const phone = mode.startsWith('phone');
      const page = await b.newPage(phone ? { viewport: { width: 796, height: 384 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true } : { viewport: { width: 844, height: 390 }, deviceScaleFactor: 1 });
      if (mode === 'phone115') await page.addInitScript((k) => {
        const put = () => {
          const st = document.createElement('style');
          st.textContent = `:root{${[['xs', 12], ['sm', 13], ['md', 14], ['lg', 16], ['xl', 18], ['2xl', 22], ['3xl', 28], ['4xl', 36], ['5xl', 48]].map(([n, v]) => `--bha-fs-${n}:${(v * k).toFixed(2)}px !important;`).join('')}}`;
          document.head.append(st);
        };
        if (document.head) put(); else document.addEventListener('DOMContentLoaded', put);
      }, 1.15);
      page.on('pageerror', (e) => report.push({ mode, fac, state: '-', kind: '스크립트 오류', key: e.message.slice(0, 100) }));
      try {
        await toBattle(page, fi);
        for (const st of ['normal', 'chain2', 'chain3', 'seal', 'items', 'lib']) {
          await page.evaluate(setState, st);
          if (st === 'lib') {
            await page.waitForTimeout(150);
            await page.locator('.bha-v2herolib').click({ force: true }).catch(() => {});
            await page.waitForTimeout(900);
            await page.evaluate(() => { const s = window.__bhaCombat; const k = s.tray.find((x) => x.kind === 'skill' && x.family); if (k) s.tray = [k, { ...k, uid: 99991 }, ...s.tray.filter((x) => x !== k).slice(0, 3)]; });
          }
          await page.waitForTimeout(1000); // 통째로 바꾼 블록의 발동 잔상(0.9초)이 지나간 뒤
          const lcd = await page.locator('.bha-lcd').boundingBox();
          await page.screenshot({ path: path.join(out, `${mode}-${fac}-${st}.png`), clip: { x: lcd.x, y: lcd.y, width: lcd.width, height: lcd.height } });
          if (phone) for (const i of await page.evaluate(phoneInPage)) report.push({ mode, fac, state: st, ...i });
        }
      } catch (e) {
        report.push({ mode, fac, state: '-', kind: '스크립트 실패', key: String(e.message).split('\n')[0].slice(0, 160) });
      }
      await page.close();
    }
  }
  await b.close();
  const merged = new Map();
  for (const r of report) {
    const k = `${r.mode}|${r.kind}|${r.key}`;
    if (!merged.has(k)) merged.set(k, { ...r, where: [] });
    merged.get(k).where.push(`${r.fac}:${r.state}`);
  }
  console.log(`점검 ${merged.size}건`);
  for (const r of merged.values()) console.log(`- [${r.mode}] ${r.kind} · ${r.key} · ${r.detail || ''} (${[...new Set(r.where)].slice(0, 4).join(',')})`);
  fs.writeFileSync(path.join(out, 'phone-checks.json'), JSON.stringify([...merged.values()], null, 1));
})();
