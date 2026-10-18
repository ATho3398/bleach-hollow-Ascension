/* ==========================================================================
   데모 도우미 (screens/*.html 공용) — 실제 게임에는 넣지 않는다.
   - 오른쪽 가장자리 "상태" 탭: 상태 전환 · 종족 테마 토글 · 종족 문구 표시
   - [data-sp="키"] 요소의 글자를 종족 설정 값으로 바꾼다 (= 실제 앱에서 종족 설정이 넣는 값)
   - [data-show="상태1 상태2"] 요소는 그 상태일 때만 보인다
   - 페이지에서 window.BHA_DEMO = { title, states:[[id,label],...], initial, onState(id) } 를 정의
   ========================================================================== */
(function () {
  /* ---- 종족 설정 값 (HANDOFF: 이 텍스트들은 종족 설정에서 온다) ---- */
  var SPECIES = {
    hollow: {
      species: '호로', nest: '둥지', ground: '웨코문도', slot: '본체 슬롯', risk: '광기', stab: '자아',
      absorb: '포식', absorbAble: '포식 가능', roleAtk: '파괴', roleGrd: '가면', roleHeal: '재생', special: '세로',
      stored: '응축 일격', sp: '영력', chain: '체인', defeat: '가면이 깨져 쇠약',
      care1: '먹이 주기', care2: '재우기', care3: '쓰다듬기',
      stage1: '호로', stage2: '길리안', stage3: '아쥬커스', stage4: '바스트로데', stage5: '아란칼',
      riskOver: '광기가 한계를 넘었다',
      atkAbbr: '찢는 발톱', grdAbbr: '굳은 가면', healAbbr: '재생 체액', basicAbbr: '기본 타격',
      evo1: '삼킨 영혼들이 몸 안에서 요동친다…', evo2: '가면에 금이 간다…', evo3: '껍질이 깨지고, 새 몸이 드러난다.',
      grade1: '에스파다 No.10', grade2: '에스파다 No.7', grade3: '에스파다 No.4', grade4: '에스파다 No.1'
    },
    shinigami: {
      species: '사신', nest: '대원실', ground: '현세 순찰 구역', slot: '참백도 슬롯', risk: '호로화', stab: '영압 안정도',
      absorb: '정화 흡수', absorbAble: '정화 흡수 가능', roleAtk: '참격', roleGrd: '귀도', roleHeal: '회도', special: '섬광',
      stored: '응축 베기', sp: '영력', chain: '체인', defeat: '영력 고갈',
      care1: '식사·영력 보급', care2: '재우기', care3: '참백도 손질',
      stage1: '혼백', stage2: '영술원 학생', stage3: '견습 대원', stage4: '평대원', stage5: '수석 대원',
      riskOver: '호로화가 한계를 넘었다',
      atkAbbr: '일섬', grdAbbr: '결계 귀도', healAbbr: '회도 치료', basicAbbr: '기본 베기',
      evo1: '정화한 영혼들의 영압이 몸에 스며든다…', evo2: '참백도가 낮게 울린다…', evo3: '영압이 가라앉고, 한 단계 올라섰다.',
      grade1: '제10석', grade2: '제7석', grade3: '제4석', grade4: '제1석'
    }
  };
  window.BHA_SPECIES = SPECIES;
  var root = document.documentElement;
  var cfg = window.BHA_DEMO || { states: [] };
  var theme = 'hollow';
  try { theme = localStorage.getItem('bha-theme') || 'hollow'; } catch (e) {}
  var state = cfg.initial || (cfg.states[0] && cfg.states[0][0]);

  function applySpecies() {
    var t = SPECIES[theme] || SPECIES.hollow;
    document.querySelectorAll('[data-sp]').forEach(function (n) {
      var k = n.getAttribute('data-sp'); if (t[k] == null) return;
      var tpl = n.getAttribute('data-sp-tpl');
      n.textContent = tpl ? tpl.replace('{}', t[k]) : t[k];
    });
  }
  window.bhaSp = function (k) { return (SPECIES[theme] || SPECIES.hollow)[k]; };
  window.bhaApplySpecies = applySpecies;

  function setTheme(t) {
    theme = t; root.setAttribute('data-bha-theme', t);
    try { localStorage.setItem('bha-theme', t); } catch (e) {}
    applySpecies();
    panel && panel.querySelectorAll('[data-demo-theme]').forEach(function (b) { b.setAttribute('aria-pressed', String(b.dataset.demoTheme === t)); });
    if (cfg.onTheme) cfg.onTheme(t);
  }
  function setState(id) {
    state = id; root.setAttribute('data-demo-state', id);
    document.querySelectorAll('[data-show]').forEach(function (n) {
      n.hidden = n.getAttribute('data-show').split(/\s+/).indexOf(id) < 0;
    });
    if (cfg.onState) cfg.onState(id);
    applySpecies();
    panel && panel.querySelectorAll('[data-demo-state-btn]').forEach(function (b) { b.setAttribute('aria-pressed', String(b.dataset.demoStateBtn === id)); });
    try { history.replaceState(null, '', '#' + id); } catch (e) {}
  }
  window.bhaSetState = setState;

  /* ---- 패널 ---- */
  var panel = document.createElement('aside');
  panel.className = 'demo-panel'; panel.setAttribute('aria-label', '데모 제어');
  panel.innerHTML =
    '<div class="demo-panel__head"><b>' + (cfg.title || '화면 데모') + '</b><button class="demo-x" type="button" aria-label="닫기">×</button></div>' +
    '<div class="demo-panel__sec"><span class="demo-cap">종족 테마</span><div class="demo-row">' +
    '<button type="button" data-demo-theme="hollow">호로</button><button type="button" data-demo-theme="shinigami">사신</button></div></div>' +
    (cfg.states.length ? '<div class="demo-panel__sec"><span class="demo-cap">상태</span><div class="demo-list">' +
      cfg.states.map(function (s) { return '<button type="button" data-demo-state-btn="' + s[0] + '">' + s[1] + '</button>'; }).join('') + '</div></div>' : '') +
    '<div class="demo-panel__sec"><label class="demo-check"><input type="checkbox" id="demoSpMark"> 종족 설정에서 오는 문구 표시</label></div>' +
    '<div class="demo-panel__sec demo-row"><a href="../index.html">← 패키지 처음으로</a></div>';
  var fab = document.createElement('button');
  fab.type = 'button'; fab.className = 'demo-fab'; fab.textContent = '상태';
  fab.setAttribute('aria-label', '데모 상태 바꾸기');
  document.body.appendChild(fab); document.body.appendChild(panel);
  fab.addEventListener('click', function () { panel.classList.toggle('is-open'); });
  panel.querySelector('.demo-x').addEventListener('click', function () { panel.classList.remove('is-open'); });
  panel.querySelectorAll('[data-demo-theme]').forEach(function (b) { b.addEventListener('click', function () { setTheme(b.dataset.demoTheme); }); });
  panel.querySelectorAll('[data-demo-state-btn]').forEach(function (b) { b.addEventListener('click', function () { setState(b.dataset.demoStateBtn); }); });
  panel.querySelector('#demoSpMark').addEventListener('change', function (e) { root.classList.toggle('demo-mark-sp', e.target.checked); });

  var hash = (location.hash || '').slice(1);
  if (hash && cfg.states.some(function (s) { return s[0] === hash; })) state = hash;
  setTheme(theme);
  if (state) setState(state);
})();
