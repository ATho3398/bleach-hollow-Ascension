# BHA UI 핸드오프 — 블리치 할로우 어센션

버전 0.1 · 2026-10-18 · 대상: 순수 TypeScript + `el(tag, className, text)` 헬퍼로 DOM을 만드는 현재 코드

이 패키지는 게임의 첫 비주얼 아이덴티티입니다. 프레임워크, 빌드 도구, 외부 이미지 파일이 하나도 없습니다. HTML과 CSS 변수만으로 되어 있어서 클래스 이름과 DOM 구조를 그대로 옮기면 됩니다. 각 화면 HTML 파일 맨 위 주석에 그 화면이 쓰는 **샘플 데이터 필드**가 정리돼 있습니다.

---

## 1. 패키지 구조

```
bha-design/
├─ HANDOFF.md                  이 문서
├─ index.html                  패키지 처음 화면 (모든 화면 링크)
├─ handoff.html                이 문서를 브라우저에서 보기 좋게 렌더링
├─ design-system/
│  ├─ tokens.css               공통 토큰 (의미 색·타이포·간격·모션·z-index·크기) + 글꼴 @font-face
│  ├─ theme-hollow.css         호로 테마 토큰 (:root 기본값 겸용)
│  ├─ theme-shinigami.css      사신 테마 토큰
│  └─ base.css                 리셋 · 화면 틀(.bha-stage/.bha-app) · 타이포 · 레이아웃 유틸 · 아이콘 · 포커스 · reduced-motion
├─ components/
│  ├─ components.css           모든 컴포넌트 (32개 블록)
│  └─ index.html               디자인 시스템 시트: 토큰 · 아이콘 · 컴포넌트 상태 · 호로/사신 비교 (카드마다 "HTML 보기")
├─ icons/
│  ├─ sprite.svg               <symbol> 스프라이트 (아이콘 69 + 적 실루엣 2)
│  ├─ sprite.js                (데모용) 스프라이트를 문서에 인라인으로 꽂는 스크립트
│  └─ i-*.svg, foe-*.svg       개별 파일
├─ fonts/                      PretendardVariable.woff2, Hahmlet 600/800 (한글 2,600자 + 라틴)
└─ screens/
   ├─ screens.css              화면 단위 레이아웃 (배치만)
   ├─ start.html               1 시작(종족 선택)
   ├─ settings.html            2 설정(조작 판정)
   ├─ help.html                3 도움말
   ├─ battle.html              12 전투 + 4 튜토리얼 오버레이(8장면)
   ├─ nest.html                5 둥지 + 6 진화 패널
   ├─ evolve.html              6 진화 연출
   ├─ dex-forms.html           7 진화체 도감
   ├─ dex-titles.html          8 칭호 도감 + 해금 토스트
   ├─ expedition.html          9 원정
   ├─ breakthrough.html        10 한계 돌파
   ├─ result.html              11 원정 결과
   ├─ absorb.html              13 흡수 3단계
   ├─ practice.html            14 전투 연습 + 연습 결과
   ├─ overlays.html            공용 오버레이 (토스트 · 모달)
   ├─ fit-check.html           기기 크기 확인 (360×740 / 390×844 / 430×932 / 데스크톱)
   └─ _demo/                   데모 전용 — 게임에 넣지 않음
      ├─ demo.js / demo.css    오른쪽 "상태" 탭: 상태 전환 · 종족 테마 · 종족 문구 표시
      └─ kit.js                블록·블록 바·상태 바의 DOM 생성 참고 구현 (TS로 옮길 때 그대로 따라 하면 됨)
```

화면 데모 보는 법: 각 화면 오른쪽 가장자리의 **"상태"** 탭을 누르면 상태 목록, 호로/사신 테마 토글, "종족 설정에서 오는 문구 표시" 체크가 나옵니다. URL 끝에 `#상태id`를 붙이면 바로 그 상태로 열립니다(예: `battle.html#cast`).

---

## 2. 사용법

### 2-1. 불러오는 순서

```html
<html lang="ko" data-bha-theme="hollow">
  <link rel="stylesheet" href="design-system/tokens.css">
  <link rel="stylesheet" href="design-system/theme-hollow.css">
  <link rel="stylesheet" href="design-system/theme-shinigami.css">
  <link rel="stylesheet" href="design-system/base.css">
  <link rel="stylesheet" href="components/components.css">
  <link rel="stylesheet" href="screens/screens.css">
```

- `body` 바로 아래에 `<div class="bha-stage">`, 그 안에 화면 래퍼 `<main class="bha-app">`. 480px을 넘는 화면에서는 가운데 정렬되고 양옆은 어두운 장식 배경이 됩니다.
- 스크롤 없는 한 화면(전투·원정)은 `bha-app bha-app--fixed`.

### 2-2. 아이콘

- `icons/sprite.svg`의 내용(`<svg style="display:none">…</svg>`)을 `index.html`의 `<body>` 맨 앞에 **그대로 붙여 넣는 것**을 권장합니다. 외부 파일 `<use href="sprite.svg#…">`는 file:// 환경이나 일부 웹뷰에서 막힐 수 있습니다.
- 사용: `<svg class="bha-icon" aria-hidden="true"><use href="#i-attack"/></svg>`
- 크기 변형: `bha-icon--sm`(16) `--md`(20) 기본(24) `--lg`(32). 선 굵기는 테마 토큰 `--bha-icon-stroke`를 따라갑니다(호로 2, 사신 1.5).
- TS 예: `const s = document.createElementNS(SVG_NS,'svg'); s.classList.add('bha-icon'); const u = document.createElementNS(SVG_NS,'use'); u.setAttribute('href','#i-attack'); s.append(u);`

