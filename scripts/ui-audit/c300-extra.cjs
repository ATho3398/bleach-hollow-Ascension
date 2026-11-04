// ui-audit 가 안 도는 화면의 폰 점검 + 캡처 (GDD 189장, 코딩212 C.300). 게임 코드는 안 고친다.
// 쓰기: node scripts/ui-audit/c300-extra.cjs <주소> <저장 폴더> [vp=796x384|844x390] [글자 배=1]
// 화면: 진화(테스트 패널 [다음 진화] 연출) · 진급 시험(방 책장 아래) · 대화창(스토리 1화 [도전]) · 스토리 목록. 두 종족.
// 796x384 = 터치 폰(LCD 가 폰처럼 줄어든다), 844x390 = PC 고정 모드. 결과 = <폴더>/extra-<vp>-<배>.json + 화면마다 png
const { chromium } = require('playwright');
const fs = require('node:fs');
const path = require('node:path');
const { phoneInPage } = require('./phone-checks.cjs');

const [url, outDir, vp = '796x384', scaleArg = '1'] = process.argv.slice(2);
const [W, H] = vp.split('x').map(Number);
const scale = Number(scaleArg);
const touch = vp !== '844x390';

async function newGame(page, fi) {
  await page.goto(`${url}?test=1`);
  await page.evaluate(() => localStorage.clear());
  await page.goto(`${url}?test=1`);
  await page.waitForTimeout(1200);
  await page.getByRole('button', { name: '새로 시작' }).click();
  await page.waitForTimeout(300);
  await page.locator('.bha-slot').first().click();
  await page.waitForTimeout(200);
  await page.getByRole('button', { name: '확인' }).click();
  await page.waitForTimeout(300);
  await page.locator('.bha-species__card').nth(fi).click();
  await page.waitForTimeout(300);
  await page.getByRole('button', { name: '시작', exact: true }).click();
  await page.waitForTimeout(4500);
}

async function testTab(page, label) {
  await page.getByRole('button', { name: '더보기' }).click();
  await page.waitForTimeout(300);
  await page.locator('.bha-homedock__tray').getByRole('button', { name: '테스트' }).click();
  await page.waitForTimeout(700);
  await page.locator('.bha-lcd .bha-toggle').first().click();
  await page.waitForTimeout(300);
  await page.locator('.bha-lcd').getByRole('option', { name: label, exact: true }).or(page.locator('.bha-lcd').getByRole('button', { name: label, exact: true })).first().click();
  await page.waitForTimeout(500);
}

async function evolveOnce(page) {
  // 테스트 칸은 마지막 단계로 시작 — [진화체] 탭에서 1단계(진화 전)로 바꾼 뒤 [다음 진화]
  await testTab(page, '진화체');
  await page.locator('.bha-lcd button.bha-pick[aria-label="진화체"]').click();
  await page.waitForTimeout(300);
  await page.locator('.bha-lcd .bha-pick__list').getByText('1단계 (진화 전)', { exact: true }).first().click();
  await page.waitForTimeout(300);
  await page.getByRole('button', { name: '이 몸으로' }).click();
  await page.waitForTimeout(1200);
  await page.locator('.bha-lcd .bha-toggle').first().click();
  await page.waitForTimeout(300);
  await page.locator('.bha-lcd').getByRole('option', { name: '진화', exact: true }).click();
  await page.waitForTimeout(500);
  await page.getByRole('button', { name: '다음 진화' }).click();
  await page.waitForTimeout(2500);
}

