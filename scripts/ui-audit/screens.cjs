// UI 검수 화면 목록 (GDD 110장 2, C.182). 각 항목: name, run(h, name). fresh = 슬롯 없이 시작 화면부터.
// 전투 화면은 이번 검수에서 뺐다(C.177 이 전투 버튼 줄을 바꾸는 중). h.explore = 정적 점검 + 탭·ⓘ·목록 고르기 전후 비교(audit.cjs).

/** 방에서 독 [더보기] → 메뉴 항목 */
async function more(h, label) {
  await h.btn('더보기');
  await h.btn(label, { within: '.bha-homedock__tray', ms: 700 });
}

/** 켜고 끄는 칸(스위치·눌림 버튼·체크)을 하나씩 눌러 다른 버튼이 안 움직이는지 보고 다시 눌러 되돌린다 */
async function toggles(h, n, scope = '.bha-lcd', max = 10) {
  const togg = h.page.locator(`${scope} .bha-switch, ${scope} [aria-pressed], ${scope} [role="switch"], ${scope} input[type="checkbox"]`).filter({ visible: true });
  const tn = Math.min(await togg.count(), max);
  for (let j = 0; j < tn; j++) {
    const t = togg.nth(j);
    const lab = ((await t.getAttribute('aria-label').catch(() => '')) || (await t.textContent().catch(() => '')) || '').replace(/\s+/g, ' ').trim().slice(0, 16);
    if (/전체 화면/.test(lab) || /^\d배$/.test(lab)) continue; // 브라우저 전체 화면은 헤드리스에서 막힌다 · 화면 배율(1배·2배)은 바꾸면 전부 커지는 게 맞다
    if (await t.isDisabled()) continue; // '이 슬롯' 범위의 공통 전용 칸 등
    await h.stable(n, `토글 '${lab}' 바꾸기`, () => t.click({ timeout: 3000 }), null, t);
    await h.stable(n, `토글 '${lab}' 되돌리기`, () => t.click({ timeout: 3000 }), null, t);
  }
}

/** 설정 창 4탭 + 탭마다 토글 (소리 탭 음악 목록 넣고 빼기 = 110장 1 의 재발 검사) */
async function settings(h, n) {
  await h.explore(n, { infos: false, onTab: async (lab, sn) => {
    if (!/화면|소리|전투|기타/.test(lab)) return;
    if (await h.has('.bha-settings__scopes')) await h.click('.bha-settings__scopes [data-scope="common"]');
    await toggles(h, sn);
  } });
}