### 2-3. 글꼴

- 본문 Pretendard Variable, 제목 Hahmlet(`--bha-font-display`). `fonts/` 폴더를 함께 배포하면 외부 요청이 없습니다. 실패하면 시스템 글꼴(Apple SD Gothic Neo, Noto Sans KR, Malgun Gothic)로 대체됩니다.
- CDN을 쓰려면 `tokens.css` 안의 주석(jsDelivr 동적 서브셋)으로 바꿔도 됩니다.
- Hahmlet 한글 서브셋은 2,600자 남짓이라, 드문 글자는 본문 글꼴로 대체됩니다. 제목·연출에만 쓰세요.

---

## 3. 종족 테마 적용 규칙

1. 루트에 속성 하나: `document.documentElement.dataset.bhaTheme = 'hollow' | 'shinigami'`
2. 테마 파일은 **테마 토큰만** 덮어씁니다. 레이아웃·컴포넌트 CSS는 테마를 모릅니다.

| 테마 토큰 | 뜻 | 호로 | 사신 |
|---|---|---|---|
| `--bha-backdrop` `--bha-bg-0~3` | 바탕 4단 | 붉은 기 도는 숯 | 먹 + 남빛 |
| `--bha-line-1~2` | 선 | 잿빛 갈색 | 남회색 |
| `--bha-text-1~3` | 글자 3단 (bg-1 위 AA 이상) | 뼈백색 | 차가운 백색 |
| `--bha-accent` `--accent-hi` `--accent-soft` | 포인트 (위험·선택·해방에만) | 크림슨 | 은청색 |
| `--bha-primary-bg/-ink/-line` | 주 버튼 | 뼈 판 + 먹 글자 | 은빛 판 + 먹 글자 |
| `--bha-r-xs~lg` | 모서리 | 3/7/11/16 둥글게 | 2/3/4/6 반듯하게 |
| `--bha-icon-stroke` | 아이콘 선 굵기 | 2 | 1.5 |
| `--bha-pattern` `--bha-pattern-size` | 배경 질감 (CSS 안 SVG) | 가면 균열 | 마름모 격자 |
| `--bha-vignette` `--bha-focus` | 위쪽 은은한 빛, 포커스 링 | 크림슨 | 은청 |

**3번째 종족 추가**: `theme-hollow.css`를 복사해 `[data-bha-theme="새이름"]`으로 바꾸고 값만 채웁니다. 의미 색(공격·막기·회복·SP·공허·리스크·계통·타일)은 공통이라 건드리지 않습니다.

부분 미리보기: 시작 화면의 종족 카드처럼, 아무 요소에나 `data-bha-theme`을 붙이면 그 안만 그 테마가 됩니다.

### 3-1. 종족 설정에서 오는 텍스트 (data-sp)

샘플 HTML에서 `data-sp="키"`가 붙은 글자는 **종족 설정 값**입니다(데모 패널의 "종족 설정에서 오는 문구 표시"를 켜면 점선으로 보입니다). `data-sp-tpl="{}로"`는 조사·문장 틀입니다.

| 키 | 호로 | 사신 | 쓰는 곳 |
|---|---|---|---|
| species | 호로 | 사신 | 연습 제목, 더보기 |
| nest | 둥지 | 대원실 | 둥지 제목, [둥지로] 버튼, 원정 둥지 칸, 도움말 |
| ground | 웨코문도 | 현세 순찰 구역 | 둥지 기록 줄, 원정 머리, 조우 |
| stage1~5 | 호로…아란칼 | 혼백…수석 대원 | 진화 패널, 연출, 도감 탭 |
| slot | 본체 슬롯 | 참백도 슬롯 | 특성 패널, 원정 요약, 흡수 |
| risk | 광기 | 호로화 | 리스크 바, 결과, 흡수, 튜토리얼 |
| riskOver | 광기가 한계를 넘었다 | 호로화가 한계를 넘었다 | 한계 돌파 제목 |
| stab | 자아 | 영압 안정도 | 안정 수치 바, 돌보기 |
| absorb / absorbAble | 포식 / 포식 가능 | 정화 흡수 / 정화 흡수 가능 | 흡수 화면, 승리 오버레이, 진화 |
| roleAtk / roleGrd / roleHeal | 파괴 / 가면 / 재생 | 참격 / 귀도 / 회도(임시) | 전투 범례 |
| special | 세로 | 섬광(임시) | 필살 블록 이름, SP 알림 |
| stored | 응축 일격(임시) | 응축 베기(임시) | 저장 필살기 |
| sp | 영력 | 영력 | SP 바 |
| defeat | 가면이 깨져 쇠약 | 영력 고갈 | 패배 제목, 쇠약 알림 |
| care1~3 | 먹이 주기 / 재우기 / 쓰다듬기 | 식사·영력 보급 / 재우기 / 참백도 손질 | 돌보기 |
| evo1~3 | 진화 연출 줄 | 진화 연출 줄 | 진화 연출 (제안 문구) |
| grade1~4 | 에스파다 No.10/7/4/1 | 제10석/7석/4석/1석(임시) | 칭호 도감 등급 |
| atkAbbr 등 | 블록 약어 샘플 | 블록 약어 샘플 | 블록 (실제로는 특성 데이터) |

> **조사 주의**: 종족 값에 따라 받침이 달라집니다(둥지**로** / 대원실**로**는 같지만, "{적}과(와)"처럼 받침에 따라 갈리는 곳이 있음). 지금 코드의 "과(와)" 병기 방식을 유지하거나, 받침 판별 헬퍼를 두세요.

