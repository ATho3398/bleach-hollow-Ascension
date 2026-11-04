# 블리치 할로우 어센션 — UI 리디자인 구현 프롬프트 (v2)

> 이 파일은 다른 Claude(클라우드 세션)가 그대로 읽고 작업하도록 쓴 지시서다.
> 같은 폴더의 `bha.css`(토큰 + 공용 컴포넌트 + 도트 아이콘 148개)와 `design/` 폴더(시안 .dc.html 18개)를 함께 읽어라.
> **보고는 한국어로.**

---

## v2에서 바뀐 것 (v1 대비)

**토큰**
- 추가 5개: `--bha-el-blood #84343a`, `--bha-el-poison #74803e`, `--bha-el-kyo #7a6496`, `--bha-tint-sage #7f9c7a`, `--bha-shell-lcd`(꾸미기 LCD 색 덮개, 기본 transparent)
- 삭제 1개: `--bha-el-void` (게임에 '공허' 속성 없음)
- 값 수정 2개: `--bha-el-fire #b85a3c → #c0643a`(혈과 구별되게 밝은 주황빛 적), `--bha-app-w 632px → 480px`(원래 값 유지, 새 폭 값 안 씀)
- 기기·LCD: 632×354(left 106·top 18) → **646×360(left 99·top 15)**. `.bha-lcd`/`.bha-screen` 수정
- 새 클래스: `.bha-gen`(블록 생성 게이지 표시 칸, `.is-sealed` 봉인), `.bha-num--w2~w6`(도트 숫자 고정 폭 칸), `.bha-skin-shell-bone/-ink/-gold` · `.has-frame-skin`(기기 꾸미기 우선 구조)

**아이콘**: 66개 → **148개 (+82개)**, 별칭 2개(`el-fire`=flame, `el-thunder`=bolt) 포함 이름 150개. 전부 `bha.css`에 있다.

**시안 수정 6장**
- S01 방: 교감/손질 버튼 색 `--bha-stab` → `--bha-tint-sage`, 대기 보상 아이콘 gift + 고정 폭 숫자
- S09 전투: 640×330 장면 좌표계 + 위·아래 UI 겹침으로 다시 짬, 생성 게이지를 버튼 → 표시 칸, 속성 '공허' → '혈'
- S10 전투 해방: 같은 640×330 구조, 봉인 상태 생성 칸 예시, 독·교·뇌 블록
- S12 바퀴 끝: 창을 646 폭 가운데로
- Components: 8속성 범례·블록, 세이지 버튼, 생성 게이지 칸(평소·봉인), 스토리 잠긴 장 [도전] 흐리게, 아이콘 148개 표
- Main(토큰 표): 위 토큰 변경 반영

**프롬프트**: LCD 실제 값, 전투 640×330, 배치 도구 값 우선, 엔진·데이터 손대지 않음, 4묶음 작업, 꾸미기 우선, Silkscreen 확정, 아이콘은 매핑만.

---

## 0. 너의 일

모바일 웹 도트게임 「블리치 할로우 어센션」(호로/사신 두 종족)의 **게임 코드에 새 UI 디자인을 적용**한다. 디자인은 확정돼 있다. 새로 디자인하지 말고 이 명세 · `bha.css` · `design/*.dc.html` 대로 옮긴다.

### 작업은 4묶음으로 나눠서 (한 번에 하지 마라)

| 묶음 | 범위 | 끝나면 |
|---|---|---|
| ① | 토큰 값 교체 · 공용 컴포넌트 한 벌로 합치기 · 글꼴(Silkscreen) · 아이콘 이름 매핑 | 호로·사신 캡처로 확인 → 보고 |
| ② | 방 · 월드맵 · 시장 · 온천 | 두 종족 캡처 → 보고 |
| ③ | 모험 준비 · 타일 배치 · 걷기 · 전투(평소·해방) · 흡수 · 바퀴 끝 · 결과 | 두 종족 캡처 → 보고 |
| ④ | 가방 · 상태 · 설정 · 나머지 화면 전부 | 두 종족 캡처 → 보고 |

캡처는 기기 844×390, deviceScaleFactor 1. 묶음마다 7절 체크리스트로 스스로 검사하고 바뀐 점을 보고한 뒤 다음 묶음으로 간다.

