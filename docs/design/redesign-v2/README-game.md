# 리디자인 v2 — 게임 쪽 공용 부품 사용법 (C.282, GDD 183장 1 ①)

이 폴더의 `bha.css`·`PROMPT.md`·`design/` 은 디자인 원본이다(고치지 않는다). 이 파일은 게임 코드에 들어간 공용 부품을 **화면 세션(A~F)** 이 쓰는 법만 적는다.
화면 세션은 아래 공용 파일을 고치지 않는다 — 모자라면 마스터에 보고.

## 공용 파일

| 파일 | 내용 |
|---|---|
| `src/ui/bha/design-system/tokens.css` | 토큰 값 = `bha.css :root` 그대로 + Silkscreen `@font-face` + 프로젝트 토큰(`--bha-art-*` 그림 윤곽, `--bha-shell-lcd`) |
| `src/ui/bha/design-system/theme-hollow.css` · `theme-shinigami.css` | 테마 블록 (`[data-bha-theme=…]` · `.bha-theme-…` 둘 다) |
| `src/ui/bha/components/components.css` | 옛 공용 컴포넌트 — `.bha-btn` `.bha-chip` `.bha-panel` `.bha-meter` `.bha-notice` `.bha-toast` `.bha-modal` 등은 **v2 모양으로 고쳐 둠**(옛 이름 = 새 모양) |
| `src/ui/bha/components/bha-v2.css` | `bha.css` 공용 컴포넌트(레이아웃 조각~스킬 블록). **자동 생성** `python3 scripts/gen-v2-components.py` |
| `src/ui/bha/icons/icons.css` · `icons-v2.svg` · `v2-names.json` | v2 도트 아이콘 150개. **자동 생성** `python3 scripts/gen-v2-icons.py` |
| `src/ui/bha/iconMap.ts` | 게임 `i-*` → v2 이름 매핑표(한 곳) · `v2Icon()` |
| `src/ui/bha/device.css` · `cosmetics.css` | 기기 껍데기 기본값(`--bha-shell-*`) + 꾸미기 우선 |

## 1. 화면 루트에 `bha-v2` 를 단다 (이름이 겹치는 클래스)

게임에 이미 같은 이름의 **다른 구조** 클래스가 있는 것은 화면 루트(예 `.bha-app`)에 `bha-v2` 클래스를 단 화면 안에서만 v2 모양이 된다:

`.bha-row` `.bha-info` `.bha-pop` `.bha-legend` `.bha-dock` `.bha-tut` `.bha-art` `.bha-toast` `.bha-body` `.bha-switch`

(C.293) 옛 게임 쪽 이름 둘은 바꿔서 겹침이 없어졌다: 정보 표 `dl.bha-info` → **`dl.bha-infotable`**(dom.ts `info()`·`iconInfo()`), 설정 켬/끔 줄 `button.bha-switch` → **`button.bha-setswitch`**. `.bha-art` 는 v2 규칙이 장면 물건·캐릭터 단추(`.bha-prop`·`.bha-char`)를 빼고 걸린다.

- 화면을 옮길 때 루트에 `bha-v2` 를 달고, 그 화면에서 옛 구조(`.bha-row` = flex 줄, `.bha-info` = dl 목록, `.bha-tut` = 옛 튜토리얼 틀 등)를 쓰던 곳을 v2 구조로 바꾼다.
- `.bha-dock`·`.bha-toast` 의 옛 규칙은 `.bha-v2` 안에서 꺼진다. 나머지 옛 규칙은 화면 CSS(room.css·screens-lcd.css 등, 화면 세션 몫)에 있으니 옮기며 지운다.
- 그 밖의 v2 클래스(`.bha-head` `.bha-win*` `.bha-card*` `.bha-gen*` `.bha-hp*` `.bha-blk*` `.bha-tabs/.bha-tab` `.bha-badge` `.bha-plate` `.bha-scene/.bha-obj` `.bha-more` `.bha-kv` `.bha-statline` `.bha-toggle` `.bha-temp` `.bha-chip--status` `.bha-btn--tint/--ask/--sm` `.is-focus` …)는 어디서나 바로 쓴다.
- 옛 전투 UI(`.bha-root`, C.151) 안에서는 이름이 겹치는 새 클래스(`badge` `tab(s)` `head` `gauge` `chain` `count` `kv` `more` `scene` `scrim` `is-focus` 등)가 꺼져 있다 — 전투 세션(C)이 `.bha-root` 를 걷어 내면 `bha-v2.css` 의 `:where(:not(.bha-root *))` 가드를 지우도록 마스터에 보고.

## 2. 숫자 = Silkscreen + 고정 폭 칸

- `--bha-font-num` = Silkscreen(영문·숫자만, 한글은 Pretendard 로 넘어감). 기존 `.bha-num` 은 이미 이 글꼴.
- 숫자가 바뀌어도 칸이 흔들리지 않게: `<span class="bha-num bha-num--w3">148</span>` (w2~w6 = 자릿수 ch, 오른쪽 정렬).
- 체력 막대 숫자 `.bha-hp-txt b`(`--nw`, 기본 3ch, 적 5ch) · 상태 칩 숫자 `.bha-chip--status b`(기본 3ch).

## 3. 아이콘