> 사신 쪽 **회복 이름, 필살 블록 이름, 저장 필살기 이름**은 원래 표에서 비어 있던 항목이라, 샘플을 채우려고 임시로 붙인 값입니다. 확정되면 종족 설정만 바꾸면 됩니다.

---

## 4. 토큰 지도 (tokens.css)

| 분류 | 토큰 | 값 / 메모 |
|---|---|---|
| 글자 크기 | `--bha-fs-xs/sm/md/lg/xl/2xl/3xl/4xl/5xl` | 12/13/14/16/18/22/28/36/48. 최소 12, 핵심 수치 14 이상 |
| 글꼴 | `--bha-font-body` `--bha-font-display` `--bha-font-num` | 숫자는 `.bha-num` 또는 `font-variant-numeric: tabular-nums` |
| 간격 | `--bha-sp-1~10` | 2/4/6/8/12/16/20/24/32/48 |
| 크기 | `--bha-touch` 44 · `--bha-app-w` 480 · `--bha-gutter` 16 · `--bha-block-h` 68 · `--bha-bar-h` 10 · `--bha-bar-h-lg` 14 · `--bha-drag-lift` 28 | |
| 역할 색 | `--bha-attack` #e5484d · `--bha-guard` #2fb36b · `--bha-heal` #3e8bff · `--bha-sp` #d9a441 · `--bha-risk` #ff4fd8 · `--bha-void` #170d1f | 각 `-ink`(블록 위 글자) |
| 생활 색 | `--bha-hunger` 호박 · `--bha-cond` 하늘 · `--bha-stab` 민트 · `--bha-weak` 금 | |
| 전투 보조 | `--bha-cast` 강공격 예고 · `--bha-chain2` 노랑 · `--bha-chain3` 주황 · `--bha-insert` 삽입 막대 파랑 · `--bha-seal` 봉인 보라 | |
| 알림 | `--bha-good` `--bha-warn` `--bha-danger` `--bha-rare` | 글자용, AA 확인 |
| 계통 | `--bha-lin-a~e` | A 원 / B 삼각 / C 사각 / D 마름모 / E 육각 (색 + 모양) |
| 타일 | `--bha-tile-prey/elite/env/rest` | 먹잇감 둥지 / 강적 소굴 / 환경 / 휴식 |
| 그림자·글로우 | `--bha-shadow-1~3` `--bha-glow-sp/risk/chain2/chain3/cast` | |
| 모션 | `--bha-dur-1~5` 90/160/260/420/900ms · `--bha-ease-out` `--bha-ease-in` `--bha-ease-snap` | transform·opacity 위주 |
| 층 | `--bha-z-base 0 · raised 10 · sticky 20 · drag 50 · float 60 · flash 70 · toast 80 · overlay 90 · modal 95 · tutorial 100` | |

---

## 5. 컴포넌트 지도 (components.css)

상태는 `is-*`, 변형은 `--mod`. 모든 색은 토큰에서만 가져옵니다.