---

## 1. 절대 바꾸면 안 되는 것

- **LCD 크기는 게임 코드의 실제 값을 따른다.** 기기 844×390, LCD 646×360 @ left 99 · top 15 (배포된 게임에서 잰 값). 이 값과 비율은 디자인이 정하지 않는다. `bha.css`의 `.bha-lcd`/`.bha-screen`은 시안을 그리려고 이 값을 옮겨 적은 것이고, 게임 코드 값과 다르면 **게임 코드가 맞다.** 새 폭 토큰을 만들지 마라.
- 가로 고정, 기기 버튼 4개(▲▼ 왼쪽, ✓·◀ 오른쪽) 자리·크기. ("지금 비율 딱이야 건들지마")
- **전투 좌표계 640×330**, 방·시장·월드맵 **물건 % 좌표**, **배경 보기(floor.view 확대·위치)** 는 사용자가 배치 도구로 잡은 게임 값을 그대로 쓴다. 시안 값은 참고용.
- **엔진·데이터·세이브·밸런스는 디자인 때문에 바꾸지 않는다**: `src/engine`, `src/data`, `src/game.ts`, `src/config/balance.ts`. 화면에 필요한 값이 없으면 고치지 말고 보고한다.
- 기능·흐름·화면 수. 기능을 빼거나 확인 단계를 새로 만들지 않는다. 설정 항목도 늘리지 않는다.
- 외부 라이브러리 없이 DOM/CSS. 클래스는 전부 `bha-` 접두. 색·간격·글자·모션은 `--bha-*` 토큰만 (화면 코드에 hex 직접 금지).
- 3번째 종족이 테마 블록 하나로 붙는 구조(루트 `.bha-theme-xxx` 또는 `data-bha-theme` + 토큰 덮어쓰기). `bha.css`는 두 선택자를 다 지원한다.
- **기기 꾸미기를 덮지 않는다.** 게임에 이미 기기 껍데기 꾸미기(뼈·먹·금 `--bha-cos-shell-*`)와 기기 그림 틀 **frame-v2** 스킨이 있다. 새 `--bha-shell-body/-line/-btn`, `--bha-lcd-bezel`은 **꾸미기를 안 끼었을 때의 기본값**일 뿐이고, 꾸미기를 끼면 꾸미기 값·그림이 우선한다(3절 구조).
- 캐릭터·적·물건 그림 파일은 건드리지 않는다. 시안의 회색 실루엣은 자리 표시다.
- `--bha-fx-cero-oscuras-core/edge`는 마스터 승인 값이라 그대로.

## 2. 정체성 · 톤 · 크기 규칙

- "폰에서 돌아가지만 정체성은 구형 휴대 기기로 하는 도트게임". 표·폼·긴 문단 같은 웹 관리 도구 느낌 금지.
- 모든 게임 화면은 LCD(646×360) 안에서만 그린다.
- 기기 버튼만으로 끝까지 조작 가능, 터치는 지름길. **초점이 늘 보여야 한다**: 상자는 `outline 2px var(--bha-focus)` + 왼쪽 깜빡이는 도트 ▶ 커서(`.is-focus`), 그림은 윤곽만(`.bha-art.is-hl` = drop-shadow 4방향, 흐림 없음). 초점 이동 순서 = 보이는 위치 순서(위→아래, 같은 줄 왼→오). 표시 칸(예: 생성 게이지)은 초점을 받지 않는다.
- 톤: 따뜻한 먹색·짙은 갈회색 바탕, 면마다 명도 차(bg-0 < 1 < 2 < 3), 완만한 입체(밝은 윗선 `--bha-hi` + 어두운 아랫면 `--bha-lo`). 강조색은 같은 명도대의 가라앉은 색(청록·구리·황동·보라·세이지). **가장 밝은 것은 글자와 초점뿐.** 형광·순색·네온·glow·그라데이션 없음 (glow 토큰은 2px 테두리로 바뀜).
- 호로: 붉은 기 도는 재·숯 바탕, 뼈백색 글자, 짙은 크림슨 포인트(위험·선택·해방에만), 뼈색 주 버튼, 모서리 2/4/6/8.
- 사신: 먹·남빛 바탕, 차가운 백색 글자, 은청 포인트, 은빛 칼날 판 주 버튼, 모서리 0/2/3/4.
- 글자 최소 12px, 단계 12·13·14·16·18·22·28·36·48. 대비 4.5:1 이상.
- 터치 대상 44px 이상(작은 버튼 36px 이상). `--bha-btn-h` 44 / `-sm` 36 / `-lg` 48.
- 사용자 원문: "아이콘이 너무 작고…크기도 키워", "버튼 너무 작아", "노력치 폰트 굵기나 사이즈 좀 바꿔서 가독성 좋게", 그런데 "흡수 버튼 너무 커". → 작아서 안 보이는 것도, 쓸데없이 큰 것도 안 된다.
- **숫자 글꼴 (확정)**: 영문·숫자는 Silkscreen(`--bha-font-num`), 한글은 Pretendard. Silkscreen(OFL) woff2를 `fonts/`에 넣고 @font-face를 추가한다. 숫자 폭이 바뀌어도 칸이 흔들리지 않게 **고정 폭 칸**으로 그린다: `.bha-num` + `.bha-num--w2~w6`(자릿수 ch), 체력 막대 숫자는 `.bha-hp-txt b`(`--nw`, 기본 3ch, 적 체력은 5ch), 상태 칩 숫자는 `.bha-chip--status b`(기본 3ch). 모두 오른쪽 정렬.

