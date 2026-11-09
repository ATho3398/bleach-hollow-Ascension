# 종이인형 작업 도구 (GDD 115-A)

작업본 = `docs/design/rig-draft/` (뼈대 `humanoid.json`·`beast.json`·`serpent.json`, 동작 `motions.json`·`<뼈대>-motions.json`, 그림 `<뼈대>/…`).
게임본(`src/data/art/rig/`)에는 사용자가 "게임 넣어"라고 할 때만 `scripts/rig/promote.py` 로 옮기고, main 반영은 마스터 세션이 한다.

## 페이지 (Artifact)

| 페이지 | 주소 | 데이터 |
|---|---|---|
| 관절 편집기 | https://claude.ai/artifact/9GzByhNrUmxaZfn7tgYfP7 | db `rig/editor`(편집 중)·`rig/fixed`(고정) — 짐승·뱀은 `rig/editor-beast`·`rig/fixed-beast` 등 |
| 시험 페이지 | https://claude.ai/artifact/42DLdjssrAnZP1wFshLbvx | 없음(작업본을 그대로 보여 줌) |

- 만들기: `bash scripts/rig/tools/build_pages.sh [출력 폴더]` (기본 `.rig-pages/`, git 에 안 올림) → 두 html 을 Artifact 로 같은 주소에 다시 올린다.
- 템플릿: `rig-editor.template.html`·`paperdoll-test.template.html` (그림 표 `ART_MAP`·스크립트 자리만 비움). 편집기 코드 = `scripts/rig/editor-page.ts`, 시험 페이지 코드 = `doll-entry.ts`.
- **편집기를 다시 올리기 전에** db `rig/editor` 를 읽어 `rig/fixed` 와 다르면(고정 안 한 값) 올리지 않는다 — 데이터 도장이 바뀌면 편집기가 초기화돼 그 값이 날아감.
- **편집기를 다시 올렸으면** 바로 `python3 scripts/rig/tools/mark_editor.py` → `docs/design/rig-draft/editor-page.json`(그 페이지를 만든 커밋)을 커밋·푸시. 페이지는 커밋한 작업본으로 만든다(GDD 115-A 60).

## 고정 처리 ("고정: 편집기 값(서버 rig/fixed)을 작업본에 넣어 주세요" 댓글)

1. ArtifactData 로 `rig/fixed` 를 받아 `json` 필드를 파일로 → `python3 scripts/rig/apply_editor.py <파일>`
   - 관절·부위 자리·기본 각도·앞뒤 순서 + `motionEdits`('<동작 묶음>/<동작>' → 뼈 트랙)를 작업본에 넣는다.
   - 편집기에서 고친 항목만 넣는다(편집기 값 ≠ `docs/design/rig-draft/editor-page.json` 커밋 데이터, GDD 115-A 60).
   - 알몸에서 고친 항목은 같은 성별 몸 전부에 그대로 덮는다(`body_sync.py`). 같은 고정에서 캐릭터 몸을 따로 고친 항목은 그 몸 값 유지.
2. `npx vitest run tests/rigDraft.test.ts` → 커밋·푸시 → 페이지 다시 만들어 올림 → 댓글에 답하고 닫기.
3. 사용자가 몇 초 간격으로 고정을 여러 번 누르면 마지막 고정만 넣으면 된다(상태 전체가 들어 있음).

## 규칙 (사용자 지시)

- 남녀 알몸이 기준(GDD 115-A 60): 남자 알몸(`bare`)의 관절 자리·기본 각도·동작 각도 = 사신·영술원 학생·아란칼, 여자 알몸(`female`) = 사신(여)·영술원 학생(여)·아란칼(여). **숫자 그대로 복사**(몸 그림 차이 계산 안 함, 해방·필살기 포함). 외형 층 관절(머리카락·뒷머리·망토)과 부위 그림 자리는 몸마다. 캐릭터별로 이상하면 사용자가 그 캐릭터만 따로 잡는다. 통째 복사: `python3 scripts/rig/body_sync.py <bare|female>`.
- 새 동작은 알몸·아란칼(여) 기준으로 짠다(팔이 잘려 보이지 않게).
- 이펙트는 쓰지 않는다(데이터에서 지움, 엔진 그리기만 남김). [미정] 은 정하지 않는다.

## 계산·확인 도구 (`cd scripts/rig/tools` 에서 실행 — 작업본은 절대 경로 /home/user/bleach-hollow-Ascension 로 읽음)

| 파일 | 하는 일 |
|---|---|
| `kin.py` | 사람형 뼈 행렬·칼 방향(`sword_dir`)·관절 위치 |
| `rr.py` | 자세 그리기: `python3 rr.py <동작 json> <외형> <out.png> t1 t2 …` |
| `ultall.py` | 외형 8개 × 시각 그림: `python3 ultall.py <동작> <t,…> <out.png>` (몸 묶음 반영) |
| `hang.py` | 몸마다 오른팔 쉬는 방향 비교(팔 방향 맞추기 계산의 바탕) |
| `ultik.py`·`ultfix2.py` | 두 관절 팔 각도 풀이(필살기 당김 자세에서 손을 칼집에 붙이기) |
| `rel_copy.py` | 아란칼(여) 해방(release1)을 다른 몸에(두 팔·칼 방향 맞춤) |
| `mark_editor.py` | 편집기를 다시 올린 뒤 그 페이지를 만든 커밋을 `editor-page.json` 에 적음 |
| `check-editor.cjs` | 편집기 html 을 playwright 로 열어 기본 각도·'이 동작에만' 저장 확인 |
| `shot.cjs`·`cap-one.mjs`·`sheet.py` | 페이지 캡처·한 외형 캡처(`#manual=1&look=`)·시트 |

## 마디·색 그림 (`scripts/rig/`)

- `split_chain.py`: 뒷머리·망토를 가로 띠 마디로 나눔(GDD 115-A 88). 원본 그림은 `segmentSrc` — 원본을 바꿨으면 그 외형의 segmentSrc 를 지우고 다시 돌린다. 따라가기 값은 뼈대 데이터 `sway`.
- `recolor.py`: 색 외형 그림(GDD 115-A 85) — 원본 부위 그림을 바꾸면 다시 돌린다.