| # | 컴포넌트 | 루트 클래스 | 변형 | 상태 | JS가 넣는 변수 |
|---|---|---|---|---|---|
| 1 | 버튼 | `.bha-btn` | `--primary --danger --ghost --small --icon --lg --block` | `:active/.is-pressed` `:disabled/.is-disabled` `:focus-visible` `.is-on` | — |
| 2 | 칩 · 태그 · 계통 | `.bha-chip` `.bha-tag` `.bha-lin` | 칩 `--weak --rare --danger --seal --guard --pattern` · 태그 `--provisional --kind --elite --normal` · 계통 `--a~e` | — | — |
| 3 | 상태 바 | `.bha-meter` | `--hunger --cond --stab --risk --enemy --player --sp --cast --stored` · `--compact --lg --thin` | `.is-danger .is-full .is-burst` | `--fill` `--ghost` `--zone` (0~1) |
| 4 | 탭 · 세그먼트 · 하단 내비 | `.bha-seg` `.bha-tabbar` | `--sm --stack` | `[aria-selected=true]` / `.is-active` | — |
| 5 | 패널 | `.bha-panel` | `--raised --inset --accent --flat` | — | — |
| 6 | 알림 | `.bha-notice` | 기본 · `--warn --good --rare --danger --risk` | — | — |
| 7 | 토스트 | `.bha-toast` | — | `.is-in .is-out` | — |
| 8 | 오버레이 · 모달 | `.bha-overlay` `.bha-modal` | `--clear` · 앱 안쪽 `--in-app` | — | — |
| 9 | 정보 표 | `.bha-info` (dl) | 행 `--em --good --bad --stack` | — | — |
| 10 | 덱 행 | `.bha-deckrow` | — | `.is-zero` | `--tile` |
| 11 | 슬롯 칸 | `.bha-slots` `.bha-slot` · `.bha-setbonus` | `--filled --empty --locked` + `.bha-lin--*` | `.is-target .is-selected .is-new` | — |
| 12 | 후보 선택 | `.bha-cand` · `.bha-pips` | + `.bha-lin--*` | `.is-selected .is-pressed` · 핍 `.is-on .is-next` | — |
| 13 | 슬라이더 | `.bha-slider` | — | `:focus-visible` | `--pct` (0~1) |
| 14 | 진행 점 | `.bha-dots` | — | 점 `.is-done .is-active` | — |
| 15 | 아코디언 | `details.bha-acc` | — | `[open]` | — |
| 16 | 범례 | `.bha-legend` | 항목 `--attack --guard --heal --special --void` | — | — |
| 17 | **블록** | `.bha-block` | `--attack --guard --heal --basic --special --void` | `.is-chain2 .is-chain3 .is-weak .is-pressed .is-dragging .is-nudge-l/-r .is-held .is-sealed .is-disabled .is-cue .is-popin .is-fire` | `--drag-x` `--drag-y` (px) |
| 18 | **블록 바** | `.bha-tray` | — | `.is-sealed .is-paused .is-held` | 묶음 `--start --len`, 삽입 막대 `--at` |
| 19 | **저장 필살기** | `.bha-stored` | — | `.is-ready .is-full .is-pressed :disabled` | `--fill` |
| 20 | **원형 길** | `.bha-ring` | 칸 `--nest`, 슬롯 `--prey --elite --env --rest` | 칸 `.is-past .is-current .is-event` · 슬롯 `.is-has .is-can .is-past` | 칸·슬롯 `--i`, 표식·링 `--pos` |
| 21 | 타일 칩 | `.bha-tilechip` | `--prey --elite --env --rest` | `.is-selected :disabled` | — |
| 22 | 플로팅 숫자 | `.bha-float` | `--attack(.is-crit) --guard --heal --void --chain --chain3` | — | left/top |
| 23 | 사건 로그 | `.bha-log` | 줄 `--attack --guard --heal --void --chain --cast` | 줄 `.is-new` | — |
| 24 | 강공격 예고 | `.bha-cast` | — | `.is-blocked` | `--fill` (2초간 0→1) |
| 25 | 적 실루엣 | `.bha-foe` · `.bha-edgeflash` | 번쩍임 `--void --hit` | `.is-hit .is-casting .is-guard` · 번쩍임 `.is-on` | `--aura` (약점 계통 색) |
| 26 | 화면 머리 | `.bha-topbar` | — | — | — |
| 27 | 행동 독 | `.bha-dock` | `--above-tabbar` · 줄 `--two` · 정보 `--warn` | — | — |
| 28 | 계통 누적 막대 | `.bha-linbar` | 범례 항목 `.bha-lin--*` | 항목 `.is-zero .is-lead` | 조각 `--n` (횟수) |
| 29 | 돌보기 | `.bha-care` | 버튼 `--feed --sleep --pet` | `:disabled .is-pressed` | — |
| 30 | 진화체 카드 | `.bha-formgrid` `.bha-formcard` | `--unknown --base` | `.is-current` | — |
| 31 | 칭호 행 | `.bha-titlelist` `.bha-titlerow` | `--unlocked --locked --hidden` | — | — |
| 32 | 바텀 시트 · 결과 제목 | `.bha-sheet` `.bha-result` | 결과 `--win --lose` | — | — |

화면 전용 레이아웃(`screens.css`): `.bha-battle__*` `.bha-battle-ov` `.bha-tut__*` `.bha-nest__*` `.bha-evo__*` `.bha-owned` `.bha-menu` `.bha-evolve__*` `.bha-exp__*` `.bha-break__*` `.bha-foecard` `.bha-absorb__actions` `.bha-steps` `.bha-practice__filters` `.bha-foelist/.bha-foerow` `.bha-start__*` `.bha-species__*` `.bha-press` `.bha-dragprev` `.bha-help__*`.

### 5-1. 블록 DOM (가장 중요)

```html
<div class="bha-block bha-block--attack is-chain2 is-weak" role="button" tabindex="0" aria-label="찢는 발톱">
  <span class="bha-block__pips"><i></i><i></i><i></i></span>   <!-- 공격·막기·회복만 -->
  <span class="bha-block__icon"><svg class="bha-icon"><use href="#i-attack"/></svg></span>
  <b class="bha-block__abbr">찢는 발톱</b>                      <!-- 특성 이름 약어: 2줄 × 2~4자 -->
  <span class="bha-block__weak"><svg class="bha-icon"><use href="#i-weak"/></svg></span>
</div>
```

- 역할 구분 = **색 + 아이콘 + 표면 무늬**(공격 사선 / 막기 가로 판 / 회복 점 / 필살 금색 광택 / 공허 검은 구멍 + 마젠타 테두리 맥동).
- 약어는 칸 폭 44px 기준 **2줄 × 2~4자**. 더 길면 잘리므로(`-webkit-line-clamp: 2`) 특성 데이터에 약어 필드를 따로 두는 것을 권장합니다.

### 5-2. 블록 바 DOM

```html
<div class="bha-tray [is-sealed|is-paused|is-held]">
  <div class="bha-tray__grid">
    <div class="bha-tray__cell">…블록 또는 비어 있음…</div>  × 8  (n번째 칸은 CSS가 n열에 고정)
    <div class="bha-tray__run [bha-tray__run--chain3] [is-fire]" style="--start:1;--len:2">
      <span class="bha-tray__runlabel"><svg class="bha-icon"><use href="#i-chain-2"/></svg>체인2</span>
    </div>
    <i class="bha-tray__insert [bha-tray__insert--end]" style="--at:3"></i>   <!-- 드래그 중에만 -->
  </div>
  <div class="bha-tray__veil"><svg class="bha-icon"><use href="#i-seal"/></svg>봉인 — 블록 생성 정지 3.0초</div>
</div>
<p class="bha-tray__note [is-held]">…들었다 놓았다 — 사용하지 않음…</p>
```