- 지금 화면: `icon('i-guard')`(dom.ts) · `v2Svg('i-…')` 가 매핑표로 v2 도트 그림(`#v2-shield`)을 그린다 — 코드 안 고쳐도 됨. `i-fx-*`·`foe-*` 는 옛 그림.
- 새 화면: `v2Icon('shield')` 또는 `v2Icon('i-guard')` → `<i class="bha-i bha-i-shield">` (currentColor, 24px, `bha-i--sm/lg/xl` = 16/32/48).
- 이름은 `src/ui/bha/icons/v2-names.json`(150개), 기능별 권장 이름은 PROMPT.md 4절. 임시 매핑 목록 = `V2_ICON_PROVISIONAL`.

## 4. 속성 색

`src/data/elements/elements.json` color = `--bha-el-<id>` 8개(normal·water·fire·earth·thunder·blood·poison·kyo). `elementColor(id)`(element.ts) 그대로 쓰면 된다. 블록 `.bha-blk` 는 `style="--el: var(--bha-el-fire)"`.

## 5. 기기 껍데기 · 꾸미기 우선

- 기본: `.bha-dev` 몸체 `--bha-shell-body`, 버튼 `--bha-shell-btn`/`--bha-shell-line`, LCD 테 `--bha-lcd-bezel`.
- 꾸미기: `:root[data-cos-shell]` 이 `--bha-shell-*` 를 `--cos-shell-*` 로 덮는다(뼈·먹·금 = `--bha-cos-shell-<look>-*`). 그림 틀(frame-v2) `.bha-dev.is-skin` 은 몸체를 끄고 그림이 대신한다.
- 디자인의 `.bha-device/.bha-lcd/.bha-screen/.bha-dbtn` 은 옮기지 않았다 — LCD 646×360·버튼 자리는 게임 코드 값.

## 6. 그대로 둔 것 (화면 세션 몫)

- 화면별 CSS(room·worldmap·market·spa·expedition·battle-scene·shop·story 등)의 옛 그라데이션·glow·hex — 각 화면 세션이 옮기며 정리.
- components.css 의 옛 전투 블록·트레이(`.bha-block` `.bha-tray` `.bha-stored` `.bha-foe`)와 `.bha-root`(v2/bha.css)의 그라데이션 — 전투 세션(C).

## 7. 공용 보충 `components/v2-shared.css` (C.293 — 화면 세션 덮어쓰기를 공용으로)

화면 A~G 가 각자 덮어 쓰던 것을 한 곳에 모았다. 화면 CSS 에서 같은 것을 다시 만들지 말고 이걸 쓴다(모자라면 마스터에 보고).

| 쓸 것 | 내용 |
|---|---|
| `--bha-plate-bg` / `--bha-plate-bg-soft` | 장면 위 반투명 판(bg-0 82% / 72%). 이름표·발밑 체력·돌아가기 버튼 / 넓은 띠(걷기 머리 줄). 테마가 붙는 자리마다 다시 계산(tokens.css) |
| `--bha-scrim` | 창·시트 뒤 덮개(검정 42%, v2 `.bha-scrim` 값) |
| `--bha-dock-btn-w` | 아래 줄 오른쪽 고정 행동 버튼 폭 200 (흡수·결과·진화) |
| `--bha-battle-cut-bg/-line` | 해방 컷인 띠 — 테마 파일(theme-*.css)에 있음 |
| `.bha-modal` (components.css) | 확인·고르기 창 = v2 창: 머리 48(왼쪽 제목) · 본문 · 맨 아래 같은 폭 버튼 줄 `.bha-modal__actions`. 머리 띠 없는 판이 필요하면 걷기 가방(shop.css `.bha-healbag`)처럼 그 창에서 끈다 |
| `.bha-toast` (components.css) | 노란 알림 = 글 길이만큼 30px 띠, 34px 간격으로 쌓임, 누름 통과 |
| `.bha-tut__card` (screens/screens.css) | 튜토리얼 카드 v2 한 벌(lcd.css 압축 규칙 합침) |
| `button.bha-info` | ⓘ 보이는 원 18 그대로, 누르는 자리 36(`::before`) |
| `.bha-more.bha-more--sticky` | 스크롤 칸 안 맨 아래 '▼ 더 있음' 띠(끝까지 내리면 JS 가 `hidden`). 절대 위치 띠는 v2 `.bha-more` 그대로 |
| `.bha-chip--status.is-danger` / `.bha-chip--alert` | 상태 칩 위험 = 아이콘·막대 위험색 / + 빨간 테두리 |
| `.bha-steps` | 단계 숫자(숫자 18 칸 + 이름, 사이 `·`, 지금 = 강조색 칸) |
| `.bha-tilecard` | 타일 카드(그림 30 + 이름 + 한 줄 + ×개수, 색 = `--tile`) |
| `.bha-mdrow` · `.bha-mddetail` | 목록 → 상세 v2 줄(볼록한 면, 고른 줄 = 밝은 면 + 왼쪽 강조 띠 3px, 미발견·숨김 = 움푹한 면). 책장·도움말·튜토리얼 목표·스토리 |
| `.bha-setrow` · `.bha-settings__choices` | 설정 44 줄(이름 + 한 줄 설명 | 조작) · 붙은 고르기 칸 |
| `.bha-toggle` | 제목 토글 `viewTitle()`(책장·수련장·스토리·모험 준비·테스트) 버튼이 v2 `.bha-toggle` + 펼침 목록 |
