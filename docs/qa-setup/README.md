# 검수 프로토콜 합치기 (사용자용)

검수 프로토콜 폴더(.claude/ · CLAUDE.md · project.yaml 이 든 폴더)를 이 게임 폴더에 **덮어쓰지 않고** 합친다.
main 은 그대로 두고 새 브랜치 `qa-review` 에서만 바뀐다.

1. 최신 게임 받기: https://github.com/ATho3398/bleach-hollow-Ascension/archive/refs/heads/main.zip (zip 받아 압축 풀기 — 폴더 이름 bleach-hollow-Ascension-main). git 쓰면 `git clone https://github.com/ATho3398/bleach-hollow-Ascension.git`
2. **윈도우**: `docs/qa-setup/qa-setup.bat` 위에 프로토콜 폴더를 끌어다 놓는다(또는 더블클릭 후 경로 붙여넣기).
   **맥·리눅스**: `sh docs/qa-setup/qa-setup.sh <프로토콜 폴더>`
3. 끝나면 게임 폴더에서 Claude Code 를 새로 켠다.

- 합치는 규칙: 없는 파일은 복사 · 같은 이름 json(settings.json 등)은 합침(값이 다르면 프로토콜 값) · 같은 이름 다른 파일은 원본을 `.game-backup` 으로 남김 · 프로토콜 CLAUDE.md 는 `QA-PROTOCOL.md` 로 두고 게임 CLAUDE.md 끝에서 불러온다.
- 되돌리기: `git checkout main` (qa-review 브랜치만 지우면 흔적 없음: `git branch -D qa-review`).
- 필요한 것: Node.js(게임 개발에 이미 씀), git.
