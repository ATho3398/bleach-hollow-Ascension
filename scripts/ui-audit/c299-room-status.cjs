// C.299 증명 캡처 (GDD 189장, 코딩211): 방(S01) 상태 게이지 목록형 · 먹이 줄 · 상태(S15) 능력치 표·아래 띠·진화 정보.
// 쓰기: node scripts/ui-audit/c299-room-status.cjs <주소> <저장 폴더>
// 조건 세 벌: PC 고정 844×390 · 폰 796×384 터치 · 폰 796×384 터치 + 글자 1.15. 두 종족.
// 배부름 = 100 − nest.hunger(배고픔). 화면: 방 평소 · 먹이 줄 · 방 게이지 낮을 때(쇠약·피곤) · 방 빈사 · 상태 맨 위 · 상태 오른쪽 열 끝 · 능력치 칸 설명 창 · 진화 정보(4단계 진화체, 긴 이름).
// 화면마다 phone-checks.cjs(말줄임·세로 꺾임·판 밖·LCD 밖) 결과를 checks.json 에 모은다.
const { chromium } = require('playwright');
const fs = require('node:fs');
const path = require('node:path');
const { phoneInPage } = require('./phone-checks.cjs');

const [url, outDir] = process.argv.slice(2);
const CONDS = [
  { id: 'pc844', opt: { viewport: { width: 844, height: 390 }, deviceScaleFactor: 1 }, k: 1 },
  { id: 'ph796', opt: { viewport: { width: 796, height: 384 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true }, k: 1 },
  { id: 'ph796x115', opt: { viewport: { width: 796, height: 384 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true }, k: 1.15 },
];

// 게임이 떠 있으면 저장을 다시 덮어쓰므로, 게임 밖 같은 주소(매니페스트 파일)로 나가서 고친 뒤 다시 연다
async function patchSave(page, src) {
  await page.goto(`${url}manifest.webmanifest`);
  await page.evaluate((s) => {
    const f = new Function('t', 'shared', s);
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      const raw = localStorage.getItem(k);
      if (!raw || !raw.includes('"runLog"')) continue;
      const data = JSON.parse(raw);
      const walk = (o) => {
        if (!o || typeof o !== 'object') return;
        if (o.nest && o.help && o.runLog) f(o, o.shared);
        for (const v of Object.values(o)) walk(v);
      };
      walk(data);
      localStorage.setItem(k, JSON.stringify(data));
    }
  }, src);
}

async function reopen(page) {
  await page.goto(`${url}?test=1`);
  await page.waitForTimeout(1300);
  await page.getByRole('button', { name: '이어하기' }).click().catch(() => {});
  await page.waitForTimeout(1800);
}

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
  await page.waitForTimeout(2000);
}

(async () => {
  fs.mkdirSync(outDir, { recursive: true });
  const b = await chromium.launch();
  const report = {};
  for (const c of CONDS) {
    for (const [fi, fac] of [[0, 'hollow'], [1, 'shinigami']]) {
      const page = await b.newPage(c.opt);
      if (c.k !== 1) await page.addInitScript((k) => {
        const put = () => {
          const st = document.createElement('style');
          st.textContent = `:root{${[['xs', 12], ['sm', 13], ['md', 14], ['lg', 16], ['xl', 18], ['2xl', 22], ['3xl', 28], ['4xl', 36], ['5xl', 48]].map(([n, v]) => `--bha-fs-${n}:${(v * k).toFixed(2)}px !important;`).join('')}}`;
          document.head.append(st);
        };
        if (document.head) put(); else document.addEventListener('DOMContentLoaded', put);
      }, c.k);
      const shot = async (name) => {
        await page.waitForTimeout(250);
        await page.screenshot({ path: path.join(outDir, `${c.id}-${fac}-${name}.png`) });
        report[`${c.id}/${fac}/${name}`] = await page.evaluate(`(${phoneInPage.toString()})()`);
      };
      const closeTut = async () => {
        for (let i = 0; i < 4; i++) {
          const skip = page.locator('.bha-tut button, [data-tutorial] button').filter({ hasText: /건너뛰기|닫기|확인/ });
          if (await skip.count()) await skip.first().click().catch(() => {}); else break;
          await page.waitForTimeout(200);
        }
      };
      try {
        await newGame(page, fi);
        // 튜토리얼 안내가 화면을 덮지 않게 안내 다 본 것으로
        await patchSave(page, `t.help.tutorialSeen = true; t.nest.hunger = 20; t.nest.condition = 80; t.nest.stability = 50; t.nest.weakened = false; t.nest.tired = false;`);
        await reopen(page);
        await closeTut();
        await shot('1room');
        await page.locator('.bha-homedock__carebtn--feed').click();
        await page.waitForTimeout(500);
        await shot('2room-food');
        await page.locator('.bha-homedock__carebtn--feed').click();
        await page.waitForTimeout(300);
        await page.locator('.bha-room__statusinfo').click();
        await page.waitForTimeout(400);
        await shot('3room-info');
        await page.keyboard.press('Escape');
        await page.waitForTimeout(200);
        await page.locator('.bha-room__status').first().click();
        await page.waitForTimeout(900);
        await shot('5status-top');
        const cell = page.locator('.bha-care__celltip, .bha-stats .bha-statrow > .bha-info').nth(1); // 옛 빌드(칸마다 ⓘ)도 같은 자리
        await cell.click();
        await page.waitForTimeout(400);
        await shot('6status-cellinfo');
        await page.keyboard.press('Escape');
        await page.locator('.bha-care__scroll').evaluate((e) => { e.scrollTop = e.scrollHeight; });
        await page.waitForTimeout(300);
        await shot('7status-end');
        // 게이지 낮을 때 (쇠약·피곤)
        await patchSave(page, `t.nest.hunger = 92; t.nest.condition = 12; t.nest.stability = 15; t.nest.weakened = true; t.nest.tired = true;`);
        await reopen(page);
        await closeTut();
        await shot('4room-low');
        // 빈사
        await patchSave(page, `t.nest.weakened = false; t.nest.tired = false; t.nest.collapsed = true; t.nest.dead = false; t.nest.hpFraction = 0.05; t.nest.collapsedAt = Date.now() - 60000;`);
        await reopen(page);
        await closeTut();
        await shot('4room-dying');
        // 진화 정보: 4단계 진화체(긴 이름), 정상 상태로
        await patchSave(page, `t.nest.collapsed = false; t.nest.hpFraction = 1; t.nest.hunger = 20; t.nest.condition = 80; t.nest.stability = 50; t.nest.weakened = false; t.nest.tired = false; t.evolution.formId = 't4:normal:mixed'; t.evolution.tierIndex = 3; for (const k in t.evolution.ev) t.evolution.ev[k] = 17;`);
        await reopen(page);
        await closeTut();
        await page.locator('.bha-room__status').first().click();
        await page.waitForTimeout(900);
        await shot('9status-ev');
        await page.locator('.bha-care__scroll [data-evolution]').evaluate((e) => e.scrollIntoView({ block: 'end' }));
        await page.waitForTimeout(300);
        await shot('8status-evo');
      } catch (e) {
        console.log(c.id, fac, 'fail', String(e.message).split('\n')[0]);
        await page.screenshot({ path: path.join(outDir, `${c.id}-${fac}-zz-fail.png`) }).catch(() => {});
      }
      await page.close();
    }
  }
  fs.writeFileSync(path.join(outDir, 'checks.json'), JSON.stringify(report, null, 1));
  const sum = {};
  for (const [k, v] of Object.entries(report)) sum[k] = v.length;
  console.log(JSON.stringify(sum, null, 0));
  await b.close();
})();
