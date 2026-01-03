@echo off
setlocal EnableExtensions

cd /d "%~dp0"

set "PAUSE_AT_END=1"
if "%TOKEI_NO_PAUSE%"=="1" set "PAUSE_AT_END=0"
for %%A in (%*) do (
  if /I "%%~A"=="--no-pause" set "PAUSE_AT_END=0"
)

where node >nul 2>&1
if errorlevel 1 (
  echo.
  echo Node.js was not found in PATH.
  echo Install Node.js ^(18+ recommended^) and re-run Setup-Environment.bat.
  pause
  exit /b 1
)

node ui\tokei_ui.mjs
set "EXITCODE=%ERRORLEVEL%"
if "%PAUSE_AT_END%"=="1" (
  echo.
  pause
)

endlocal & exit /b %EXITCODE%