## 3. 토큰

전체 값은 `bha.css`가 정답이다 (`:root` 공통, `.bha-theme-hollow`, `.bha-theme-shinigami`). 토큰 **이름은 그대로**, 값만 바꾼다.

### 새 토큰

| 토큰 | 호로 | 사신 | 용도 |
|---|---|---|---|
| `--bha-hi` | rgb(255 236 214/.10) | rgb(220 235 255/.10) | 면 윗선 빛 |
| `--bha-lo` | rgb(0 0 0/.35) | rgb(0 0 0/.4) | 면 아랫면 그늘 |
| `--bha-primary-lo` | #9d8b70 | #7a899b | 주 버튼 아랫면 |
| `--bha-shell-body / -line / -btn` | #2a211e / #4a3c36 / #3a2f2a | #1c222b / #36424f / #28313c | 기기 껍데기 **기본값(꾸미기 없을 때)** |
| `--bha-lcd-bezel` | #0f0b0a | #090c10 | LCD 테 **기본값** |
| `--bha-shell-lcd` | transparent | transparent | LCD 색 덮개 (꾸미기가 채움) |
| `--bha-scene-wall / -floor` | #3a2c26 / #4a3a30 | #26303a / #3a3a30 | 그림 없을 때 장면 자리 |
| `--bha-ph` | #7a665a | #66788c | 그림 자리 표시 색 |

공통 새 토큰:
- 속성 8개 (게임 데이터 normal·water·fire·earth·thunder·blood·poison·kyo): `--bha-el-normal #8c8478` · `--bha-el-water #4c7ea8` · `--bha-el-fire #c0643a` · `--bha-el-earth #9a7c48` · `--bha-el-thunder #a8963e` · `--bha-el-blood #84343a`(짙은 적갈, 불보다 어둡고 붉음) · `--bha-el-poison #74803e`(가라앉은 올리브) · `--bha-el-kyo #7a6496`(가라앉은 보라). `--bha-el-void`는 **없다.**
- 강조 5색: `--bha-tint-teal #4f8f8a` · `-copper #b0704a` · `-brass #a8904f` · `-violet #7f6c9e` · `-sage #7f9c7a`
- 크기: `--bha-btn-h 44 · -sm 36 · -lg 48`, `--bha-head-h 44`, `--bha-dock-h 56`, `--bha-skill-h 130`, `--bha-icon-sm/md/lg/xl 16/24/32/48`, `--bha-sprite-sm/md/lg 32/48/64`, `--bha-caret 10px`
- 그림: `--bha-sprite-outline`(drop-shadow ×4, 2px focus), `--bha-sprite-dim`
- 알림: `--bha-toast-bg #2e2717 · -line #a88c4c · -ink #f0e2bd`

값이 바뀐 주요 기존 토큰: `--bha-gutter 10px`, `--bha-block-h 52px`(정사각), `--bha-bar-h 8px`, `--bha-lh-body 1.45`, `--bha-ease-snap steps(3,end)`, 모션 80/120/200/280/700ms. `--bha-app-w`는 **480px 그대로**.

