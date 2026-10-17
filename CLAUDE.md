# 작업 규칙

- 사용자에게 하는 보고와 답변은 모두 한국어로 한다.
- 모든 답변 맨 끝에 `명령 시각 / 답변 시각 / 걸린 시간`을 KST로 적는다(`TZ=Asia/Seoul date`, 턴 시작 직후와 답변 직전에 잰다). 세션 간 메시지에도 붙인다.
- 세션 운영·모델 선택·막혔을 때 규칙은 `docs/automation.md`를 따른다.
- 패치할 때마다 배포까지 한다: 작업 브랜치에 커밋·푸시한 뒤 main 에도 푸시한다. main 에 푸시하면 GitHub Actions(`.github/workflows/pages.yml`)가 타입체크·테스트·밸런스 점검·빌드 후 https://atho3398.github.io/bleach-hollow-ascension/ 로 배포한다.
- 푸시 전에 `npm run typecheck`, `npm test` 를 통과시킨다. 밸런스 수치를 바꿨으면 `npm run balance` 결과도 보고한다.
- 패치마다 `PATCH_LABEL`(`src/version.ts`)을 그 패치의 부록 C 소절 번호로 갱신한다.
- 패치마다 `STAGE_LABEL`(`src/version.ts`, 예 `'1단계'`)을 기획서 17번 표의 단계 번호로 갱신한다(게임 화면 버전 표시에 같이 보인다).

# 프로젝트 안내

- 프로젝트: 블리치 할로우 어센션 (Bleach Hollow Ascension). 가벼운 웹 게임, 한국어, 폰·PC 브라우저.
- 기획서: `docs/game-design.md`. 개발 순서와 현황은 17번(로드맵), 구현 결과 기록은 부록 C, 설정 분리 원칙은 부록 A.
- 밸런스 수치는 모두 `src/config/balance.ts` 에 둔다. 수치를 바꾸면 `BALANCE_VERSION` 을 올린다. 세이브 구조를 바꾸면 `src/game.ts` 의 `SAVE_FORMAT_VERSION` 을 올리고 기존 세이브가 열리게 마이그레이션한다.
- 게임 실행 중 AI API 호출은 없다. 전부 순수 코드(오프라인, 서버 없음).
