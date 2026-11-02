@echo off
chcp 65001 >nul
REM 검수 프로토콜 폴더를 이 파일 위에 끌어다 놓으면 게임 폴더에 합친다.
if "%~1"=="" (
  set /p SRC=프로토콜 폴더 경로를 붙여넣고 Enter: 
) else (
  set SRC=%~1
)
node "%~dp0merge-protocol.cjs" "%SRC%"
pause