### 꾸미기(--bha-cos-*) — 낮춘 값이 bha.css에 전부 적혀 있다
`--bha-cos-*` 90개 이름은 그대로, 값은 같은 톤으로 낮춰 `bha.css :root`에 모두 적었다: 오라 4 · 색조 필터 4 · 발자국 3 · 공격 이펙트 6 · 블록 바 6(그라데이션 → 단색) · 기기 껍데기 9 · 이름표 3 · 등장 3 · 진화 3 · 흡수 2 · 컷인 6(그라데이션 → 사선 띠 `repeating-linear-gradient`) · 승리 3 · 말풍선 2 · 방 12(무늬 → 줄 띠) · 액자 3 · 키링 14. 형광·glow 없이 같은 명도대.

### 꾸미기 우선 구조 (bha.css에 구현됨)
```
.bha-device            → --bha-shell-* 기본값 사용
.bha-skin-shell-bone   → --bha-shell-body/-line/-btn/-lcd 를 --bha-cos-shell-bone-* 로 덮어씀
.bha-skin-shell-ink    → 〃 ink
.bha-skin-shell-gold   → 〃 gold
.bha-device.has-frame-skin → frame-v2 그림 틀을 끼면 껍데기 배경·그림자를 끄고 그림이 대신
.bha-screen::after     → --bha-shell-lcd 색 덮개 (꾸미기 없으면 transparent)
```
게임에 이미 있는 꾸미기 적용 코드가 다른 이름을 쓰면, 이 우선순위만 지키고 이름은 게임 쪽에 맞춘다.

## 4. 컴포넌트 · 아이콘 (클래스 = `bha.css`)

- 기기: `.bha-device .bha-dbtn--up/--down/--ok/--back .bha-lcd .bha-screen`
- 레이아웃: `.bha-head`(44) `.bha-body` `.bha-dock`(56, 아래 고정 버튼 줄) `.bha-panel` `.bha-well`(움푹한 면)
- 버튼: `.bha-btn` + `--primary --danger --ghost --sm --lg --icon --block --tint(속성색 아랫면) --ask(캐릭터가 청한 것)`, 상태 `.is-focus .is-press :disabled/.is-disabled`(자리 유지)
- 칩: `.bha-chip --warn --danger --status` `.bha-badge --accent --brass` `.bha-temp`('임시' 그대로)
- ⓘ: `.bha-info`(36 터치) → `.bha-pop`(쉬운 말 + `.bha-pop-val` 대표 값). 계산식 노출 금지.
- 탭/토글: `.bha-tabs .bha-tab.is-on` `.bha-tab-n` `.bha-toggle` `.bha-switch.is-on`
- 게이지: `.bha-gauge --danger` `.bha-gauge-row` `.bha-hp .bha-hp-bar`(10칸 눈금, `<s>` = 방금 깎인 양) `.bha-hp-txt`
- **블록 생성 게이지 = 표시 칸**: `.bha-gen`(움푹한 면 + 아이콘 + '다음 블록' + `.bha-gen-bar`). 버튼 아님, 볼록하지 않음, 기기 버튼 초점 안 받음(`pointer-events:none`). [막기] 왼쪽 자리. 차면 블록 1개 생성. 봉인 상태이상 때는 `.bha-gen.is-sealed` — 이 칸만 자물쇠·회색·남은 초.
- 카드/목록: `.bha-card --shop --tile --item .is-sel` `.bha-count` `.bha-card-price` `.bha-row`. 목록 = 그림·이름·한 줄(+가격)만.
- 그림 자리: `.bha-art --frame .is-hl .is-locked` + `.bha-lock`(그림 칸 안 오른쪽 아래) `.bha-plate .is-on` `.bha-scene .bha-obj`
- 창: `.bha-win .bha-win-head`(48 따로, ×는 머리 안 오른쪽 칸) `.bha-win-body`(고정 높이, 안에서 스크롤) `.bha-more` `.bha-win-foot` `.bha-scrim`
- 알림/튜토리얼: `.bha-toasts .bha-toast` `.bha-tut .bha-tut-arrow--left/--down`(회색 덮개 없음)
- 스킬 블록: `.bha-blk`(정사각 52, `--el` = 속성 8색 중 하나, 안쪽 모양 = 계열 `bha-i-lin-a~e`, 가운데 계열 글자 1자) `.bha-blk--empty --sm` `.bha-chain`(`--ch` 2=황동 3=구리 받침 띠) `.bha-blockbar` `.bha-legend`
- **스토리 장 목록**: `.bha-row`. 열린 장 = 오른쪽 [도전] 선명(`bha-btn--sm --primary`). **잠긴 장 = 그림 흐리게(`.bha-art.is-locked`) + 자물쇠(그림 칸 안 오른쪽 아래) + 둘째 줄 '열리는 조건: …' + 오른쪽 [도전]은 흐린 상태(`.is-disabled`)로 자리만 유지.** 누르면 이유 한 줄(`.bha-pop`). 잠긴 장은 도전할 수 없다.

