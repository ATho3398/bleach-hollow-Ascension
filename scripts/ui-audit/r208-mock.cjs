// 걷기·전투 화면 구성 바꾼 안 목업 (GDD 189장, 코딩208). 게임 코드는 안 고치고, 캡처 위에 지금 머리 줄·칩·전투 아래 판을 숨기고 안을 덧그린다.
// 쓰기: node scripts/ui-audit/r208-mock.cjs <주소> <저장 폴더>   (사용자 폰 조건 796×384 터치)
const { chromium } = require('playwright');
const path = require('node:path');
const [url, out] = process.argv.slice(2);

async function toWalk(page) {
  await page.goto(`${url}?test=1`); await page.evaluate(() => localStorage.clear()); await page.goto(`${url}?test=1`); await page.waitForTimeout(1200);
  await page.getByRole('button', { name: '새로 시작' }).click(); await page.waitForTimeout(300);
  await page.locator('.bha-slot').first().click(); await page.waitForTimeout(200);
  await page.getByRole('button', { name: '확인' }).click(); await page.waitForTimeout(300);
  await page.locator('.bha-species__card').nth(0).click(); await page.waitForTimeout(300);
  await page.getByRole('button', { name: '시작', exact: true }).click(); await page.waitForTimeout(1800);
  await page.goto(`${url}?test=1`); await page.waitForTimeout(1200);
  await page.getByRole('button', { name: '이어하기' }).click().catch(() => {}); await page.waitForTimeout(1500);
  await page.locator('.bha-prop--outside').first().click(); await page.waitForTimeout(700);
  await page.locator('.bha-worldmap [data-place="adventure"]').first().click(); await page.waitForTimeout(2000);
  await page.getByRole('button', { name: '★1', exact: true }).first().click().catch(() => {}); await page.waitForTimeout(300);
  await page.getByRole('button', { name: '출발', exact: true }).first().click(); await page.waitForTimeout(1800);
}

// 목업 공용 조각 (토큰 색만)
const CSS = `
#r208 { position:absolute; inset:0; pointer-events:none; font-family:var(--bha-font-body); color:var(--bha-text-1); z-index:50; }
#r208 .p { position:absolute; background:color-mix(in srgb, var(--bha-bg-0) 82%, transparent); border:1px solid var(--bha-line-1); border-radius:var(--bha-r-md, 6px); padding:5px 8px; }
#r208 .row { display:flex; align-items:center; gap:6px; font-size:12px; line-height:16px; white-space:nowrap; }
#r208 .bar { flex:1; height:8px; background:var(--bha-bg-1); border:1px solid var(--bha-line-1); border-radius:2px; overflow:hidden; min-width:60px; }
#r208 .bar > i { display:block; height:100%; }
#r208 .ib { position:absolute; width:34px; height:34px; display:grid; place-items:center; background:color-mix(in srgb, var(--bha-bg-0) 82%, transparent); border:1px solid var(--bha-line-1); border-radius:6px; font-size:15px; }
#r208 .tag { position:absolute; left:50%; transform:translateX(-50%); bottom:4px; font-size:11px; color:var(--bha-warn); background:var(--bha-bg-0); padding:2px 8px; border-radius:10px; border:1px solid var(--bha-line-1); }
#r208 .num { font-family:var(--bha-font-num); font-size:11px; }
#r208 .lbl { position:absolute; font-size:11px; color:var(--bha-warn); background:var(--bha-bg-0); border:1px dashed var(--bha-warn); padding:1px 6px; border-radius:4px; }
`;
const bar = (pct, color, txt) => `<div class="bar"><i style="width:${pct}%;background:${color}"></i></div>${txt ? `<span class="num">${txt}</span>` : ''}`;