- 칸 폭 = 바 폭 ÷ 8. 전투 화면에서 바는 좌우 4px까지 넓어지므로(`.bha-battle__controls .bha-tray`) 360px 화면에서 칸이 44px이 됩니다.
- 묶음(`.bha-tray__run`)과 삽입 막대는 칸과 같은 그리드 줄에 겹쳐 놓입니다. JS는 시작 칸과 길이만 넣으면 됩니다.
- 드래그 중인 블록: `is-dragging` + `--drag-x/--drag-y`(손가락 이동량). CSS가 자동으로 28px 위로 띄우고 살짝 기울입니다. 원래 칸은 `.bha-tray__cell.is-origin`(점선), 밀려나는 이웃 블록은 `is-nudge-l/-r`.
- 강공격 예고 중에는 막기 블록에 `is-cue`(초록 고리 + 위 화살표)를 붙이면 "이걸 눌러라"가 바로 보입니다.

### 5-3. 원형 길

- `.bha-ring`은 `container-type: inline-size`라서 칸 위치를 `cqw` 단위 각도로 CSS가 계산합니다. 칸 `--i`(0~11, 0=둥지), 슬롯 `--i`(1~11), 표식 `.bha-ring__walker`와 지난 길 호 `.bha-ring__done`은 링의 `--pos`(소수 가능)만 바꾸면 됩니다. 표식은 transform 보간으로 호를 따라 움직입니다.
- 타일 슬롯은 보이는 크기 약 42px, `::after`로 누르는 영역 44px을 확보합니다.

### 5-4. 튜토리얼 컷아웃

- `.bha-tut__hole`에 대상 요소의 `getBoundingClientRect()`를 left/top/width/height로 넣습니다(여백 6px). 그림자 `0 0 0 100vmax`로 나머지를 어둡게 덮습니다.
- 카드: 대상 중심이 화면 위쪽 절반이면 아래(`.is-below`, `top`), 아니면 위(`.is-above`, `bottom`). 꼬리 위치는 `--tail`(px).
- 리사이즈 때 다시 계산합니다. 참고 구현은 `battle.html`의 `placeTut()`입니다.

---

## 6. 현재 코드 클래스 → 새 컴포넌트 매핑표

| 현재 | 새 클래스 | 메모 |
|---|---|---|
| `.screen` | `.bha-app` (+ `.bha-stage` 래퍼) | 스크롤 없는 화면은 `.bha-app--fixed` |
| `.screen.battle` | `.bha-app.bha-app--fixed.bha-battle` | 좌우 여백 처리는 `.bha-battle__controls .bha-tray` |
| `.stack` | `.bha-stack` (`--tight --loose`) | |
| `.row` | `.bha-row` (`--start --wrap`) | |
| `.grid2` / `.grid3` | `.bha-grid2` / `.bha-grid3` | |
| `.dim` | `.bha-dim` (보조 `.bha-faint`) | |
| `.warn` | `.bha-warn-text` 또는 `.bha-meter__note` | 상태 바 아래 경고는 `__note` |
| `.notice` / `.good` / `.rare` | `.bha-notice` / `--good` / `--rare` | `--warn --danger --risk` 추가 |
| `.banner` | `.bha-notice--rare` (희귀 개체) 또는 `.bha-faint.bha-center` (안내 한 줄) | |
| `.bar` + `> i` | `.bha-meter` + `__head` + `__track > __fill` | 너비 대신 `--fill`(0~1)로 scaleX |
| `.bar.enemy/.player/.sp` | `.bha-meter--enemy/--player/--sp` (`--compact --lg`) | 감소 잔상 `__ghost` + `--ghost` |
| `.bar.hunger/.cond/.risk/.stab` | `.bha-meter--hunger/--cond/--risk/--stab` | 위험 구간 `__zone` + `--zone` |
| `.bar.cast` + `.casttext` | `.bha-cast` (`__title __track __hint`) | `--fill`, 막으면 `.is-blocked` |
| `.chip` / `.chip.weak` | `.bha-chip` / `.bha-chip--weak` | 계통 마크 `.bha-lin--*` 함께 |
| `button` | `.bha-btn` | |
| `button.primary` | `.bha-btn--primary` | |
| `button.small` | `.bha-btn--small` | 누르는 영역 44px 자동 확보 |
| `button.on` | `.bha-btn.is-on` 또는 `.bha-seg__item.is-active` | 배속 토글은 세그먼트 권장 |
| `button.help-btn` | `.bha-btn--icon` + `#i-help` | |
| `button.cand` | `.bha-cand` | |
| `button.chip-btn` | `.bha-tilechip` | |
| `.deckrow` / `.grow` / `.cnt` | `.bha-deckrow` / `__main` / `__count` | −/+ 는 `__stepper` |
| `.slots` / `.slotbox` / `.slotbox.empty` | `.bha-slots` / `.bha-slot--filled` / `.bha-slot--empty` | 교체 대상 `.is-target` |
| `.slotbtns` | `.bha-owned__row` 안 버튼 또는 흡수 ③ 슬롯 버튼 목록 | |
| `.ring` | `.bha-ring` | `container-type` 필요 |
| `.rcell` / `.nest` / `.past` | `.bha-ring__cell` / `--nest` / `.is-past` | 현재 칸 `.is-current` 추가 |
| `.slot` / `.has` / `.can` | `.bha-ring__slot` / `.is-has` + `--prey…` / `.is-can` | `prey-nest`→`--prey`, `elite-den`→`--elite`, `environment`→`--env`, `rest`→`--rest` |
| `.walker` | `.bha-ring__walker` | left/top 대신 링의 `--pos` |
| `.hand` | `.bha-exp__hand` | |
| `.speeds` | `.bha-seg.bha-seg--sm` (원정) / `.bha-battle__bar` (전투) | |
| `.stage` / `.line` | `.bha-log` / `.bha-log__line` | 3줄, 새 줄 `.is-new` |
| `.status` | `.bha-battle__mestatus` (+ 칩) / `.bha-battle__foetags` | 남은 시간은 `.bha-chip__time` |
| `.msg` | `.bha-exp__msg` (`--warn --fight --rest`) | |
| `.tray` / `.sealed` / `.paused` / `.held` | `.bha-tray` / `.is-sealed` / `.is-paused` / `.is-held` | |
| `.tcell` / `.filled` | `.bha-tray__cell` (빈 칸은 `:empty`로 자동 홈 표시) | |
| `.tcell.run/.run-l/.run-r/.chain3` | `.bha-tray__run` (`--start --len`, `--chain3`) | 칸마다 테두리 조합하던 방식 → 겹쳐 놓는 한 요소 |
| `.tcell.drop-before/.drop-after` | `.bha-tray__insert` (`--at`, `--end`) | |
| `.runrow` / `.runtag` | `.bha-tray__runlabel` (묶음 안에 포함) | 별도 줄 필요 없음 |
| `.tblock` | `.bha-block` | |
| `.tblock.role-attack/-guard/-heal` | `.bha-block--attack/--guard/--heal` | |
| `.tblock.special` / `.void` | `.bha-block--special` / `--void` | 기본 블록 `--basic` 추가 |
| `.tblock.weak` / `.dragging` | `.is-weak` / `.is-dragging` | |
| `.tblock .ico` / `b` / `.wk` | `.bha-block__icon` / `__abbr` / `__weak` | 체인 단계 `__pips` 추가 |
| `.holdnote` | `.bha-tray__note.is-held` | |
| `.stored` / `.storedtop` / `.pips` / `.pip.on` | `.bha-stored` / `__body` / `__pips` / `i.is-on` | 게이지 `__gauge` + `--fill` |
| `.stored.ready/.full/.urgent/.pressed` | `.is-ready/.is-full/(is-full로 통합)/.is-pressed` | |
| `.legend` / `.lg` | `.bha-legend` / `__item--*` | |
| `.evo` / `.tier` | `.bha-panel` (진화) + `.bha-evo__form` | |
| `.combo` | `.bha-linbar` (계통 누적 막대) | |
| `.unknown` | `.bha-evo__fact--hidden` (진화 결과 ?) / `.bha-formcard--unknown` | |
| `.evo-result` / `.evo-line` | `.bha-evolve__title…` / `.bha-evolve__line` (`--k`) | |
| `.breakthrough` | `.bha-break` | |
| `.result-title.win/.lose` | `.bha-result--win/--lose` + `__title` | |
| `table` / `td` | `dl.bha-info` / `.bha-info__row` (dt/dd) | |
| `.mini` | `.bha-meter--compact` 또는 `.bha-exp__slots` | |
| `.setting` | `.bha-panel` + `.bha-slider` | |
| `.toast` | `.bha-toast` (`.is-in/.is-out`) | |
| `.tut-layer/.tut-dim/.tut-hole/.tut-card/.tut-step/.tut-title/.tut-body/.tut-buttons/.tut-skip` | `.bha-tut` / (hole 그림자) / `__hole` / `__card` / `__step` / `__title` / `__body` / `__actions` / `.bha-btn--ghost` | 진행 점 `.bha-dots` 추가 |
| `.help-layer/.help-head/.help-body/.help-section/.help-item` | `.bha-app` / `.bha-help__head` / (본문) / `.bha-help__sec` / `details.bha-acc` | |