### 아이콘 — bha.css에 다 있다. 구현은 이름 매핑만 한다
`.bha-i .bha-i-<이름>` (16×16 도트 마스크, currentColor, 16·24·32·48px). 새로 그리지 말고, 게임 코드의 `i-*` 이름 → 아래 이름 매핑표만 만든다. 매핑이 애매한 것은 가장 가까운 것을 쓰고 보고한다.

전체 150개 이름(148개 그림 + 별칭 2):
```
up down left right check close info help lock star food sleep care heart bolt el-thunder spirit flame el-fire
clock more bag map book gear sword shield boot ring potion tile slot shirt paw box spark play pause flag log
coin gem home door tower shop anvil cart steam dummy forest camera egg swap orb save plus skull figure blob
generate back dice groom madness mask dying revive heal bandage nest dojo badge bookshelf equip armor talisman
fang bone tag stack sell gift attack release return loop warning hourglass target battle boss branch reroll
refresh rebirth sound mute music vibrate codex medal crown trophy scroll talk skip tap new sort filter auto
trash pencil folder download upload fullscreen monitor keyring arrow-up arrow-down minus eye eye-off list grid
search key bell moon sun cloud campfire butterfly fist brain wing lotus el-normal el-water el-earth el-blood
el-poison el-kyo lin-a lin-b lin-c lin-d lin-e
```

기능별 권장 매핑:
- 돌보기: 먹이/식사 `food` · 재우기 `sleep` · 교감 `care` · 손질 `groom` · 온천 `steam` · 배부름 `food` · 컨디션 `bolt` · 영압 안정도 `spirit` · 광기 `madness` · 호로화 `mask` · 빈사 `dying` · 부활 `revive` · 회복 `heal`
- 장소: 둥지 `nest` · 대원실 `dojo` · 월드맵 `map` · 시장 `shop` · 모험 `forest` · 도전의 탑 `tower` · 수련장 `dummy` · 온천 `steam` · 진급 시험/번호 쟁탈전 `badge` · 책장 `bookshelf`
- 가방 탭: 장비 `equip` · 슬롯 `slot` · 타일 `tile` · 소모품 `potion` · 스킨 `shirt` · 펫 `paw` · 기타 `box`
- 장비 자리: 무기 `sword`(호로 송곳니 `fang`) · 방어구 `armor` · 신발 `boot` · 부적 `talisman` · 전투 소모품 `potion`
- 상점·화폐: 골드 `coin` · 영옥 `gem` · 가격 `tag` · 가진 수 `stack` · 대장장이 `anvil` · 떠돌이 상인 `cart` · 특성 상점 `spark`
- 전투: 막기 `shield` · 블록 생성 `generate` · 해방 `release` · 일시정지 `pause` · 로그 `log` · 그만두기 `flag` · 귀환 `return` · 한 바퀴 더 `loop` · 강공격 예고 `warning` · 남은 시간 `hourglass` · 약점 `target` · 조우 `battle` · 보스 `boss` · 봉인 `lock`
- 흡수: 갈래 `branch` · 특성 `spark` · 다시 뽑기 `reroll` · 위험 `warning`
- 시스템: 설정 `gear` · 소리 `sound`/`mute`/`music` · 진동 `vibrate` · 저장 `save` · 불러오기 `folder` · 백업 `download`/`upload` · 도움말 `help` · 도감 `codex` · 칭호 `medal` · 환생 `rebirth` · 붕옥 `orb` · 사진 `camera` · 대기 보상 `gift` · 잠김 `lock` · 새로 `new` · 경고 `warning` · 정렬 `sort` · 필터 `filter` · 자동 착용 `auto` · 일괄 판매 `sell` · 버리기 `trash` · 이름 바꾸기 `pencil` · 전체 화면 `fullscreen` · 화면 `monitor` · 다마고치 `egg` · 키링 `keyring` · 종족 전환 `swap` · 처음 화면 `home` · 스토리 `scroll` · 대화 `talk` · 건너뛰기 `skip`
- 타일 4종: 먹잇감 `fang` · 강적 `crown` · 환경 `cloud` · 휴식 `campfire`
- 능력치: 체력 `heart` · 힘 `fist` · 지능 `brain` · 방어 `armor` · 정신력 `lotus` · 속도 `wing` · 치명 `target`
- 속성 8: `el-normal` `el-water` `el-fire` `el-earth` `el-thunder` `el-blood` `el-poison` `el-kyo`
- 사신 지옥나비 `butterfly`, 호로 뼈 `bone`, 수치 오름/내림 `arrow-up`/`arrow-down`

