# 프로젝트

블리치 할로우 어센션 (Bleach Hollow Ascension) — 블리치 세계관의 **호로** 또는 **사신**을 키우는 다마고치형 로그라이크 육성 게임. 둥지 → 루프 원정(지형 타일 배치) → 실시간 자동 전투 + 스킬 블록 체인(기획서 3-5) → 흡수(빌드) → 진화·승급. 호로판과 사신판은 엔진이 같고 종족 설정 파일(faction config)로만 달라진다.

- **기획서: `docs/GDD.md` (현재 v1.6).** 이 문서가 기준이다. 12장에 결정 기록과 변경 이력이 있다.
- **기획이 바뀌면 코드만 고치지 말고 기획서도 같이 수정하고 버전을 올린다**(v0.7 → v0.8, 12장에 기록).
- 개발 순서(로드맵)는 기획서 13장, 패치 기록은 `docs/dev-log.md`. 기획 문서는 `docs/GDD.md` 하나뿐이다.

## 반드시 지킬 것

1. **기획서의 [미정] 항목은 절대 임의로 정하지 않는다.** 구현에 필요하면 멈추고 사용자에게 질문한다. 단 12장에 "임시값 허용"으로 정한 것(11-3 흡수 계통·특성, 11-4 리스크 수치)은 `provisional` 표시를 붙인 임시 데이터로만 쓰고, 그것이 확정이라고 쓰지 않는다.
2. **종족별 분기를 코드에 하드코딩하지 않는다.** 항상 "이건 엔진인가, 종족 설정인가"를 구분한다. `if (faction === 'hollow')` 같은 코드 금지. 종족 차이는 `src/data/factions/*.json`에서 읽는다. 3번째 종족이 config 파일 하나로 추가되는 구조를 유지한다.
3. **적 체력·공격력은 절대값이 아니라 "플레이어 기본 공격 N회 분량"으로 정의한다**(`hpInAttacks`, `attackInAttacks`). 기획서 3-5의 목표(일반 적 약 45초, 강적 약 90초)와 임시값(일반 약 30회, 강적 약 70회 분량)을 밸런스 기준으로 쓴다.
4. **런 로그(기획서 9장)는 처음부터 저장 구조에 넣는다.** 히든 조건이 나중에 붙으므로 지금 안 남기면 못 붙인다. 구조는 `src/engine/runLog.ts`, 저장 구조는 `src/game.ts`.
5. **용어 표기는 기획서를 따른다**(웨코문도, 아쥬커스, 세군도 에타파, 레수렉시온 등).
6. **보고와 질문은 한국어로 한다.**
7. **UI는 `bha-` 클래스와 디자인 토큰으로만 꾸민다**(새 색·간격 임의 추가 금지, 부족하면 마스터에 제안).

## 기술 스택 (기획서 11-1, 12장 결정)

- 모바일 세로 기준 웹 게임, 한국어. Vite + TypeScript(strict), 화면은 외부 라이브러리 없이 DOM/CSS.
- 오프라인. 게임 실행 중 AI API 호출 없음. 테스트는 vitest.
- 배포: GitHub Pages(`.github/workflows/pages.yml`), https://atho3398.github.io/bleach-hollow-Ascension/

## 폴더 구조 (기획서 10장 기준)

```
docs/GDD.md          기획서 (유일한 기획 문서, 로드맵 포함)
docs/dev-log.md      패치 기록
docs/automation.md   세션 운영·모델 선택 규칙
src/engine/          루프, 전투(combat/, 고정 틱), 흡수, 리스크, 진화 판정, 런 로그 — 종족 무관 공통 로직
src/data/
  factions/          hollow.json, shinigami.json (티어명, 블록·역할 표시명, 리스크 게이지명, 슬롯 위치, 외형 변화, 등급 방식)
  enemies/           양쪽 공유 적 테이블
  traits/            흡수 특성 (표현 텍스트만 종족별 분리)
  tiles/             지형 타일 (종족별 스킨)
  titles/            등급·히든 등급·특별 태그 정의 + 조건 슬롯(조건은 미정, 구조만)
src/ui/bha/          디자인 시스템(토큰·테마·컴포넌트 CSS·아이콘 스프라이트·글꼴)과 공용 DOM 헬퍼 — 화면 전용 헬퍼는 src/ui/bha/<영역>.ts
docs/design/bha-design/  디자인 패키지 원본 (수정 금지, HANDOFF.md 부터 읽는다)
src/config/balance.ts  밸런스 수치 전부 (임시값은 provisional 구역)
src/game.ts          게임 상태·세이브 구조 (런 로그 포함)
src/version.ts       PATCH_LABEL / STAGE_LABEL
```

# 작업 규칙

- 모든 답변 맨 끝에 `명령 시각 / 답변 시각 / 걸린 시간`을 KST로 적는다(`TZ=Asia/Seoul date`, 턴 시작 직후와 답변 직전에 잰다). 세션 간 메시지에도 붙인다.
- 세션 운영·모델 선택(기본 Sonnet, 막힐 때만 Opus)·막혔을 때 규칙은 `docs/automation.md`를 따른다.
- 프로토타입(P1~P4.1: 원정 루프, 전투, 흡수, 리스크)은 구현 완료. **그 밖의 새 시스템(진화, 등급, 해방, 히든 등)은 사용자가 시작하라고 하기 전에는 구현하지 않는다**(기획서 13장 로드맵 기준).
- 패치할 때마다 배포까지 한다: 커밋·푸시 후 main 에 푸시하면 GitHub Actions(`.github/workflows/pages.yml`)가 타입체크·테스트·밸런스 점검·빌드 후 배포한다.
- 푸시 전에 `npm run typecheck`, `npm test` 를 통과시킨다. 밸런스 수치를 바꿨으면 `npm run balance` 결과도 보고한다.
- 패치마다 `PATCH_LABEL`(`src/version.ts`)을 `docs/dev-log.md`의 최신 소절 번호로, `STAGE_LABEL`을 기획서 13장 로드맵 표의 단계(예 `P1`)로 갱신한다.
- 밸런스 수치는 모두 `src/config/balance.ts` 에 둔다. 수치를 바꾸면 `BALANCE_VERSION` 을 올린다. 세이브 구조를 바꾸면 `src/game.ts` 의 `SAVE_FORMAT_VERSION` 을 올리고 기존 세이브가 열리게 마이그레이션한다.