---

## 7. 구현 시 주의

**상태 클래스 목록**

`is-pressed is-disabled is-on is-active is-selected is-danger is-full is-burst is-zero is-target is-new is-done is-chain2 is-chain3 is-weak is-dragging is-nudge-l is-nudge-r is-held is-sealed is-paused is-cue is-popin is-fire is-origin is-ready is-past is-current is-event is-has is-can is-blocked is-hit is-casting is-guard is-in is-out is-lead is-below is-above is-urgent is-shake`

**JS가 계산해 넣는 CSS 변수**

| 변수 | 어디 | 값 |
|---|---|---|
| `--fill` | `.bha-meter` `.bha-stored` `.bha-cast` | 0~1 |
| `--ghost` | `.bha-meter` (체력) | 직전 값. 0.25초 뒤 늦게 따라옴 |
| `--zone` | `.bha-meter__zone` | 위험 구간 시작 (0~1) |
| `--start` `--len` | `.bha-tray__run` | 1~8, 2~3 |
| `--at` | `.bha-tray__insert` | 1~8 (끝이면 `--end` 변형) |
| `--drag-x` `--drag-y` | `.bha-block.is-dragging` | px |
| `--i` | `.bha-ring__cell` `.bha-ring__slot` | 칸 번호 |
| `--pos` | `.bha-ring` | 현재 칸 (소수 가능, 0~12) |
| `--n` | `.bha-linbar__seg` | 계통별 횟수 |
| `--pct` | `.bha-slider__input` | 0~1 (트랙 채움) |
| `--aura` | `.bha-foe` | `var(--bha-lin-b)` 등 |
| `--tail` | `.bha-tut__card` | 꼬리 위치 px |
| `--t` `--d` | `.bha-press` `.bha-dragprev__ring` | 설정 미리보기 |

**그 밖에**