## 5. 확정 UX 규칙 (모든 화면)

1. 버튼 자리 고정: 고른 항목·설명 길이·수치·상태가 바뀌어도 버튼·초점 대상은 안 움직인다. 바뀌는 글은 고정 높이 칸 안에서 줄이거나 스크롤. 버튼이 없어질 땐 자리를 비우거나 흐리게.
2. 넘치는 칸 = 안에서 스크롤 + 바닥 '▼ 더 있음'(끝까지 내리면 숨김, 기기 ▼로도 스크롤).
3. 능력치·상태·위험 설명은 줄 펼침이 아니라 ⓘ 창.
4. 잠김 = 그림만 흐리게 + 자물쇠는 그 그림 칸 안 오른쪽 아래. 누르면 이유 한 줄. 잠긴 것의 실행 버튼은 흐리게 자리 유지.
5. 월드맵·시장·온천은 화면 전체가 장면, 머리 줄은 장면 위에 겹침. 시장은 앞뒤 깊이. 캐릭터는 장소 그림 앞, 그림은 이름표를 덮지 않음.
6. 목록 = 그림·이름·한 줄(+가격). 수치는 상세 창에서만 (상점·가방·떠돌이 상인 전부).
7. 튜토리얼 카드는 대상 바로 옆, 대상·눌러야 할 버튼 안 가림, 회색 덮개 없음.
8. 노란 알림 = 맨 위 가운데, 쌓임, 버튼을 안 가림. 진화·승급·도감 목표·새 장소·떠돌이 상인 도착·경고만.
9. 방 위에 경고 띠 없음 — 상태는 캐릭터 머리 위 칩으로만. 상태이상은 능력치보다 위.
10. 전투: 내 캐릭터 오른쪽, 적 왼쪽. 블록 칸 정사각. 블록 타입 글자·체인 원 없음.
11. 문구: 설명은 '~다' 체, 한 줄짜리엔 마침표 없음. 수치 줄은 `조건: 효과`를 ` · `로, `+n%` `−n%` `×n` `n초`. **개발자 말(칸·틱·id·계산식) 금지.**
12. 쓰지 않는 말: 원정→모험, 밖으로→월드맵, 장터→시장, 덱→가진 타일·프리셋, 한계 돌파→폭주/호로화, 배속(없음), 필살기→해방. 용어 그대로: 웨코문도·아쥬커스·레스렉시온·만해·영압 안정도·빈사.

종족별 이름: 둥지/대원실 · 먹이/식사 · 교감/손질 · 번호 쟁탈전/진급 시험 · 웨코문도/소울 소사이어티 · 광기/호로화 · 레스렉시온/만해 · 포식/정화 흡수.

## 6. 화면별 명세 (시안 = `design/Sxx-*.dc.html`)

LCD 646×360 기준 px. 좌표·물건 위치는 게임 값 우선, 시안은 참고.