const WALK = {
  // A (추천): 최소 머리 — 왼쪽 위 = 사냥터·바퀴 한 판, 체력 = 캐릭터 발밑(방·전투와 같은 자리), 오른쪽 위 = 아이콘 2개(가방·일시정지; 귀환하기·도움말은 일시정지 창 안)
  A: (w) => `
    <div class="p" style="left:8px;top:8px;width:170px"><div class="row" style="font-weight:700">웨코문도 외곽 <span style="margin-left:auto" class="num">1바퀴</span></div><div class="row" style="margin-top:4px">${bar(35, 'var(--bha-sp)')}</div></div>
    <div class="ib" style="right:50px;top:8px">✚</div><div class="ib" style="right:8px;top:8px">❚❚</div>
    <div class="p" style="left:${w.cx - 75}px;top:${w.by + 2}px;width:150px;padding:3px 6px"><div class="row">${bar(79, 'var(--bha-player-hp)', '79%')}</div></div>
    <div class="lbl" style="left:190px;top:12px">배부름·광기·컨디션 = 위험할 때만 경고 칩 1개</div>`,
  // B: 예전(C.281) 왼쪽 판 되살림 — 바퀴·체력(길게)·배부름·광기 4줄(컨디션 뺌), 오른쪽 위 아이콘 버튼
  B: () => `
    <div class="p" style="left:8px;top:8px;width:190px">
      <div class="row" style="font-weight:700;margin-bottom:3px">웨코문도 외곽</div>
      <div class="row">↻ ${bar(35, 'var(--bha-sp)', '1바퀴')}</div>
      <div class="row" style="margin-top:3px">✚ ${bar(79, 'var(--bha-player-hp)', '79%')}</div>
      <div class="row" style="margin-top:3px">🍜 ${bar(96, 'var(--bha-hunger)', '96')}</div>
      <div class="row" style="margin-top:3px">◈ ${bar(5, 'var(--bha-risk)', '5')}</div></div>
    <div class="ib" style="right:92px;top:8px">✚</div><div class="ib" style="right:50px;top:8px">⇥</div><div class="ib" style="right:8px;top:8px">❚❚</div>`,
  // C: 아래 띠 — 장면 위는 비우고, 아래 반투명 띠 한 줄에 체력(길게)·배부름·광기 + 아이콘 버튼
  C: () => `
    <div class="p" style="left:8px;right:8px;bottom:8px;display:flex;gap:10px;align-items:center;padding:4px 8px">
      <div class="row" style="width:190px">✚ ${bar(79, 'var(--bha-player-hp)', '79%')}</div>
      <div class="row" style="width:100px">🍜 ${bar(96, 'var(--bha-hunger)')}</div>
      <div class="row" style="width:90px">◈ ${bar(5, 'var(--bha-risk)')}</div>
      <span class="num" style="margin-left:auto">1바퀴</span></div>
    <div class="ib" style="right:50px;top:8px">✚</div><div class="ib" style="right:8px;top:8px">❚❚</div>`,
};
const BATTLE = {
  // A (추천): 블록 바만 크게 — 칸 8개 전체 폭, 막기 = 오른쪽 끝 둥근 버튼, 블록 게이지 = 칸 위 얇은 줄, 소모품·장비 = 있을 때만 작은 아이콘, 색 범례 = 도움말로
  A: (p) => `
    <div style="position:absolute;left:12px;right:12px;top:${p.top + 8}px;height:4px;background:var(--bha-bg-1)"><i style="display:block;width:70%;height:100%;background:var(--bha-sp)"></i></div>
    <div style="position:absolute;left:12px;right:84px;top:${p.top + 22}px;display:grid;grid-template-columns:repeat(8,1fr);gap:6px">${Array.from({ length: 8 }, (_, i) => `<div style="height:64px;border:1px solid var(--bha-line-1);border-radius:6px;background:var(--bha-bg-1);display:grid;place-items:center;font-weight:800">${['허', '교', '탄', '탄', '탄', '교', '탄', '탄'][i]}</div>`).join('')}</div>
    <div style="position:absolute;right:12px;top:${p.top + 22}px;width:64px;height:64px;border-radius:50%;border:2px solid var(--bha-guard);display:grid;place-items:center;font-size:12px;font-weight:700;background:var(--bha-bg-0)">막기</div>
    <div class="lbl" style="left:12px;top:${p.top + 92}px">소모품·장비 버튼 = 끼웠을 때만 막기 위에 작은 아이콘</div>`,
  // B: 예전(C.281) 아래 판 — 범례 + 작은 칩(생성·막기·아이콘) 한 줄 + 칸 8개
  B: (p) => `
    <div class="row" style="position:absolute;left:12px;right:12px;top:${p.top + 8}px;font-size:11px"><span style="color:var(--bha-attack)">● 공격</span><span style="color:var(--bha-void)">● 공허</span><span style="color:var(--bha-warn)">● 콤보</span>
      <span style="margin-left:auto;border:1px solid var(--bha-line-1);border-radius:10px;padding:1px 8px">생성 ▬▬</span><span style="border:1px solid var(--bha-line-1);border-radius:10px;padding:1px 8px">막기 ▬</span></div>
    <div style="position:absolute;left:12px;right:12px;top:${p.top + 30}px;display:grid;grid-template-columns:repeat(8,1fr);gap:6px">${Array.from({ length: 8 }, (_, i) => `<div style="height:62px;border:1px solid var(--bha-line-1);border-radius:6px;background:var(--bha-bg-1);display:grid;place-items:center;font-weight:800">${['허', '교', '탄', '탄', '탄', '교', '탄', '탄'][i]}</div>`).join('')}</div>`,
};

(async () => {
  const b = await chromium.launch();
  const page = await b.newPage({ viewport: { width: 796, height: 384 }, isMobile: true, hasTouch: true });
  await toWalk(page);
  await page.addStyleTag({ content: `${CSS} .bha-exp__hud,.bha-exp__chips,.bha-exp__corner,.bha-toast{visibility:hidden!important}` });
  for (const [k, f] of Object.entries(WALK)) {
    const w = await page.evaluate(() => {
      const L = document.querySelector('.bha-lcd').getBoundingClientRect();
      const s = document.querySelector('.bha-walker__shadow') || document.querySelector('.bha-walker');
      const r = s.getBoundingClientRect();
      return { cx: r.left - L.left + r.width / 2, by: r.bottom - L.top };
    });
    await page.evaluate((html) => { let m = document.getElementById('r208'); if (!m) { m = document.createElement('div'); m.id = 'r208'; document.querySelector('.bha-lcd').append(m); } m.innerHTML = html; }, f(w));
    await page.screenshot({ path: path.join(out, `mock-walk-${k}.png`) });
  }
  await page.evaluate(() => document.getElementById('r208')?.remove());
  await page.locator('.bha-battle').waitFor({ timeout: 60_000 });
  await page.waitForTimeout(2500);
  await page.screenshot({ path: path.join(out, 'mock-battle-now.png') });
  await page.addStyleTag({ content: '.bha-skillpanel > *{visibility:hidden!important}' });
  for (const [k, f] of Object.entries(BATTLE)) {
    const p = await page.evaluate(() => { const L = document.querySelector('.bha-lcd').getBoundingClientRect(); const r = document.querySelector('.bha-skillpanel').getBoundingClientRect(); return { top: r.top - L.top }; });
    await page.evaluate((html) => { let m = document.getElementById('r208'); if (!m) { m = document.createElement('div'); m.id = 'r208'; document.querySelector('.bha-lcd').append(m); } m.innerHTML = html; }, f(p));
    await page.screenshot({ path: path.join(out, `mock-battle-${k}.png`) });
  }
  await b.close();
})();