- **애니메이션 재생**: `is-fire`, `is-popin`, `is-in` 같은 1회성 클래스는 붙였다가 `animationend`에서 떼세요. 다시 재생할 때는 떼고 → `void el.offsetWidth` → 다시 붙이기.
- **블록 발동 순서**: `is-pressed`(누름) → 떼면 `is-fire`(380ms) → DOM에서 제거 → 오른쪽 블록이 당겨짐. 새 블록은 맨 오른쪽 빈 칸에 `is-popin`.
- **오래 누름**: 판정 시간(설정값)을 넘기면 `is-pressed`를 떼고 `.bha-tray.is-held` + `.bha-tray__note.is-held` 문구. 손을 떼면 해제.
- **짧은 화면**: `screens.css`의 `@media (max-height: 780px)`에서 조작 힌트 줄을 숨기고(같은 내용은 [?] 도움말에 있음), 로그를 2줄로, 간격을 줄입니다. 700px 이하는 범례도 숨깁니다. `fit-check.html`에서 360×740 확인.
- **reduced-motion**: `base.css`가 전체 애니메이션을 1ms로 줄이고, `components.css` 끝에서 맥동·광택이 사라진 자리를 정적 테두리/글로우로 대체합니다. 위험·준비됨 같은 정보는 원래 모양과 문구로도 전달되므로 정보 손실은 없습니다.
- **색에만 의존 금지**: 역할 = 색 + 아이콘 + 무늬, 계통 = 색 + 모양, 위험 구간 = 사선 무늬 + 눈금선, 묶음 = 테두리 + 연결선 + "체인N" 글자, 준비됨 = 글로우 + "준비됨" 꼬리표, 교체 대상 = 맥동 + "교체" 꼬리표.
- **터치 영역**: 작은 버튼(`--small`), 작은 세그먼트(`--sm`), 원형 길 슬롯은 `::after`로 44px을 확보합니다. 블록 칸은 44×68.
- **줄바꿈**: `body`에 `word-break: keep-all` + `overflow-wrap: anywhere`. 숫자는 `tabular-nums`.
- **접근성**: 블록은 `role="button" tabindex="0" aria-label`, 상태 바는 `role="meter"`와 `aria-valuenow`, 로그는 `aria-live="polite"`, 강공격 예고는 `role="alert"`, 튜토리얼은 `role="dialog" aria-modal`.

---

## 8. 아직 디자인하지 않은 것 · 가정한 것

**가정한 것 (확인 필요)**

1. 블록 위 특성 이름은 2줄 × 2~4자 **약어**라고 가정했습니다. 긴 이름은 잘리니 약어 필드가 필요합니다.
2. 사신의 회복 역할 이름(회도), 필살 블록 이름(섬광), 저장 필살기 이름(응축 베기), 칭호 등급 이름(제N석)은 **임시 샘플**입니다.
3. 진화 연출 문구(evo1~3)와 시작 화면 종족 설명은 **제안 문구**입니다(`제안 문구` 태그).
4. 둥지를 하단 탭 4개(돌보기·특성·덱·더보기)로 나누고, [원정 출발]·[이어하기]·[전투 연습]은 행동 독에 항상 보이게 재배치했습니다. 기능은 그대로입니다.
5. 탭바의 "특성" 배지(1)는 "빈 슬롯에 넣을 수 있는 보유 특성 수"를 뜻한다고 가정했습니다. 그런 계산이 없으면 배지를 빼세요.
6. 이어하기를 숨기는 이유 문구는 "저장 버전 불일치"를 예로 들었습니다. 실제 이유 문자열을 넣으세요.
7. 쇠약 상태 설명, 한계 돌파 페널티, 흡수 조건 문장, 수치는 모두 `임시` 태그를 붙인 예시입니다.
8. 시작 화면은 지금처럼 **카드를 누르면 바로 시작**합니다(확인 버튼 없음).
9. 공용 모달(`overlays.html`)은 패턴 예시입니다. 지금 게임에 이미 확인 단계가 있는 행동에만 쓰고, 새 확인 단계를 만들지 마세요.

**아직 디자인하지 않은 것**

- 실제 적·진화체 일러스트: `.bha-foe__body` 안의 추상 실루엣(`#foe-a`, `#foe-b`)만 교체하면 됩니다.
- 로딩/저장 중 화면, 오프라인·저장 실패 전용 화면 (흡수 화면의 에러 notice 패턴을 재사용하세요).
- 효과음·진동 타이밍.
- 가로 모드 (세로 전용 가정).

---

## 9. 빠진 기능 체크리스트 (요청 목록 대비)

**A. 시작 / 설정 / 도움말**
- [x] 1 시작: 게임 이름 · 한 줄 안내 · 종족 카드 2장(각자 테마 미리보기) · [설정] · [도움말·튜토리얼] · 버전 표기 — `start.html`
- [x] 2 설정: 클릭 판정 슬라이더(0.15~0.6, 기본 0.3) · 드래그 거리(6~20, 기본 10) · 설명 · 시각 미리보기 2종 · 기본값 복원 · 돌아가기 · 도움말·튜토리얼 다시 보기 — `settings.html`
- [x] 3 도움말: 화면별 요약 4 · 용어 13 · 펼침/접힘 · [튜토리얼 다시 보기] · [닫기] · 전투 중 "전투가 멈춰 있다" — `help.html`
- [x] 4 튜토리얼 8장면: 컷아웃 · 카드 자동 위/아래 배치 · [이전][다음][건너뛰기] · 진행 점 · "튜토리얼 중 — 전투 멈춤" — `battle.html#tut1~8`

