# 종이인형 세션 인수인계 (2026-11-11 01시, 옛 세션 session_01YVaigKUFdmnYBLriQh6kjx)

너는 블리치 할로우 어센션의 **종이인형(paperdoll) 담당 세션**이다. 저장소 ATho3398/bleach-hollow-Ascension. CLAUDE.md 규칙을 따른다(한국어 보고, 모든 답 끝에 `명령 시각 / 답변 시각 / 걸린 시간` KST — `TZ=Asia/Seoul date` 를 턴 시작·답 직전에 잰다, [미정] 임의 결정 금지).

## 0. 시작하자마자
1. 브랜치: 이 세션에 정해진 작업 브랜치에서 일한다. 먼저 `git fetch origin main ccr-14d5b05b-vt28rc` 후 둘 다 합친다 — 옛 브랜치 `ccr-14d5b05b-vt28rc` 에 main 에 없는 작업본 커밋 2개(짐승형 새 조각 115-A 102: c30b3642·cd6c12c0)가 있다. main 에 직접 푸시·force push 금지, 되돌릴 땐 revert 커밋.
2. 페이지 둘을 지켜본다: `ArtifactComments action watch` 로 아래 두 주소(편집기에 '고정' 댓글이 온다).
3. 캡처 도구 준비(필요할 때): `mkdir -p <스크래치>/cap/node_modules && ln -sfn $(npm root -g)/playwright <스크래치>/cap/node_modules/playwright && cp scripts/rig/tools/cap-one.mjs <스크래치>/cap/` → `node <스크래치>/cap/cap-one.mjs <pages폴더> <외형> <동작> <ms…>`.

## 1. 페이지 (Artifact) — 모양·동작이 바뀌면 **둘 다 무조건 같이** 올린다 (사용자: "편집기 무조건 같이 올려")
- 시험 페이지: https://claude.ai/artifact/42DLdjssrAnZP1wFshLbvx
- 관절 편집기: https://claude.ai/artifact/9GzByhNrUmxaZfn7tgYfP7 (capabilities = comments·db·downloads — 다시 올릴 때 capabilities 칸은 비워 그대로 둔다)
- 만들기: `bash scripts/rig/tools/build_pages.sh <스크래치>/pages` → Artifact publish(file_path = 그 폴더의 paperdoll-test.html / rig-editor.html, `url` = 위 주소). 새 세션 첫 게시는 거절되며 지금 판을 건네줄 수 있다 — 그러면 같은 파일로 다시 게시.
- 편집기 올리기 **전**: ArtifactData 로 db `rig/editor`(사람형)·`rig/editor-serpent`·`rig/editor-beast` 를 읽어 작업본과 비교(관절·부위 자리·몸별 관절·앞뒤 순서·motionEdits). 고정 안 한 값이 있으면 `docs/design/rig-draft/editor-unfixed-<날짜>-<이름>.json` 으로 백업하고 사용자에게 알린 뒤 올린다.
- 편집기 올린 **뒤**: `python3 scripts/rig/tools/mark_editor.py` → 커밋·푸시.

## 2. '고정' 댓글 처리 ("고정: 편집기 값(서버 rig/fixed…)을 작업본에 넣어 주세요")
ArtifactData get `rig/fixed`(뱀 = `rig/fixed-serpent`, 짐승 = `rig/fixed-beast`) → `json` 칸을 파일로 → `python3 scripts/rig/apply_editor.py <파일>` → (길리안 hd 동작이면 `python3 scripts/rig/tools/creature_motions.py hd`, 고정한 트랙은 edited 표시로 유지) → `npx vitest run tests/rigDraft.test.ts tests/paperdoll.test.ts` → dev-log 작업본 줄 → 커밋 → 페이지 둘 다시 → mark_editor → 푸시 → 그 댓글 스레드에 답하고 resolve. 여러 번 누르면 마지막 것만.

## 3. 작업본 vs 게임 / 배포
- 모든 수정은 작업본 `docs/design/rig-draft/`(humanoid.json·motions.json·serpent.json·serpent-motions.json·beast.json·beast-motions.json·그림 폴더). 게임은 사용자가 "게임 넣어/게임에 반영/게임에 적용"이라고 할 때만: `python3 scripts/rig/promote.py`(사람형·뱀형 — 짐승형은 아직 게임에 없음, `-test` 외형 제외) → 패치 C.xxx(dev-log 소절, `src/version.ts` PATCH_LABEL, 기획이 바뀌면 GDD 장·버전) → `npm run typecheck`·`npx vitest run`·`npm run build`·`npm run balance:check`.
- **2026-11-12 부터 마스터 = 마스터AM**(session_01YVaigL3CXmHKgGoxWgP99u — 사용자 확인 2026-11-13 "am맞음"). 아래 '마스터AL' 은 마스터AM 으로 읽는다.
- **main 합치기·배포 = 마스터AL**(session_01YVaigHqv5N8mzeitzKf2jg): 작업 브랜치 푸시 → `send_message` 로 브랜치·HEAD·내용·검증 결과·"배포 끝나면 알려 달라" → 마스터가 fast-forward·배포 확인 후 알려 주면 사용자에게 전한다. 패치 번호·GDD 장 번호는 main 최신을 먼저 보고 다음 빈 번호(다른 세션과 겹치면 옮긴다).
- 커밋 꼬리: `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` + `Claude-Session: <이 세션 주소>`. 커밋·코드에 모델 이름 금지.