**묶음 ②**
- **S01 방**: 장면 = 위 0~304, 아래 돌보기 줄 56(고정). 물건 4개 위치는 게임 값. 머리 위 상태 칩 한 줄(배부름·컨디션·영압 안정도·광기/호로화 + ⓘ, 상태이상은 맨 앞). 캐릭터 아래 체력 막대 "체력 n / max". 돌보기 줄: [먹이/식사 3/3] `--tint` 구리(`--bha-hunger`) · [재우기] 청록(`--bha-cond`) · [교감/손질] **세이지(`--bha-tint-sage`)**, 캐릭터가 청한 것만 `--ask` | 대기 보상(gift + 남은 시간 고정 폭) + ⋯. 떠 있던 수치 상자 제거. 모험 중 [모험 이어하기], 사망 [부활]을 같은 자리에.
- **S02 월드맵**: 지도가 LCD 전체. 왼쪽 위 [둥지로/대원실로] 작은 버튼만 겹침. 장소 6곳 이름표 통일, 시장 이름표 안 '상인' 황동 배지.
- **S03 시장**: 제목 문단 띠 제거 → 왼쪽 위 작은 '시장' 판. 뒷줄 작게·앞줄 크게(배치는 게임 값). 왼쪽 앞 월드맵 = 나가기.
- **S05 온천**: 장면 전체. 왼쪽 위 [방으로 돌아가기] + ⓘ만. 머리 위 칩 두 개(체력·배부름, 고정 폭 숫자). 물 높이 위로 반투명 물 면 한 겹.

**묶음 ③**
- **S06 모험 준비 [준비]**: 머리 = [자유 모험|스토리] + [준비|타일 배치] + 도움말. 왼쪽: 사냥터 줄 · 난이도 ★ 줄 · 설명 고정 높이 + 더 있음 · 길 미리보기. 오른쪽 프리셋 판. 아래 [출발] 48px. 첫 진화 전이면 [타일 배치] 탭 없음.
- **S07 [타일 배치]**: 길 = 가로 한 줄 전체 폭(시작 + 10자리, 52 정사각). 가진 타일 카드 한 줄 4장, [출발] 위만 스크롤 + 더 있음.
- **S08 걷기**: 위 상태 줄 하나(바퀴·체력·컨디션 | [가방][귀환하기][도움말] 36px). 캐릭터 왼쪽 보고 오른쪽 가운데, 적·휴식 장소는 왼쪽에서 다가옴. 아래 왼쪽 작은 길 줄.
- **S09 전투**: **장면은 게임 전투 좌표계 640×330 그대로**(시안은 LCD 안 left 3 · top 0). 머리 줄 40과 스킬창 130은 장면 위에 겹친다. 캐릭터·체력 막대·강공격 예고는 장면 y 40~230 안(겹치는 UI에 가리지 않는 띠). 게임 코드가 장면을 다르게 배치·확대하고 있으면 게임 값을 따르고, 이 겹침 원칙(위 40·아래 130에 캐릭터·막대가 안 걸림)만 지킨다.
  - 위 줄: 적 이름·★·속성/약점 칩 | 남은 시간(hourglass + 고정 폭 3자리) · 그만두기 · 로그 · 일시정지 · 도움말.
  - 스킬창 130 = 범례 줄 16 + 줄 36 [**생성 게이지 표시 칸** `.bha-gen`][막기][소모품][장비](못 쓸 땐 흐리게 자리 유지) + 블록 바 8칸 정사각.
- **S10 전투 해방 중**: 해방 = 캐릭터 누르기. 장면 어둡게, 내 캐릭터만 윤곽 강조, '레스렉시온/만해 중 n초' 칩. 컷인 = 체력 막대 안 가리는 44px 가로 띠(호로 `--bha-cos-cut-flame-*`, 사신 `--bha-cos-cut-ink-*`). 해방 블록 = 황동 위아래 2색. 봉인 상태이상 땐 생성 칸만 `.is-sealed`. 일시정지 창(계속·설정·그만두기).
- **S11 흡수**: 머리 = 제목(포식/정화 흡수) + 단계 1 갈래 · 2 특성 + [내 상태]. 왼쪽 상대 카드 → 갈래 4개(각 아래 '위험 +n') → 설명 고정 높이(이름: 값, 스크롤 + 더 있음) → 오른쪽 아래 [○○하기] 44×200 (너무 크지 않게). 특성 고르기도 같은 틀(후보 + [다시 뽑기] 고정 자리 → 슬롯 교체).
- **S12 바퀴 끝 창**: 창 높이 고정. 타일 뽑기 · 손 · 배치판. 아래 [귀환] / [한 바퀴 더] 같은 크기 48.
- **S13 결과**: 승리/패배 톤은 맨 위 4px 띠 + 제목 색만. 성장 요약(노력치 초록 +n · 얻은 것 · 새 블록 · 광기 · 진화) → [둥지로][진화 보기].

