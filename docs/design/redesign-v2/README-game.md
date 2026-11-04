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