## 4. 다른 세션
- 마스터AL: 위. 기획·패치 총괄.
- 픽셀FX 담당(session_01YVaigFiaja9wMnt7JPXHNy, 브랜치 claude/loving-bohr-vqbu8d): 블록 도트 이펙트·연결 동작 빠르기(factions/*.json pixelFx)·**강적 강공격 빨간 세로**(C.372·373: `src/data/enemies/eliteHeavyFx.json` byBody — 덩치 humanoid/hb·외눈 길리안 humanoid/hd·뱀 serpent/ref). 새 강적 몸을 게임에 넣으면 byBody 줄을 그쪽에 부탁. 동작 속도·연결 동작 rate 를 건드릴 땐 그쪽과 먼저 맞춘다.

## 5. 엔진·도구 요점
- `src/data/art/rig/pose.ts`: 뼈대·동작 계산. `RIG_PACKS`(humanoid·serpent)·`rigPackOfLook`·`rigPack`, `Rig.motionSpeed`(1.5 — 키 시각 그대로, 재생기가 1.5배), 동작 묶음(sets·bodyMotions·resolveMotions), 늘어진 마디 `sway`, 색 외형 `artFolder`·`lookArt`.
- `src/ui/bha/rigAnim.ts`: 게임 동작 → 종이인형 동작(`RIG_ACTIONS`, 공격 없는 몸 = 박치기 `RIG_ACTION_FALLBACK`). `src/ui/bha/paperdoll.ts`: 시험 페이지 DOM 인형.
- `src/data/art/manifest.ts`: 그림 목록 — 호로 기본·덩치 적 = brute-*(2.1), 2단계 `char.hollow.2`·`skin.gillian` = gillian-base(2.3, 단계 외형 tierLooks "2"), 아쥬커스 뱀형 `skin.wyrm` = serpent-base(1.6), `SERPENT_ENEMIES`(롯팽 초록·마레하다 파랑), `GILLIAN_ENEMIES`(스티치마우스 = gillian-cyclops).
- 도구(`scripts/rig/`, 자세한 건 `scripts/rig/tools/README.md`): `assemble_parts.py`(사용자 부위 시트 → 몸, `docs/design/user-art/<…>-ref/assembly.json`, 뼈대 humanoid·serpent·beast), `recolor.py`(색 외형·`replace` 부위 바꿔 끼우기), `tools/creature_motions.py`(역관절 dg·덩치 hb·길리안 hd 동작 SPEC, SAME = 필살기 ← 해방1), `apply_editor.py`, `promote.py`, `still.py --rig`, `bone_guide.py`·`parts_sheet.py`·`guide.py`(시트), `tools/mark_editor.py`.
- 사용자 부위 시트를 받으면: 조각(이어진 덩어리)마다 오른쪽 위 참고 그림에서 색이 가장 많이 맞는 자리 → 몸 전체를 겹쳐 덜 다른 자리로 다듬기 → 관절 = 이웃 조각이 맞닿은 자리 가운데 → assembly.json → assemble_parts → 시트·캡처로 확인. 사용자가 편집기에서 위치 세부를 잡는다. 사용자가 편집기에서 받은 시트를 고쳐 보내면 그 시트와 원래 시트를 픽셀 비교해 바뀐 칸만 반영.

## 6. 지금 상태 (2026-11-11 01시)
- main = C.373(픽셀FX). 종이인형 패치: C.360(길리안 2단계·뱀 3색·뼈대 여럿), C.362(고정 03:36), C.368(동작 속도 1.5배·연결 동작 rate ÷1.5), C.371(외눈 길리안 = 강적 스티치마우스, 강적 강공격 세로 1차 — 이후 픽셀FX 가 맡음).
- 작업본에만: 115-A 102 짐승형 새 조각(브랜치 ccr-14d5b05b-vt28rc, 편집기·시험 페이지엔 올라가 있음 — 사용자가 위치 잡는 중). 115-A 101 가면 시도 4개(`docs/design/user-art/hood-ref/mask-trials-2026-11-10/`).
- 기획서 기록: 작업본 항목 = GDD 115-A(지금 102까지), 게임 패치 = 장(219·225·227 등), dev-log 작업본 줄은 'C.151 종이인형' 묶음 근처, 패치는 맨 끝 소절.
- 열린 것: 보스 강공격도 세로로 할지(미확인 — 지금은 강적만), 짐승형 위치 고정 대기, 짐승형은 게임 미사용.

- (2026-11-14) **편집기를 올리기 전에 `node scripts/rig/tools/editor-check.cjs $PWD/.rig-pages` 를 꼭 돌린다**(사용자 "툴 망가지는거 없나 체크해") — 실패하면 고친 뒤 올린다. 새 인형·동작을 넣었으면 `editor-shot.cjs` 로 그 외형 화면도 눈으로 본다.
- (2026-11-14) 대화 중간에 온 그림이 images 폴더에 안 떨어지면 대화 기록(.jsonl)의 base64 에서 꺼낸다 — 사용자에게 다시 보내 달라고 하지 않는다.