const SCREENS = [
  {
    name: '시작',
    fresh: true,
    async run(h, n) {
      await h.check(n);
      await h.btn('설정', { ms: 600 });
      await settings(h, `${n}/설정`);
      await h.back();
      await h.back();
      await h.btn('새로 시작');
      await h.check(`${n}/슬롯`);
      await h.stable(`${n}/슬롯`, '슬롯 2 고르기', () => h.click('.bha-slot >> nth=1'));
      await h.click('.bha-slot >> nth=0');
      await h.btn('확인');
      await h.check(`${n}/종족`);
      await h.stable(`${n}/종족`, '종족 카드 고르기', () => h.click('.bha-species__card >> nth=1'));
      await h.check(`${n}/종족 확인`);
    },
  },
  {
    name: '방',
    async run(h, n) {
      await h.explore(n, { tabs: false });
      await h.stable(n, '더보기 열기', () => h.btn('더보기'), /homedock__tray/);
      await h.check(`${n}/더보기`, { reachIgnore: /bha-prop|bha-char|bha-room__status|statusinfo/ });
      await h.back();
      await h.stable(n, '먹이 줄 열기', () => h.click('.bha-homedock__carebtn--feed'), /homedock__tray/);
      await h.check(`${n}/먹이 줄`, { reachIgnore: /bha-prop|bha-char|bha-room__status|statusinfo/ });
      await h.back();
      await h.stable(n, '재우기', () => h.click('.bha-homedock__carebtn--sleep'));
      await h.stable(n, '교감', () => h.click('.bha-homedock__carebtn--pet'));
    },
  },
  {
    name: '설정(방)',
    async run(h, n) {
      await more(h, '설정');
      await settings(h, n);
    },
  },
  {
    name: '상태',
    async run(h, n) {
      await h.click('.bha-room__status', { ms: 700 });
      await h.explore(n, { pick: '.bha-lcd .bha-btn--block' });
    },
  },
  {
    name: '가방',
    async run(h, n) {
      await h.click('.bha-prop--chest', { ms: 700 });
      await h.explore(n, { pick: '.bha-lcd .bha-eqslot' });
      // 탭마다 목록 칸 고르기
      const tabs = h.page.locator('.bha-lcd .bha-itemtab').filter({ hasText: /^(장비|슬롯|타일|물건|펫)/ });
      const cnt = await tabs.count();
      for (let i = 0; i < cnt; i++) {
        const lab = ((await tabs.nth(i).textContent()) || '').trim();
        await h.closeLayers();
        await tabs.nth(i).click({ timeout: 4000 });
        await h.wait();
        const cards = h.page.locator('.bha-lcd .bha-itemcard, .bha-lcd .bha-tilecard, .bha-lcd .bha-slotcard');
        if ((await cards.count()) > 1) {
          await h.stable(`${n}/${lab}`, '칸 고르기', () => cards.nth(1).click({ timeout: 3000 }), null, cards.nth(1));
          await h.check(`${n}/${lab}/고른 뒤`);
        }
      }
    },
  },
  {
    name: '상점',
    async run(h, n) {
      await h.click('.bha-prop--shop', { ms: 700 });
      await h.explore(n, { pick: '.bha-lcd .bha-itemcard' });
    },
  },
  {
    name: '책장',
    async run(h, n) {
      await h.click('.bha-prop--book', { ms: 700 });
      await h.explore(n, { pick: '.bha-lcd .bha-mdrow', views: true });
    },
  },
  {
    name: '수련장',
    async run(h, n) {
      await h.click('.bha-prop--altar', { ms: 700 });
      await h.explore(n, { pick: '.bha-lcd .bha-train__card', views: true });
    },
  },
  {
    name: '원정 출발',
    async run(h, n) {
      await h.click('.bha-prop--door', { ms: 900 });
      await h.explore(n, { pick: '.bha-lcd .bha-road__cell', views: true, viewOpts: { 스토리: { pick: '.bha-lcd .bha-mdrow, .bha-lcd .bha-story__ep' }, 탑: { pick: '.bha-lcd .bha-tower__floor, .bha-lcd .bha-mdrow' } } });
      await h.stable(n, '난이도 ★1', () => h.btn('★1', { exact: true }));
      await h.stable(n, '지역 바꾸기', () => h.click('.bha-lcd .bha-btn--small >> nth=1'));
      // 타일 놓기: 카드 고르고 칸 누르기
      await h.stable(n, '타일 카드 고르기', () => h.click('.bha-lcd .bha-tilecard >> nth=0'), null, h.page.locator('.bha-lcd .bha-tilecard').first());
      await h.stable(n, '칸에 놓기', () => h.click('.bha-lcd .bha-road__cell >> nth=2'));
      await h.check(`${n}/놓은 뒤`);
      await h.stable(n, '프리셋 열기', () => h.btn('프리셋', { within: '.bha-plan__sidetabs' }));
      await h.check(`${n}/프리셋`);
      await h.stable(n, '손패로 돌아가기', () => h.btn('손패', { within: '.bha-plan__sidetabs' }));
      await h.check(`${n}/손패`);
    },
  },
  {
    name: '원정 걷기',
    async run(h, n) {
      await h.click('.bha-prop--door', { ms: 900 });
      await h.btn('★1', { exact: true });
      await h.btn('출발', { ms: 1500 });
      await h.check(n, { keys: false });
      await h.explore(`${n}/2`, { tabs: false });
    },
  },
  {
    name: '테스트 패널',
    async run(h, n) {
      await more(h, '테스트');
      await h.explore(n, { maxTabs: 12, views: true });
    },
  },
  {
    name: '도움말',
    async run(h, n) {
      await more(h, '도움말');
      await h.explore(n, { maxTabs: 8 });
    },
  },
  {
    name: '사진',
    async run(h, n) {
      await more(h, '사진');
      await h.explore(n);
    },
  },
  {
    name: '방 빈사·사망',
    async run(h, n) {
      await more(h, '테스트');
      await h.click('.bha-lcd .bha-viewtitle__btn');
      await h.btn('둥지·시간', { within: '.bha-viewtitle__list', role: 'option' });
      const inputs = h.page.locator('.bha-lcd input[type="number"]');
      for (let i = 0; i < Math.min(await inputs.count(), 3); i++) await inputs.nth(i).fill(i === 0 ? '0' : '0');
      await h.btn('적용');
      await h.closeLayers();
      await h.back();
      await h.explore(`${n}/낮은 값`, { tabs: false });
      await more(h, '테스트');
      await h.btn('+48시간');
      await h.closeLayers();
      await h.back();
      await h.explore(`${n}/48시간 뒤`, { tabs: false });
      await h.stable(`${n}/48시간 뒤`, '먹이 누르기', () => h.click('.bha-homedock__carebtn--feed'), /homedock__tray/);
    },
  },
  {
    name: '흡수·결과',
    async run(h, n) {
      // 테스트 속도 ×4 로 ★1 원정 → 첫 승리 뒤 포식 화면 → 귀환 → 결과
      await more(h, '테스트');
      await h.click('.bha-lcd .bha-viewtitle__btn');
      await h.btn('둥지·시간', { within: '.bha-viewtitle__list', role: 'option' });
      await h.btn('×4', { exact: true });
      await h.closeLayers();
      await h.back();
      await h.click('.bha-prop--door', { ms: 900 });
      await h.btn('★1', { exact: true });
      await h.btn('출발', { ms: 1200 });
      await h.page.getByRole('button', { name: '포식하러 가기' }).waitFor({ timeout: 120_000 });
      await h.btn('포식하러 가기', { ms: 900 });
      await h.explore(`${n}/포식`, { tabs: false });
      await h.stable(`${n}/포식`, '둘 다 포식', () => h.btn('둘 다 포식', { ms: 800 }));
      await h.explore(`${n}/포식 2`, { tabs: false, pick: '.bha-lcd .bha-absorbpage button.bha-card, .bha-lcd .bha-absorbpage .bha-slot' });
      // 끝까지 넘기기: 확인 성격의 버튼을 몇 번 누른다
      for (let i = 0; i < 6; i++) {
        const go = h.page.locator('.bha-lcd button.bha-btn--primary').filter({ visible: true }).first();
        if (!(await go.count()) || !(await h.has('.bha-absorbpage'))) break;
        await go.click({ timeout: 3000 }).catch(() => {});
        await h.wait(700);
        if (await h.has('.bha-absorbpage')) await h.check(`${n}/포식 ${i + 3}`, { keys: false });
      }
      await h.page.getByRole('button', { name: '귀환하기' }).waitFor({ timeout: 30_000 });
      await h.check(`${n}/걷기 다시`, { keys: false });
      await h.btn('귀환하기', { ms: 900 });
      for (let i = 0; i < 3 && (await h.has('.bha-lcd [data-dev-layer]')); i++) await h.btn('귀환', { within: '.bha-lcd [data-dev-layer]', ms: 900 }).catch(() => h.back());
      await h.page.locator('.bha-resultpage').waitFor({ timeout: 60_000 });
      await h.explore(`${n}/결과`, { tabs: true });
    },
  },
  {
    name: '슬롯 지우기',
    fresh: true,
    async run(h, n) {
      // 슬롯 하나를 만든 뒤 처음 화면 → 불러오기 → 슬롯 고르기·지우기 (목록에서 하나 빠질 때 버튼이 안 움직여야)
      await h.btn('새로 시작');
      await h.click('.bha-slot >> nth=1');
      await h.btn('확인');
      await h.click('.bha-species__card >> nth=0');
      await h.btn('시작', { exact: true, ms: 1400 });
      await h.btn('더보기');
      await h.btn('처음 화면', { within: '.bha-homedock__tray' });
      await h.btn('예').catch(() => h.btn('처음 화면', { within: '.bha-lcd [data-dev-layer]' }));
      await h.wait(800);
      await h.btn('불러오기');
      await h.check(`${n}/불러오기`);
      await h.click('.bha-slot >> nth=1');
      await h.stable(n, '슬롯 지우기', async () => {
        await h.btn('삭제');
        await h.check(`${n}/지우기 확인 창`);
        await h.btn('지우기', { within: '.bha-lcd [data-dev-layer]' });
      });
      await h.check(`${n}/지운 뒤`);
    },
  },
];

module.exports = { SCREENS };