**B. 둥지**
- [x] 5 둥지: 이름 · 사냥터 · 기록 한 줄 · 상태 4바(수치 `20/100`, 컨디션 40 미만·리스크 60 이상 경고) · 쇠약 notice · 돌보기 3 · 진화 패널 · 흡수 특성 슬롯(3~8칸, 채움/빈칸, 종류 라벨, 계통 마크, 같은 계통 3개 보너스, 보유 목록에서 교체) · 타일 덱(N/8, 이름·효과·보유·−/수량/+) · 원정 이어하기(정보 + 버려짐 경고 + 숨김 이유) · 원정 출발(덱 비면 비활성) · 전투 연습 · 칭호 도감(해금/전체) · 종족 바꾸기 · 설정 · 버전 — `nest.html`
- [x] 출발/이어하기 항상 엄지 위치 — 행동 독
- [x] 6 진화 패널: 단계 · 진화체 이름 · 포식 N/27 진행 바 · 계통 5개 누적 막대 · 후보 N종 · 결과 ? · 남은 횟수 / [진화] 강조 · [진화체 도감] · 마지막 단계 상태 — `nest.html#canEvolve` `#final`
- [x] 6 진화 연출: 연출 줄 → "{단계}!" · "1단계 호로 → 2단계 길리안" · 새 진화체 · 효과 줄 · [둥지로] — `evolve.html`
- [x] 7 진화체 도감: 단계 탭 4(발견 수) · 카드(이름·요구 계통 마크·효과) / 미발견 ? · 기본형 · 임시 태그 · [둥지로] — `dex-forms.html`
- [x] 8 칭호 도감: 탭 3(n/전체) · 해금(이름·시각·임시 조건) · 히든 ? · 등급 이름 목록 · 해금 토스트 — `dex-titles.html`

**C. 원정**
- [x] 9 원정: 바퀴 · 허기 바 · 리스크 바 · 장착 슬롯 한 줄 · 12칸 링(둥지 칸 · 지난 칸 흐림 · 현재 위치 표식 이동 · 타일 슬롯 1~11 · 빈 `＋` · 종류별 색 · 놓을 수 있는 슬롯 맥동) · 메시지 줄 · 타일 칩(수량·선택) · 배속 1/2/4x · 일시정지 · [?] · 둥지 칸 "귀환 / 한 바퀴 더(N바퀴)" · 4바퀴 초과 경고 · 이동·전투 대기·휴식·허기 위험 — `expedition.html`
- [x] 10 한계 돌파: "…{리스크}가 한계를 넘었다…" · 임시 페널티 · [계속] · 균열·떨림 — `breakthrough.html`
- [x] 11 원정 결과: 귀환/패배 제목 · 이유 · 요약 표(바퀴·전투·지킨/잃은 타일·얻은/잃은 특성·리스크 최고/끝 + 한계 돌파·안정 수치·남은 허기/컨디션) · 시드·기록 저장 · [둥지로] · 칭호 토스트 — `result.html`

**D. 전투**
- [x] 12 전투: 적 이름 · 약점 칩 · 패턴 표식 · 적 체력 · 상태(방어 자세·봉인 부여) · 강공격 예고 시전 바(맥동·색 변화·막기 안내) · 실루엣 + 약점 색 오라 · 사건 로그 3줄 · 플로팅 숫자 4모양 · 내 체력 · 막기/봉인 남은 시간 · SP 바 + 필살 블록 생성 알림 · 블록 바 8칸(44~48×68, 팝인, 당겨짐, 빈 홈) · 종류별 외형 · 묶음 표시 · 약점 강조 · 눌림/발동 · 오래 누름 회색 안내 · 드래그(28px 띄움, 파란 삽입 막대, 밀려남) · 봉인 오버레이 · 일시정지 흐림 · 저장 필살기(충전 3칸, 게이지, 힌트, 준비됨 글로우, 비활성) · 범례 · 조작 힌트 · 하단 컨트롤(배속·일시정지·?·그만두기·남은 시간) · 조우/일시정지/승리/패배/시간 초과 · 타격 플래시 · 체력 잔상 · 체인 이펙트(체인3 주황) · 막기 실드 · SP 폭발 · 공허 마젠타 번쩍임 — `battle.html`
- [x] 390×844 · 360×740 스크롤 없음 — `fit-check.html`
- [x] 13 흡수: ① 선택(제목·상대·희귀 배너·정보 표·리스크 + 한계 돌파 경고·슬롯 현황·[흡수][놓아준다]) ② 후보(카드·"장착하면 계통A 2/3"·후보 없음·[돌아가기]) ③ 교체(슬롯 선택·[포기][돌아가기]) · 에러 notice — `absorb.html`
- [x] 14 전투 연습: 상대 목록(이름·일반/강적·패턴·약점, 35명, 계통·종류 필터) · 기록 개수 · [둥지로] · 연습 결과(승/패·전투 시간·체인1/2/3·체인3·강공격 막기·저장 필살기 사용/낭비·필살 블록·공허(리스크 +N)·마무리 일격·흡수 가능) · [같은 상대와 다시][연습 메뉴로] — `practice.html`

**디자인 시스템**
- [x] 토큰(색·테마 2벌·타이포·간격·모서리·그림자/글로우·모션·z-index·터치) · 아이콘 세트(역할 3·체인 1/2/3·SP·필살·저장 필살기·공허·봉인·약점·허기·컨디션·안정·리스크·진화·도감·칭호·설정·도움말·배속·일시정지/재생·귀환·타일 4+조합·계통 5·희귀·잠금/물음표) · 컴포넌트 전 상태 · 호로/사신 비교 시트 — `components/index.html`
- [x] 재사용 임시 태그 `.bha-tag--provisional`
- [x] reduced-motion 규칙 · 포커스 링 · 색 외 구분 · 터치 44px · 글자 12px 이상
