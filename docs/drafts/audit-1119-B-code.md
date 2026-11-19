# 점검B — 코드·빌드·테스트 (2026-11-19, 코딩319)

기준: main `519beab` (C.507, GDD v6.142, BALANCE 150, SAVE_FORMAT 93). `npm ci` 뒤 시작. **코드는 고치지 않았다**(분석·보고만).
옛 세이브 불러오기·펫 칸·미루기 확인은 임시 시험 파일(`tests/_tmp_audit/`)로 돌린 뒤 지웠다(커밋 안 함).

## 바로 고칠 것 TOP 10

| # | 심각도 | 위치 | 한 줄 |
|---|---|---|---|
| 1 | 중간 | `src/ui/bha/road.ts:414·436·440` | 타일 배치(roadPlanner)가 만들어질 때마다 **window 리스너 3개가 지워지지 않고 쌓인다**(누수, 옛 화면 DOM 을 붙잡고 pointermove 마다 돈다) |
| 2 | 중간 | `src/game.ts:686-709` (performRevive) · `src/engine/testMode.ts:358` (setForm) | 진화체가 바뀌어 펫 칸이 줄어도 **2번째 펫(active2)이 그대로 남는다** — 부활(퇴화)·테스트 모델 바꾸기에서 `syncPetSlots` 를 안 부름. 실제로 재현함 |
| 3 | 중간 | `src/data/evolution/uniques.ts:281·377-463`, `src/engine/combat/evoUnique.ts:221-224` | 고유 능력 검사(validateEvoUniques)가 **when·kind·element·notElement·chain 값, 종족 키, 특성 수치(balance traits)를 안 본다** + JSON 을 `as unknown as EvoFile` 로 넣어 타입 검사도 없음 → 오타가 조용히 '항상 발동/절대 안 발동/효과 0' |
| 4 | 중간 | `src/engine/combat/combat.ts:2863`, `src/ui/battleView.ts:297` | 진화체 해방 지속 예외(사신 주홍장 `releaseSeconds`)일 때 전투 기록 문구가 **기본 해방 초(p.liberationSeconds)**로 나온다 — 실제 지속(evoReleaseSecondsOf)과 다름 |
| 5 | 중간 | `vite build` 결과 `dist/assets/index-*.js` 1,969.65 kB (gzip 625.76 kB) | 500 kB 경고. 종이인형 동작 JSON(`src/data/art/rig/*motions.json` 약 770 KB, motions.json 하나 456 KB)·테스트 모드 코드(원본 약 106 KB)가 메인 청크에 통째로 들어감 |
| 6 | 중간 | `tests/` 346 파일 중 **188 파일(54%)·769곳**이 src `.ts` 글자를 직접 읽어 `toContain`/`toMatch` | 리팩터·이름 바꾸기 한 번에 수십 파일이 깨지는 구조. `src/ui/app.ts` 하나를 16 파일이 글자로 읽는다 |
| 7 | 중간 | `npm run balance:check` | 4단계 이후 '경고로만' 13건(보스전 33%/28%, 탑 35·50층, 등급전 역전 3건, 바퀴 곡선 1바퀴 84%/83% < 90%, 이어하기 16%, 물공 혈·뇌) + **'5단계 몸' 시나리오가 아직 돈다**(탑 ★5 0/30 등 — 진화 최대 4단계(C.220) 뒤 남은 옛 기준인지 확인) |
| 8 | 중간 | `scripts/balance.ts` 외 scripts 전체 (evoUnique·uniques 참조 0) | 이번 주 넣은 **진화체 고유 능력 23종(C.499~C.507)을 따로 재는 점검이 없다** — 진화 봇이 닿는 4단계는 3/28종(아라포·나다·아르코이리스)뿐이라 나머지는 밸런스 점검에 사실상 안 나온다 |
| 9 | 낮음 | `src/game.ts:3502-3514` (loadSave) | 마이그레이션·검사 중 예외를 `catch {}` 로 삼키고 null — 원인 기록 없이 '읽을 수 없다'/백업 복구로 넘어간다(옛 세이브 87~93 은 실제로 전부 열림 확인, 아래 3절) |
| 10 | 낮음 | `src/ui/bha/v2/bha.css`·`battle-c281.css`·`components/components.css` 등 | 토큰 파일 밖 CSS 에 날 색(#hex·rgb) 534곳(battle-c281.css 61, components.css 40 …) — 규칙 7(bha 토큰만) 위반 후보. 새로 늘지 않게 막는 검사가 없다 |

---

## 1. 돌려 본 결과

| 항목 | 결과 | 비고 |
|---|---|---|
| `npm run typecheck` | 통과 (11.7초) | |
| `npm test` 1회차 | **3913/3913 통과**, 346 파일, 1분 7초 | 가장 느린 파일 rigDraft 4.9초·rigAnim 3.4초·save-codec 2.9초·c452 1.8초·c499 1.6초. 5초 넘는 테스트 0 |
| `npm test` 2회차 | **3913/3913 통과**, 1분 3초 | 1·2회차 테스트별 결과 차이 **0건(flaky 없음)** |
| `npm run balance:check` | 회귀 가드 통과(전 워커 종료 코드 0), 1분 56초 | 4단계 이후 경고 13건(2절) |
| `npm run build` | 성공 6.2초, **청크 500 kB 경고 1건** | index js 1,969.65 kB / gzip 625.76 kB · firebase 940 kB(로그인 때만 동적 import — 정상) · css 462 kB / gzip 79 kB |
| `npm run ui-audit` | **15분 안에 끝나지 않음**(시간 초과로 끊음) | 이 컨테이너에서 화면 하나에 수 분 — `[hollow 시작][hollow 방][hollow 설정(방)]` 까지만. 알려진 실패 2건 비교는 못 했다(점검C 실제 플레이 쪽에서 확인 권장) |
| 옛 세이브 87~93 불러오기 | **14/14 통과** | 두 종족 × 형식 87·88·89·90·91·92·93 → `loadSave` → 형식 93, 미루기 0, active2 null, 다시 저장·불러오기까지 |

## 2. balance:check 경고 목록 (전부 '4단계 이후 — 실패 대신 경고')

- 물공 6속성: 혈 일반 처치 13.6초가 가장 빠르지 않다(최단 13.4초) · thunder ★4 강적 승률 62% vs 5속성 평균 79%
- 보스전 canyon-king 33% · forest-lord 28% (가드 35~85% 밖)
- 등급전: No.7 > No.8 +38%p · No.4 > No.5 +32%p · No.1 > No.2 +40%p (위로 갈수록 내려가야 함)
- 탑: 35층 강적 34%(가드 40~97%) · ★5 '5단계 몸 0/30' · 50층 0%(가드 15~75%)
- 이어하기: 4단계 권장 ★4 1바퀴 안 패배 16% > 13%
- 바퀴 곡선: hollow 84/42/10/0/0/0% · shinigami 83/41/12/0/0/0% — 1바퀴 < 90%
- 참고: 보스 자유 원정 등장 구간 '패배율 99.9 → 99.9%'(4단계 ★4 30판) · 진화 봇 4단계 분포 3/28종

## 3. 상세 표

| 심각도 | 위치 | 문제 | 재현/근거 | 추천 수정 |
|---|---|---|---|---|
| 중간 | `src/ui/bha/road.ts:414,436,440` | roadPlanner 가 `window.addEventListener('pointermove'/'pointerup'/'pointercancel')` 를 걸고 지우지 않는다. 파일 안에 signal·AbortController·remove 없음. 호출처 `planView.ts:112`, `expeditionView.ts:353` — 원정 화면을 다시 그릴 때마다 3개씩 쌓임 | `grep -n "signal\|removeEventListener" src/ui/bha/road.ts` → 0건 | settingsView.ts:772 처럼 `{ signal }` 를 받아 화면 정리 때 abort, 또는 roadPlanner 가 dispose 를 돌려주게 |
| 중간 | `src/game.ts:686-709` performRevive | 퇴화 부활은 `newEvolution`(formId null)로 바꾸지만 `syncPetSlots` 를 안 부른다(진화 1918·환생 2275·트랙 바꾸기 1042·불러오기 3509 만 부름) | 임시 시험: 사신 `h4:hunter`(펫 칸 +1) · active='a', active2='b' → 사망 → performRevive → `petSlotsOf`=1 인데 `active2`='b' 그대로. 가방(`inventory.ts:169`)은 'b' 를 데리고 다니는 것으로 보이나 전투(`carriedPetsOf`)엔 안 간다. 다음 불러오기 때에야 정리되고 런 로그 leave 시각이 어긋남 | performRevive 끝에 `syncPetSlots(save, nowMs)`. 같은 이유로 `testMode.ts:358 setForm` 에도 |
| 중간 | `src/data/evolution/uniques.ts:377-463` | 검사 빈틈: ① rule `when`(release/normal 외 값) ② `kind`·`element`·`notElement`·`chain` 값 ③ forms 의 종족 키가 FACTIONS 에 있는지 ④ forms 키가 FORM_TABLE 에 있는지 ⑤ traits 수치(`balance.provisional.evoUniques.traits[key]`) 존재 ⑥ `on:'timer'` 규칙 이름과 `act:'timer'` 짝 ⑦ buffs·charges 정의 내부 | `evoUnique.ts:221-224` whenOk: `'relase'` 같은 오타는 'normal' 로 취급. `formAbilities.ts:319-329` 특성 수치가 없으면 `v.value ?? 0` → 효과 0. `uniques.ts:281` `raw as unknown as EvoFile` 라 tsc 도 못 잡음. 지금 데이터는 깨끗함(16 forms·6 traits 모두 짝 맞음, 확인함) | 검사 함수에 ①~⑦ 추가(알려진 값 목록과 대조). 실패 시 지금처럼 import 때 throw 유지 |
| 낮음 | `src/data/evolution/uniques.json` | 수치 키 대신 숫자 그대로 44곳 — 대부분 1(스택 +1)·체인 번호지만 `t4:thunder:physical` 호로 `mul wing 0.5`(스택 반감), `h4:void` 사신 `step: 2` 는 밸런스 값 | `value=0.5` 1곳, `step=2` 1곳 | 밸런스 성격 값은 balance 키로 (규칙 '수치는 balance.ts') |
| 중간 | `src/engine/combat/combat.ts:2850·2863` | 지속 시간은 `evoReleaseSecondsOf(p) ?? p.liberationSeconds` 인데 이벤트는 `seconds: p.liberationSeconds` | 사신 `t4:blood:physical`(주홍장)만 해당. `battleView.ts:297` 문구 `${e.seconds}초 동안` | emit 에 실제 초(`lb.ticksLeft` → 초) |
| 낮음 | `src/engine/combat/combat.ts:2904` | 전투가 해방 중에 끝나면(`status !== 'playing'`) releaseEnd 규칙이 안 돈다 — 의도된 것으로 보이나 GDD 에 적혔는지 확인 필요 | 코드 주석 '전투가 끝났다' | 기획 확인만 |
| 중간 | `dist/assets/index-*.js` | 메인 청크 1.97 MB. `src/data/art/rig/motions.json` 456 KB · `mugetsu-motions.json` 151 KB · spider 65 KB · beast 47 KB · humanoid 52 KB 가 정적 import. 테스트 모드(`ui/testMode*.ts`, `engine/testMode.ts`) 도 `app.ts:144-148` 에서 정적 import | `npm run build` 경고 | 동작 JSON 은 캐릭터를 처음 그릴 때 동적 import, 테스트 모드는 `?test=1` 일 때만 import |
| 낮음 | `public/` 52 MB (audio 27 · fx 16 · art 9.7) | 가장 큰 파일: 플레이리스트 mp3 5곡 4.8~6.2 MB, `art/device-badge-back.webp` 1.2 MB, `device-zaraki-front/back.webp` 0.7~0.8 MB. 플레이리스트는 미리받기에서 빠져 있음(`vite.config.ts:104`) — 정상 | `find public -size +500k` | webp 기기 뒷판 3장은 품질 낮춰도 됨. 플레이리스트 곡(난무의 멜로디·chAngE·소녀S 등, GDD 14절 1132줄)이 **공개 Pages 로 배포되는 점은 사용자 판단 필요**(저작권) |
| 중간 | `tests/*.test.ts` | 188/346 파일(54%)이 `read('src/….ts')` 식으로 소스 글자 검사, 769곳. 많이 읽히는 파일: app.ts 16 · battleView 6 · roomView·expeditionView·absorbView 5 | `grep -rlE "(read|src)\(['\"\`]src/…\.ts" tests` | 새 테스트는 동작(함수 결과·DOM) 검사로, 글자 검사는 '금지 코드 없음' 같은 정책 검사만 남기기 |
| 낮음 | 테스트 시간 | 전체 1분 3~7초(4 CPU), 파일 합계 30~33초 — 대부분 transform·collect. 느린 파일 rigDraft 4.9초 | t1/t2 JSON | 지금은 문제 없음. 파일 수가 늘면 `--pool=threads`·소스 글자 검사 정리로 줄어듦 |
| 중간 | `scripts/balance.ts` (balance:check) | 4단계 이후 경고 13건이 '실패 대신 경고'로 계속 쌓인다 + '5단계 몸'(탑 ★5 0/30, 물공 '5단계에 갓 닿은 몸', 등급전 '5단계 세이브') | 2절 | 4단계 최대 기준으로 시나리오 정리(옛 기준이면 제거). 경고 13건은 마스터가 우선순위 결정 |
| 중간 | `scripts/*` | 고유 능력 23종 측정 구간 없음(scripts 안 `evoUnique`·`uniques` 참조 0). 진화 봇 4단계 도달 3/28종 | balance.txt '4단계 3/28종: 아라포 16 · 나다 13 · 아르코이리스 1' | 4단계 진화체마다 '고유 능력 켬/끔' 승률·처치 시간 비교 구간 추가 |
| 낮음 | `src/game.ts:3502-3514` | loadSave 가 예외를 이유 없이 삼킨다(`catch { return null }`) | 코드 | 개발·테스트 모드에서는 console.error 정도 남기기 |
| 낮음 | `src/data/evolution/uniques.ts:466-469` | 데이터 오류면 **import 때 throw** → 앱 전체가 부팅 안 됨(흰 화면). 지금은 테스트가 막아 줘서 안전 | 코드 | 지금 방식 유지하되 CI(테스트)가 반드시 먼저 돈다는 전제 문서화 |
| 낮음 | 죽은 export | src 의 export 2,912개 중 **어디서도 안 쓰는 30개**(예: `evoActionsOf`·`evoExecutes`·`evoFormIds`(C.499~ 새 코드), `testArenaDialog`·`practiceResultView`·`bossRushEntry`·`careButtons`·`deckRow`·`enemyCard`·`traitElement`·`traitFamily` …, `*_PROVISIONAL` 표시 상수 다수), **테스트에서만 쓰는 73개** | 이름 검색 집계(정의 1회 외 사용 0) | 확인 후 지우기(표시 상수는 남겨도 됨) |
| 낮음 | 큰 파일 | `game.ts` 254 KB/3,553줄 · `combat.ts` 217 KB/3,742줄 · `balance.ts` 211 KB(**76% 가 주석**, BALANCE_VERSION 이력 줄만 12개) · `app.ts` 161 KB · `battleView.ts` 137 KB. `game.ts:81` SAVE_FORMAT 이력 한 줄이 수 KB | `wc` | 버전 이력 주석은 dev-log 로 옮기고 1줄만. game.ts 는 펫·진화·마이그레이션(2440~2800줄대) 분리 |
| 낮음 | `src/engine/faction.ts:288` | 엔진 기본 방 설정 `characterArt: 'char.hollow'` — 방 설정이 없는 3번째 종족이면 호로 그림이 나옴 | 코드 | 기본값을 종족 config 필수 값으로 |
| 낮음 | `src/data/skins/index.ts:69` | 스킨 표에서 `getFaction('hollow').frenzyName` 직접 호출(데이터 표라 규칙 2 위반은 아니나 종족 id 문자열 고정) | 코드 | 스킨 데이터 JSON 쪽으로 |
| 낮음 | CSS 날 색 | 토큰 파일 밖 534곳 (`v2/bha.css` 75 — 일부는 토큰 정의 자체, `battle-c281.css` 61, `components.css` 40, `bha-v2.css` 14 …) | `grep -E "#hex|rgb("` | 토큰으로 옮기거나, 새 날 색이 늘면 실패하는 테스트 추가 |
| 낮음 | 종족 하드코딩 | `faction === 'hollow'` 류 비교 **0건**(src 전체). 종족 id 문자열은 데이터 표(skins)·SAVE_KEY·fxLab 시험 그림뿐 | grep | 양호 |
| 낮음 | 엔진 날 수치 | 진화체 전투 훅(`evoUnique.ts`)에 balance 밖 수치 0건. combat·expedition·game 의 소수 리터럴은 하한·클램프(0.001·0.05 등)뿐 | grep | 양호 |
| 낮음 | 진화 미루기(C.497) | 미루기 상태·기록이 원정 중간 저장 → 이어하기 뒤에도 유지(임시 시험 확인), 진화 창은 뒤로 키로 닫히지 않음(`noCancel`), 버려진 원정 정산(1842)도 진화를 보류. 문제 없음 | 임시 시험 | — |
| 낮음 | 병렬 세션 흔적 | 충돌 표시(<<<<<<< 등) **0건**. PATCH_LABEL C.507 = dev-log 마지막 C.507 일치. GDD 20절 버전 겹침 9건(`-2` 꼬리로 처리됨: v6.096·123·129·132 등). dev-log 순서 역전 21곳(맨 위 C.401…, 끝 C.507), 옛 C.151 두 번. 커밋 `b9d52ac` 제목은 'C.505' 인데 내용은 dev-log C.506(머지 때 번호 바뀜) | grep | 번호는 PATCH 받기 전에 main 최신 확인(이미 규칙) — 커밋 제목은 머지 후 정정 불가라 dev-log 에 한 줄 메모 |
| 낮음 | 오래된 안내 | `src/version.ts:7` "13장 로드맵", `docs/dev-log.md:3` "GDD 13장" — 지금은 19절 | 코드·문서 | 글자만 고치기(점검A 문서 쪽과 겹침) |
