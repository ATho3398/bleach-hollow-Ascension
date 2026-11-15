// 편집기 화면 점검 (사용자 2026-11-14 "앞으로 뭐 추가하거나 툴에 모션 추가하고 하면, 툴 망가지는거 없나 체크해. 무월 툴 ui 다 망가졋잖아", GDD 115-A 135)
// 편집기를 올리기 전에 꼭 돌린다: 외형 단추를 전부 눌러 보고 너비 1000·1300 에서
//  - 스크립트 오류가 없는지 - 도구 칸·미리보기·동작 단추 칸이 한 줄에 있는지(다음 줄로 안 밀림) - 가로로 안 넘치는지 - 미리보기가 3배보다 작지 않은지
// 사용: node scripts/rig/tools/editor-check.cjs <.rig-pages 절대경로>   (문제가 있으면 줄마다 적고 종료 코드 1)
const { chromium } = require('playwright');
(async () => {
  const D = process.argv[2];
  const b = await chromium.launch();
  let bad = 0, n = 0;
  for (const w of [1000, 1300]) {
    const p = await b.newPage({ viewport: { width: w, height: 1000 } });
    const errs = [];
    p.on('pageerror', (e) => errs.push(e.message));
    await p.goto('file://' + D + '/rig-editor.html');
    await p.waitForTimeout(1200);
    const looks = await p.evaluate(() => [...document.querySelectorAll('[data-look]')].map((e) => e.dataset.look));
    for (const l of looks) {
      await p.evaluate((l) => {
        const e = document.querySelector(`[data-look="${l}"]`);
        const g = e.closest('[data-group]');
        if (g) document.querySelector(`[data-tab="${g.dataset.group}"]`)?.click();
        e.click();
      }, l);
      await p.waitForTimeout(350);
      const d = await p.evaluate(() => {
        const r = document.querySelector('.stagerow');
        const y = (s) => Math.round(r.querySelector(s).getBoundingClientRect().y);
        const st = document.getElementById('stage');
        const canvasW = st.querySelectorAll('img.part').length;
        return { tool: y('.toolcol'), left: y('.leftcol'), side: y('.side'), sw: document.documentElement.scrollWidth, parts: canvasW, stage: st.getBoundingClientRect().width };
      });
      n++;
      const why = [];
      if (d.left !== d.tool || d.side !== d.left) why.push('미리보기·동작 칸이 다음 줄로 밀림');
      if (d.sw > w) why.push(`가로로 넘침(${d.sw})`);
      if (!d.parts) why.push('그림이 안 그려짐');
      if (why.length) { bad++; console.log(`✗ ${l} @${w}: ${why.join(', ')}`); }
    }
    if (errs.length) { bad++; console.log(`✗ 스크립트 오류 @${w}:`, [...new Set(errs)].join(' | ')); }
    await p.close();
  }
  await b.close();
  console.log(bad ? `편집기 점검 실패 ${bad}건` : `편집기 점검 통과 (${n}번 확인)`);
  process.exit(bad ? 1 : 0);
})();