**묶음 ④**
- **S04 상점**: 머리 = 제목 + 골드·영옥 칩(고정 폭 숫자). 카테고리 탭(아이콘+글자). 카드 4열. 상세 창: 머리 48(그림+이름+×) / 설명 + 수치 줄 + 가진 수·값 / 아래 고정 [닫기][사기]. (상점은 시장 안이지만 화면 구조상 ④에서 다른 목록 화면과 함께 해도 된다)
- **S14 가방 [장비]**: 탭 7개. 장비 자리 6개(무기·방어구·신발 | 부적1·부적2·전투 소모품) 60×66을 캐릭터 양옆에. 캐릭터 아래 이름·단계만. 오른쪽 필터 + 아이템 4열. 아래: 개수 · 등급순 · 자동 착용 · 일괄 판매.
- **S15 상태**: 상태이상 → 상태 막대 5개(각 ⓘ) → 능력치 2열(16px 굵은 기본값 + 14px 굵은 초록 +n + ⓘ) → 진화 정보 → [도감][도움말][환생]. 개발 정보·버전 문단 제거.
- **S16 설정**: 탭 화면/소리/전투/기타 + [저장] 머리 오른쪽 고정. 모든 항목 44px 줄 두 열. 항목은 지금과 같게.
- 시안 없는 나머지(책장·진급 시험·수련장·도전의 탑·스토리·대화창·처음 화면·슬롯·종족 고르기·도움말·확인/고르기 창·다마고치 모드·사진·붕옥·대기 보상·환생 2단계 등)는 같은 컴포넌트·규칙으로: 머리 44 + 본문 + 아래 고정 줄, 왼쪽 목록 → 오른쪽 상세, 제목 토글 `.bha-toggle`, 스토리 잠긴 장은 4절 규칙.

## 7. 묶음마다 체크리스트 (두 종족 모두)

- [ ] 기기 844×390, LCD 646×360 @99,15, 버튼 4개 자리 그대로 (게임 코드 값과 같은가)
- [ ] 전투 640×330, 물건 % 좌표, floor.view 가 게임 값 그대로
- [ ] `src/engine`·`src/data`·`src/game.ts`·`src/config/balance.ts` 변경 없음 (git diff로 확인)
- [ ] 기기 꾸미기(cos-shell, frame-v2)를 끼면 꾸미기가 보이는가
- [ ] 초점이 늘 보이고, 기기 버튼만으로 모든 대상에 닿는가. 표시 칸(생성 게이지)은 초점이 안 가는가
- [ ] 글자 12px 이상, 터치 44px(작은 버튼 36px) 이상, 대비 4.5:1 이상
- [ ] 숫자 바뀔 때 체력·타이머·개수 칸 폭이 그대로인가
- [ ] 화면 코드에 hex 직접 없음, glow·네온·그라데이션 없음, 그림 강조는 윤곽만
- [ ] 속성 색은 8개(공허 없음), 불·혈이 구별되는가
- [ ] 글 길이·상태가 바뀌어도 버튼이 안 움직임 (잠긴 것의 버튼도 흐리게 자리 유지)
- [ ] 금지어(원정·밖으로·장터·덱·한계 돌파·배속·필살기·칸·틱·id) 화면에 없음
- [ ] 노란 알림이 버튼을 안 가리고, 튜토리얼에 회색 덮개 없음

## 8. 확인이 필요한 것 (사용자에게 물어볼 것)

- 시안에서 지어낸 이름: 흡수 갈래 '속성 포식'·'능력치 포식', 타일 '맑은 샘'·'모래 바람'·'쉼터', 스토리 장 제목. 게임 데이터의 실제 이름을 쓴다.
- 아이콘 매핑에서 게임 `i-*` 이름 중 위 150개로 대응이 안 되는 것이 있으면 목록으로 보고한다(새로 그리지 말 것).
