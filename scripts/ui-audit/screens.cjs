// UI 검수 화면 목록 (GDD 110장 2, C.182). 각 항목: name, run(h, name). fresh = 슬롯 없이 시작 화면부터.
// 전투 화면은 C.177 배포 뒤 넣었다(마스터 13장 03:2x 지시). h.explore = 정적 점검 + 탭·ⓘ·목록 고르기 전후 비교(audit.cjs).

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
      await h.click(h.page.locator('.bha-lcd .bha-seg__item').filter({ hasText: '×4' }));
      await h.closeLayers();
      await h.back();
      await h.click('.bha-prop--door', { ms: 900 });
      await h.btn('★1', { exact: true });
      await h.btn('출발', { ms: 1200 });
      // 버튼 이름은 종족 설정(absorbActionName)을 따른다 — '포식하러 가기' 등
      await h.page.getByRole('button', { name: /하러 가기$/ }).waitFor({ timeout: 120_000 });
      await h.click(h.page.getByRole('button', { name: /하러 가기$/ }), { ms: 900 });
      await h.explore(`${n}/포식`, { tabs: false });
      await h.stable(`${n}/포식`, '첫 선택(둘 다)', () => h.click('.bha-lcd .bha-absorbpage button.bha-btn--primary', { ms: 800 }));
      await h.explore(`${n}/포식 2`, { tabs: false, pick: '.bha-lcd .bha-cand' });
      // 끝까지 넘기기: 후보 → (슬롯) → 확인 성격의 버튼. 포식 화면이 닫힐 때까지 몇 번
      for (let i = 0; i < 8 && (await h.has('.bha-absorbpage')); i++) {
        const cand = h.page.locator('.bha-lcd .bha-cand').filter({ visible: true });
        const slot = h.page.locator('.bha-lcd .bha-absorbpage .bha-slot').filter({ visible: true });
        const go = h.page.locator('.bha-lcd .bha-absorbpage button.bha-btn--primary:not([disabled])').filter({ visible: true });
        const layerGo = h.page.locator('.bha-lcd [data-dev-layer] button.bha-btn--primary, .bha-lcd [data-dev-layer] button.bha-btn--danger').filter({ visible: true });
        if (await layerGo.count()) {
          await h.check(`${n}/포식 확인 창 ${i}`, { keys: false });
          await layerGo.first().click({ timeout: 3000 }).catch(() => {});
        } else if (await go.count()) await go.first().click({ timeout: 3000 }).catch(() => {});
        else if (await slot.count()) await slot.first().click({ timeout: 3000 }).catch(() => {});
        else if (await cand.count()) await cand.first().click({ timeout: 3000 }).catch(() => {});
        await h.wait(700);
        if (await h.has('.bha-absorbpage')) await h.check(`${n}/포식 ${i + 3}`, { keys: false });
      }
      // 걷기로 돌아오면 귀환. 그 사이 전투·포식이 또 오면 기다리거나 '포식 안 함'
      let checkedWalk = false;
      for (let t = 0; t < 150 && !(await h.has('.bha-resultpage')) && !((await h.has('.bha-lcd .bha-room')) && !(await h.has('.bha-lcd [data-dev-layer]'))); t++) {
        const home = h.page.getByRole('button', { name: '귀환하기' }).filter({ visible: true });
        const eat = h.page.getByRole('button', { name: /하러 가기$/ }).filter({ visible: true });
        const layerGo = h.page.locator('.bha-lcd [data-dev-layer] button.bha-btn--primary, .bha-lcd [data-dev-layer] button.bha-btn--danger').filter({ visible: true });
        const nestHome = h.page.getByRole('button', { name: '귀환', exact: true }).filter({ visible: true });
        if (await layerGo.count()) {
          await h.check(`${n}/확인 창 ${(await layerGo.first().textContent())?.trim()}`, { keys: false });
          await layerGo.first().click({ timeout: 3000 }).catch(() => {});
        } else if (await nestHome.count()) {
          await h.check(`${n}/둥지 도착`, { keys: false });
          await h.stable(`${n}/둥지 도착`, '드래프트 타일 고르기', () => h.click(h.page.locator('.bha-lcd .bha-draft__card, .bha-lcd [data-draft]').first()).catch(() => {}));
          await nestHome.first().click({ timeout: 3000 }).catch(() => {});
        } else if (await home.count()) {
          if (!checkedWalk) await h.check(`${n}/걷기 다시`, { keys: false });
          checkedWalk = true;
          await home.first().click({ timeout: 3000 }).catch(() => {});
        } else if (await eat.count()) {
          await eat.first().click({ timeout: 3000 }).catch(() => {});
          await h.wait(800);
          await h.click(h.page.locator('.bha-lcd .bha-absorbpage button.bha-btn--lg').last()).catch(() => {}); // 마지막 = '… 안 함'
        }
        await h.wait(1000);
      }
      // 결과: 원정 결과 화면(.bha-resultpage)이 있으면 그것, 아니면 방 위 귀환 결과 창까지 위에서 점검했다
      if (await h.has('.bha-resultpage')) await h.explore(`${n}/결과`, { tabs: true });
    },
  },
  {
    name: '전투',
    async run(h, n) {
      await h.click('.bha-prop--door', { ms: 900 });
      await h.btn('★1', { exact: true });
      await h.btn('출발', { ms: 600 });
      await h.page.locator('.bha-battle').waitFor({ timeout: 60_000 });
      await h.wait(2600); // 조우 연출
      const inBattle = async () => (await h.page.locator('.bha-battle').count()) > 0 && !(await h.has('.bha-battle .bha-overlay'));
      await h.check(n, { keys: false });
      // 숫자 칸 흔들기: 실제로 바뀌는 글자(남은 초 148 → 9, 소모품 ×3 → 씀, 장비 쿨다운 12 → 3)를 직접 넣어 다른 버튼이 움직이는지.
      // 15초 관찰로는 세 자리 → 한 자리·소모품 사용이 안 오므로 글자만 바꿔 본다 (엔진 상태는 안 건드림 — 다음 프레임에 원래 값으로 돌아온다)
      // 한 번의 실행 안에서(그 사이 화면 갱신 없이) 글자 넣기 → 재기 → 바꾸기 → 재기. 칸이 비어 있는 상태(소모품·장비 없음)는 그 상태 그대로 둔다
      const moved = await h.page.evaluate(() => {
        const t = document.querySelector('.bha-v2time b');
        const it = document.querySelector('.bha-v2role--item:not(.is-disabled) .bha-v2role__meta, .bha-v2role--item .bha-v2role__meta:not(:empty)');
        const g = document.querySelector('.bha-v2role--gear .bha-v2role__meta');
        const btns = [...document.querySelectorAll('.bha-lcd button')];
        const pos = () => btns.map((e) => { const r = e.getBoundingClientRect(); return [r.x, r.y, r.width]; });
        const set = (a, b, c) => { if (t) t.textContent = a; if (it) it.textContent = b; if (g) g.textContent = c; };
        const orig = [t?.textContent ?? '', it?.textContent ?? '', g?.textContent ?? ''];
        set('148', '×3', '12');
        const p1 = pos();
        set('9', '씀', '3');
        const p2 = pos();
        set(...orig); // 되돌려 두어야 다음 시간 관찰이 이 흔들기를 잡지 않는다
        return btns.map((e, i) => [e.getAttribute('aria-label') || e.textContent.trim(), p2[i][0] - p1[i][0], p2[i][1] - p1[i][1]]).filter(([, dx, dy]) => Math.abs(dx) > 1.5 || Math.abs(dy) > 1.5).map(([k, dx, dy]) => `${String(k).slice(0, 20)} (${Math.round(dx)}, ${Math.round(dy)})`);
      });
      for (const m of moved) h.report({ kind: '상태 바꿈에 버튼 이동', key: m, detail: '숫자 칸 바꿈(남은 초 148→9·장비 쿨다운 12→3)' }, n);
      await h.watch(n, 15_000, inBattle, /bha-block\b/); // 블록 바의 블록은 생기고 쓰이며 흘러가는 게 규칙(3-5)
      if (await inBattle()) {
        await h.stable(n, '로그 열기', () => h.btn('로그'));
        await h.check(`${n}/로그`, { keys: false });
        await h.stable(n, '로그 닫기', () => h.btn('로그'));
        await h.stable(n, '일시정지', () => h.btn('일시정지'));
        await h.check(`${n}/일시정지`);
      }
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
