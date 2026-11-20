# 캡처 폴더

- 패치 확인 캡처(`c<패치 번호>/`)는 git 에 두되, 트리에는 **최근 10패치 폴더만** 남긴다(`docs/automation.md` 5장, 점검A ⑪).
- 옛 폴더는 정리 때 `git rm -r` 로 지웠다(2026-11-20 코딩325: c498 이전 폴더 전부와 audit·art·review 등 이름 폴더·낱장 파일 428개). 기록은 git 이력에 남아 있다 — 꺼낼 때는 `git log --diff-filter=D --oneline -- docs/captures/<폴더>` 로 지운 커밋을 찾고 `git show <커밋>^:docs/captures/<폴더>/<파일> > 파일` 또는 `git checkout <커밋>^ -- docs/captures/<폴더>`.
- 테스트가 읽는 실측 파일(c256·c474·c475 `proof.json`, c64 `test-art/`)은 `tests/fixtures/captures/` 로 옮겼다. 증명 스크립트를 다시 돌려 `proof.json` 을 새로 만들면 그 파일도 같이 바꾼다.