const FLOWS = {
  async 진화(page, shot) {
    await evolveOnce(page);
    await shot('진화 연출');
    for (let i = 0; i < 6; i++) {
      await page.waitForTimeout(1500);
      await shot(`진화 연출 ${i + 1}`, true);
    }
  },
  async 진급시험(page, shot) {
    await page.locator('.bha-prop--rank').click();
    await page.waitForTimeout(1500);
    await shot('진급 시험');
    const rows = page.locator('.bha-lcd .bha-mdrow');
    const n = Math.min(await rows.count(), 4);
    for (let i = 1; i < n; i++) {
      await rows.nth(i).click().catch(() => {});
      await page.waitForTimeout(300);
      await shot(`진급 시험 ${i + 1}`);
    }
  },
  async 스토리(page, shot) {
    await page.locator('.bha-prop--outside').first().click();
    await page.waitForTimeout(700);
    await page.locator('.bha-worldmap [data-place="adventure"]').first().click();
    await page.waitForTimeout(2000);
    await page.locator('.bha-lcd .bha-toggle').first().click();
    await page.waitForTimeout(300);
    await page.locator('.bha-lcd').getByRole('option', { name: '스토리' }).first().click();
    await page.waitForTimeout(1000);
    await shot('스토리 목록');
    await page.locator('.bha-lcd .bha-story-ep').first().click({ position: { x: 60, y: 10 } }).catch(() => {});
    await page.waitForTimeout(300);
    await shot('스토리 목록 펼침');
    await page.locator('.bha-lcd [data-go]').first().click();
    await page.waitForTimeout(2500);
    await shot('대화창');
    for (let i = 0; i < 5; i++) {
      await page.locator('.bha-lcd').click({ position: { x: 300, y: 250 } }).catch(() => {});
      await page.waitForTimeout(900);
      await shot(`대화창 ${i + 2}`, true);
    }
  },
};

(async () => {
  fs.mkdirSync(outDir, { recursive: true });
  const b = await chromium.launch();
  const out = [];
  for (const [fi, fac] of [[0, 'hollow'], [1, 'shinigami']].filter(([i]) => !process.env.FAC || String(i) === process.env.FAC)) {
    for (const [name, run] of Object.entries(FLOWS).filter(([n]) => !process.env.ONLY || n === process.env.ONLY)) {
      const page = await b.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1, ...(touch ? { isMobile: true, hasTouch: true } : {}) });
      if (scale !== 1) await page.addInitScript((k) => {
        const put = () => {
          const st = document.createElement('style');
          st.textContent = `:root{${[['xs', 12], ['sm', 13], ['md', 14], ['lg', 16], ['xl', 18], ['2xl', 22], ['3xl', 28], ['4xl', 36], ['5xl', 48]].map(([n, v]) => `--bha-fs-${n}:${(v * k).toFixed(2)}px !important;`).join('')}}`;
          document.head.append(st);
        };
        if (document.head) put(); else document.addEventListener('DOMContentLoaded', put);
      }, scale);
      const seen = new Set();
      const shot = async (screen, onlyCheck = false) => {
        if (!onlyCheck) await page.screenshot({ path: path.join(outDir, `${fac}-${vp}-${scale}-${screen.replace(/\s+/g, '_')}.png`) });
        for (const r of await page.evaluate(phoneInPage)) {
          const k = `${screen.replace(/ \d+$/, '')}|${r.kind}|${r.key}`;
          if (seen.has(k)) continue;
          seen.add(k);
          out.push({ faction: fac, screen: screen.replace(/ \d+$/, ''), ...r });
        }
      };
      try {
        await newGame(page, fi);
        await run(page, shot);
      } catch (e) {
        out.push({ faction: fac, screen: name, kind: '스크립트 실패', key: '', detail: String(e.message).slice(0, process.env.DEBUG ? 600 : 160) });
        await page.screenshot({ path: path.join(outDir, `fail-${fac}-${name}.png`) }).catch(() => {});
      }
      await page.close();
      process.stdout.write(`[${fac} ${name}]`);
    }
  }
  await b.close();
  fs.writeFileSync(path.join(outDir, `extra-${vp}-${scale}.json`), JSON.stringify(out, null, 1));
  console.log(`\n${out.length}건`);
  for (const r of out) console.log(`- ${r.faction} [${r.screen}] ${r.kind} · ${r.key} · ${r.detail}`);
})();
